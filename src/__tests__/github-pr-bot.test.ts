import { describe, expect, test, beforeEach } from "bun:test";
import {
  dispatchInvalidationAlert,
  evaluateAndPersistMetricUpdate,
  getAllArtifactsWithRelations,
  getAllInvalidationEvents,
  resetDatabaseToSeed,
} from "../db";
import {
  formatTeardownBranchName,
  generateGhCliCommand,
  generateTeardownPrBody,
  publishGitHubPullRequest,
} from "../lib/github-pr-bot";

describe("Horizon B: Autonomous GitHub PR Bot & Branching Workflow", () => {
  beforeEach(() => {
    resetDatabaseToSeed();
  });

  test("formatTeardownBranchName standardizes and sanitizes artifact branches", () => {
    expect(formatTeardownBranchName("art-adr-014")).toBe(
      "premise/teardown-adr-014"
    );
    expect(formatTeardownBranchName("VENDOR-04")).toBe(
      "premise/teardown-vendor-04"
    );
    expect(formatTeardownBranchName("PR #892: Multi-Provider")).toBe(
      "premise/teardown-pr--892--multi-provider"
    );
  });

  test("generateTeardownPrBody produces rich Markdown with telemetry drift, locus, and checklist", () => {
    // Breach ADR-014 to generate an invalidation event
    evaluateAndPersistMetricUpdate({
      variableName: "upstream_llm_input_cost_usd",
      value: 1.15,
      source: "test-eval",
    });

    const events = getAllInvalidationEvents();
    const event = events.find(
      (e) => e.variableName === "upstream_llm_input_cost_usd"
    );
    expect(event).toBeDefined();

    const allArts = getAllArtifactsWithRelations();
    const adr = allArts.find((a) => a.id === "art-adr-014");

    const markdown = generateTeardownPrBody({
      event: event!,
      artifact: adr,
      repo: "acme/ai-platform",
    });

    expect(markdown).toContain("[PREMISE KILL-SWITCH] Automated Teardown");
    expect(markdown).toContain("upstream_llm_input_cost_usd");
    expect(markdown).toContain("1.15");
    expect(markdown).toContain("semantic-cache.ts");
    expect(markdown).toContain("Multi-Hop Cascade Blast Radius");
    expect(markdown).toContain("Architecture Council Teardown Checklist");
    expect(markdown).toContain("bun ./bin/premise-cli.ts check --strict");
  });

  test("generateGhCliCommand formats valid gh command", () => {
    const cmd = generateGhCliCommand({
      title: "chore(teardown): remove semantic cache",
      bodyMarkdown: "Teardown body",
      branchName: "premise/teardown-adr-014",
      baseBranch: "main",
      repo: "org/core-monorepo",
    });

    expect(cmd).toContain("gh pr create");
    expect(cmd).toContain('--title "chore(teardown): remove semantic cache"');
    expect(cmd).toContain('--head "premise/teardown-adr-014"');
    expect(cmd).toContain('--base "main"');
  });

  test("publishGitHubPullRequest returns valid staged PR package in dry-run mode", async () => {
    evaluateAndPersistMetricUpdate({
      variableName: "upstream_llm_input_cost_usd",
      value: 1.25,
      source: "test-eval",
    });

    const events = getAllInvalidationEvents();
    const event = events[0];
    expect(event).toBeDefined();

    const prResult = await publishGitHubPullRequest({
      eventId: event.id,
      event,
      repo: "my-org/backend-repo",
      headBranch: "premise/teardown-adr-014",
      dryRun: true,
    });

    expect(prResult.ok).toBe(true);
    expect(prResult.status).toBe("DRY_RUN");
    expect(prResult.isDryRun).toBe(true);
    // Nothing was sent, so there is no PR number and no link
    expect(prResult.prNumber).toBeNull();
    expect(prResult.prUrl).toBeNull();
    expect(prResult.bodyMarkdown.length).toBeGreaterThan(100);
    expect(prResult.branchName).toBe("premise/teardown-adr-014");
    expect(prResult.compareUrl).toContain("compare/main...premise/teardown-adr-014");
    expect(prResult.ghCliCommand).toContain("gh pr create");
  });

  test("publishGitHubPullRequest returns FAILED with GitHub's real error", async () => {
    evaluateAndPersistMetricUpdate({
      variableName: "upstream_llm_input_cost_usd",
      value: 0.95,
      source: "test-eval",
    });
    const event = getAllInvalidationEvents()[0];
    const origFetch = globalThis.fetch;
    try {
      globalThis.fetch = (async () =>
        new Response('{"message":"Bad credentials"}', { status: 401 })) as unknown as typeof fetch;
      const prResult = await publishGitHubPullRequest({
        eventId: event.id,
        event,
        repo: "my-org/backend-repo",
        githubToken: "test-token-not-real",
        dryRun: false,
      });
      expect(prResult.ok).toBe(false);
      expect(prResult.status).toBe("FAILED");
      expect(prResult.prNumber).toBeNull();
      expect(prResult.prUrl).toBeNull();
      expect(prResult.error).toContain("401");
      expect(prResult.error).toContain("Bad credentials");
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test("dispatchInvalidationAlert with GITHUB_PR integrates with PR bot and logs in SQLite", async () => {
    evaluateAndPersistMetricUpdate({
      variableName: "upstream_llm_input_cost_usd",
      value: 0.95,
      source: "test-eval",
    });

    const events = getAllInvalidationEvents();
    const event = events.find((e) => e.artifactId === "art-adr-014");
    expect(event).toBeDefined();

    const dispatchRes = await dispatchInvalidationAlert({
      eventId: event!.id,
      channel: "GITHUB_PR",
      repo: "custom-org/core-services",
      dryRun: true,
    });

    expect(dispatchRes.dispatchLog).toBeDefined();
    expect(dispatchRes.dispatchLog.channel).toBe("GITHUB_PR");
    expect(dispatchRes.dispatchLog.targetEndpoint).toContain(
      "api.github.com/repos/custom-org/core-services/pulls"
    );
    expect(dispatchRes.prResult).toBeDefined();
    expect(dispatchRes.prResult?.branchName).toBe("premise/teardown-adr-014");
    expect(dispatchRes.prResult?.isDryRun).toBe(true);
    expect(dispatchRes.dispatchLog.deliveryStatus).toBe("DRY_RUN");
    expect(dispatchRes.dispatchLog.externalUrl).toBe("");
    expect(dispatchRes.dispatchLog.summary).toContain("Dry run: nothing was sent");

    // Verify it is persisted in SQLite
    const updatedEvents = getAllInvalidationEvents();
    const targetEv = updatedEvents.find((e) => e.id === event!.id);
    expect(targetEv?.dispatchLogs?.length).toBeGreaterThanOrEqual(1);
    expect(targetEv?.dispatchLogs?.[0].channel).toBe("GITHUB_PR");
  });
});
