import fs from "node:fs";
import path from "node:path";
import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { NextRequest } from "next/server";
import { GET as connectorsGet, POST as connectorsPost } from "../app/api/connectors/route";
import { GET as locusGet, POST as locusPost } from "../app/api/locus/route";
import { GET as scannerGet, POST as scannerPost } from "../app/api/scanner/scan/route";
import { GET as stateGet } from "../app/api/state/route";
import { POST as metricPost } from "../app/api/webhooks/metric/route";
import { POST as dispatchPost } from "../app/api/dispatch/route";
import {
  MAX_SANDBOXES,
  SANDBOX_TTL_MS,
  pruneSandboxes,
  resolveSandboxDir,
} from "../lib/demo-sandbox";
import { DecisionArtifactRecord } from "../lib/types";

const VISITOR_A = "11111111-1111-4111-8111-111111111111";
const VISITOR_B = "22222222-2222-4222-8222-222222222222";

function request(
  url: string,
  options: { method?: string; body?: unknown; sandboxId?: string } = {}
) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (options.sandboxId) headers.cookie = `premise_sandbox=${options.sandboxId}`;
  return new NextRequest(`http://localhost${url}`, {
    method: options.method || "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

function llmCostFor(artifacts: DecisionArtifactRecord[]): string | undefined {
  return artifacts
    .flatMap((a) => a.premises)
    .find((p) => p.variableName === "upstream_llm_input_cost_usd")?.currentValue;
}

describe("Public demo mode (PREMISE_PUBLIC_DEMO=1)", () => {
  beforeAll(() => {
    process.env.PREMISE_PUBLIC_DEMO = "1";
  });

  afterAll(() => {
    delete process.env.PREMISE_PUBLIC_DEMO;
  });

  describe("blocked routes return 403", () => {
    test("connector save and test are disabled", async () => {
      const empty = await connectorsPost(
        request("/api/connectors", { method: "POST", body: {}, sandboxId: VISITOR_A })
      );
      expect(empty.status).toBe(403);

      for (const action of ["save", "test"]) {
        const res = await connectorsPost(
          request("/api/connectors", {
            method: "POST",
            body: { action, connectorType: "PROMETHEUS", config: { baseUrl: "http://evil.test" } },
            sandboxId: VISITOR_A,
          })
        );
        expect(res.status).toBe(403);
        expect(await res.json()).toEqual({ error: "Disabled in public demo" });
      }
    });

    test("locus apply and rollback are disabled, preview stays available", async () => {
      for (const action of ["apply", "rollback"]) {
        const res = await locusPost(
          request("/api/locus", {
            method: "POST",
            body: { action, targetLocus: "x" },
            sandboxId: VISITOR_A,
          })
        );
        expect(res.status).toBe(403);
        expect(await res.json()).toEqual({ error: "Disabled in public demo" });
      }

      const preview = await locusGet(request("/api/locus", { sandboxId: VISITOR_A }));
      expect(preview.status).toBe(200);
    });

    test("repo scanner only scans the bundled demo repo", async () => {
      const foreignGet = await scannerGet(
        request("/api/scanner/scan?target=github.com/someone/private-repo", {
          sandboxId: VISITOR_A,
        })
      );
      expect(foreignGet.status).toBe(403);

      const foreignPost = await scannerPost(
        request("/api/scanner/scan", {
          method: "POST",
          body: { action: "scan", repoTarget: "/etc" },
          sandboxId: VISITOR_A,
        })
      );
      expect(foreignPost.status).toBe(403);

      const bundled = await scannerGet(
        request("/api/scanner/scan?target=github.com/company/core-monorepo", {
          sandboxId: VISITOR_A,
        })
      );
      expect(bundled.status).toBe(200);
    });

    test("dispatch is forced to dry run, even when a real send is requested", async () => {
      await metricPost(
        request("/api/webhooks/metric", {
          method: "POST",
          body: { variableName: "upstream_llm_input_cost_usd", value: 1.25 },
          sandboxId: VISITOR_A,
        })
      );
      const stateRes = await stateGet(request("/api/state", { sandboxId: VISITOR_A }));
      const state = await stateRes.json();
      const event = state.invalidationEvents[0];
      expect(event).toBeDefined();

      const res = await dispatchPost(
        request("/api/dispatch", {
          method: "POST",
          body: {
            eventId: event.id,
            channel: "GITHUB_PR",
            githubToken: "ghp_not_a_real_token",
            dryRun: false,
          },
          sandboxId: VISITOR_A,
        })
      );
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.prResult.isDryRun).toBe(true);
      expect(body.prResult.commitSha).toBeNull();
    });

    test("seeded connectors show as demo placeholders, not configured", async () => {
      const res = await connectorsGet(request("/api/connectors", { sandboxId: VISITOR_A }));
      const body = await res.json();
      expect(body.connectors.length).toBe(4);
      for (const c of body.connectors) {
        expect(c.isConfigured).toBe(false);
        expect(c.isDemoPlaceholder).toBe(true);
        expect(c.summary).toContain("Demo placeholder");
      }
    });
  });

  describe("per-visitor sandboxes", () => {
    test("two different cookies get separate state", async () => {
      const before = llmCostFor(
        (await (await stateGet(request("/api/state", { sandboxId: VISITOR_B }))).json()).artifacts
      );

      await metricPost(
        request("/api/webhooks/metric", {
          method: "POST",
          body: { variableName: "upstream_llm_input_cost_usd", value: 9.99 },
          sandboxId: VISITOR_A,
        })
      );

      const visitorA = llmCostFor(
        (await (await stateGet(request("/api/state", { sandboxId: VISITOR_A }))).json()).artifacts
      );
      const visitorB = llmCostFor(
        (await (await stateGet(request("/api/state", { sandboxId: VISITOR_B }))).json()).artifacts
      );

      expect(Number(visitorA)).toBe(9.99);
      expect(visitorB).toBe(before);
      expect(Number(visitorB)).not.toBe(9.99);
    });

    test("a visitor without a cookie is given a fresh sandbox cookie", async () => {
      const res = await stateGet(request("/api/state"));
      expect(res.status).toBe(200);
      const setCookie = res.headers.get("set-cookie") || "";
      expect(setCookie).toContain("premise_sandbox=");
      expect(setCookie).toContain("HttpOnly");
    });

    test("pruning removes sandboxes older than 24h and caps the total", () => {
      // Own folder, so sandboxes created by the tests above do not interfere
      const sharedDir = resolveSandboxDir();
      process.env.PREMISE_SANDBOX_DIR = path.join(sharedDir, "prune-test");
      const dir = resolveSandboxDir();
      fs.mkdirSync(dir, { recursive: true });
      const now = Date.now();
      const ids = [
        "aaaaaaaa-0000-4000-8000-000000000001",
        "aaaaaaaa-0000-4000-8000-000000000002",
        "aaaaaaaa-0000-4000-8000-000000000003",
      ];
      const ages = [SANDBOX_TTL_MS + 60_000, 120_000, 60_000];
      ids.forEach((id, i) => {
        const file = path.join(dir, `${id}.db`);
        fs.writeFileSync(file, "");
        const t = (now - ages[i]) / 1000;
        fs.utimesSync(file, t, t);
      });

      pruneSandboxes(MAX_SANDBOXES, now);
      expect(fs.existsSync(path.join(dir, `${ids[0]}.db`))).toBe(false);
      expect(fs.existsSync(path.join(dir, `${ids[1]}.db`))).toBe(true);

      const remaining = fs.readdirSync(dir).filter((n) => /^[0-9a-f-]{36}\.db$/.test(n));
      pruneSandboxes(1, now);
      const afterCap = fs.readdirSync(dir).filter((n) => /^[0-9a-f-]{36}\.db$/.test(n));
      expect(remaining.length).toBeGreaterThan(1);
      expect(afterCap.length).toBe(1);
      // Newest survives the cap
      expect(afterCap).toContain(`${ids[2]}.db`);
      process.env.PREMISE_SANDBOX_DIR = sharedDir;
    });
  });
});
