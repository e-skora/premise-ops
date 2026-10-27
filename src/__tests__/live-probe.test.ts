import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  executeActiveProbes,
  getAllArtifactsWithRelations,
  resetDatabaseToSeed,
  updatePremiseAndProbeConfig,
} from "../db/index";
import {
  OPENROUTER_MODELS_URL,
  clearLiveFeedCache,
  isLiveSource,
  liveSourceUrl,
} from "../lib/live-feeds";
import { PremiseRecord } from "../lib/types";
import { compareBrokenToExpected } from "../lib/expected-outcome";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Read-only: the saved OpenRouter copy that CI uses
const FIXTURE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../examples/fixtures/live-feeds"
);

const LIVE_PREMISE = "prem-adr-014-cost";

function premise(id: string): PremiseRecord {
  const p = getAllArtifactsWithRelations()
    .flatMap((a) => a.premises)
    .find((x) => x.id === id);
  if (!p) throw new Error(`premise ${id} missing`);
  return p;
}

function openRouterBody(prompt: string | null) {
  return {
    data: [
      { id: "openai/other-model", pricing: { prompt: "0.000009" } },
      ...(prompt === null
        ? []
        : [{ id: "anthropic/claude-sonnet-5.5", pricing: { prompt, completion: "0.00001" } }]),
    ],
  };
}

let originalFetch: typeof fetch;
let calls: string[];

function mockFetch(respond: (url: string) => Response) {
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    calls.push(url);
    return respond(url);
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  originalFetch = globalThis.fetch;
  calls = [];
  clearLiveFeedCache();
  delete process.env.PREMISE_PUBLIC_DEMO;
  delete process.env.PREMISE_FEED_FIXTURE_DIR;
  resetDatabaseToSeed();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.PREMISE_PUBLIC_DEMO;
  delete process.env.PREMISE_FEED_FIXTURE_DIR;
  clearLiveFeedCache();
});

describe("Live OpenRouter probe on ADR-014", () => {
  test("starts with no value until the first real fetch", () => {
    const p = premise(LIVE_PREMISE);
    expect(p.currentValue).toBe("");
    expect(p.status).toBe("UNBOUND");
    expect(p.valueSource ?? null).toBeNull();
    expect(p.metricSamples?.length ?? 0).toBe(0);
    expect(p.probes[0].targetUrlOrQuery).toBe(OPENROUTER_MODELS_URL);
    expect(p.probes[0].valueMultiplier).toBe(1_000_000);
  });

  test("reads pricing.prompt, multiplies to USD per 1M tokens and records the fetch time", async () => {
    mockFetch(() => Response.json(openRouterBody("0.0000025")));
    const before = Date.now();
    await executeActiveProbes({ premiseId: LIVE_PREMISE });

    const p = premise(LIVE_PREMISE);
    expect(calls).toEqual([OPENROUTER_MODELS_URL]);
    expect(p.currentValue).toBe("2.5");
    expect(p.status).toBe("VALID");
    expect(isLiveSource(p.valueSource)).toBe(true);
    expect(liveSourceUrl(p.valueSource)).toBe(OPENROUTER_MODELS_URL);
    expect(new Date(p.valueObservedAt!).getTime()).toBeGreaterThanOrEqual(before - 5);
    expect(p.probes[0].lastError).toBeNull();
  });

  test("exactly $2.00 breaks a '> $2.00' premise", async () => {
    mockFetch(() => Response.json(openRouterBody("0.000002")));
    await executeActiveProbes({ premiseId: LIVE_PREMISE });
    const p = premise(LIVE_PREMISE);
    expect(p.currentValue).toBe("2");
    expect(p.status).toBe("BROKEN");
  });

  test("a failed request keeps the last real value and its time, and shows the real error", async () => {
    mockFetch(() => Response.json(openRouterBody("0.0000025")));
    await executeActiveProbes({ premiseId: LIVE_PREMISE });
    const good = premise(LIVE_PREMISE);

    clearLiveFeedCache();
    mockFetch(() => new Response("upstream unavailable", { status: 503 }));
    await executeActiveProbes({ premiseId: LIVE_PREMISE });

    const after = premise(LIVE_PREMISE);
    expect(after.currentValue).toBe("2.5");
    expect(after.valueObservedAt).toBe(good.valueObservedAt);
    expect(after.valueSource).toBe(good.valueSource);
    expect(after.probes[0].lastError).toContain("HTTP 503");
  });

  test("a missing model entry is reported, never replaced with a number", async () => {
    mockFetch(() => Response.json(openRouterBody(null)));
    await executeActiveProbes({ premiseId: LIVE_PREMISE });
    const p = premise(LIVE_PREMISE);
    expect(p.currentValue).toBe("");
    expect(p.status).toBe("UNBOUND");
    expect(p.probes[0].lastError).toContain("Field not found");
  });

  test("the response is cached for 10 minutes", async () => {
    mockFetch(() => Response.json(openRouterBody("0.0000025")));
    await executeActiveProbes({ premiseId: LIVE_PREMISE });
    await executeActiveProbes({ premiseId: LIVE_PREMISE });
    expect(calls.length).toBe(1);
  });
});

describe("Public demo outside-fetch allowlist", () => {
  test("the OpenRouter URL is still fetched in the public demo", async () => {
    process.env.PREMISE_PUBLIC_DEMO = "1";
    mockFetch(() => Response.json(openRouterBody("0.0000025")));
    await executeActiveProbes({ premiseId: LIVE_PREMISE });
    expect(calls).toEqual([OPENROUTER_MODELS_URL]);
    expect(premise(LIVE_PREMISE).currentValue).toBe("2.5");
  });

  test("any other outside URL is blocked and the value is left alone", async () => {
    const target = premise("prem-gtm-q3-cac");
    updatePremiseAndProbeConfig({
      premiseId: target.id,
      operator: target.operator,
      thresholdValue: target.thresholdValue,
      decayWarningMargin: target.decayWarningMargin,
      targetUrlOrQuery: "https://example.com/metrics.json",
      jsonPath: "$.value",
    });

    process.env.PREMISE_PUBLIC_DEMO = "1";
    mockFetch(() => Response.json({ value: 1 }));
    await executeActiveProbes({ premiseId: target.id });

    const after = premise(target.id);
    expect(calls).toEqual([]);
    expect(after.currentValue).toBe(target.currentValue);
    expect(after.probes[0].lastError).toContain("Blocked in the public demo");
  });

  test("an allowlist lookalike is blocked too (exact match only)", async () => {
    const target = premise("prem-gtm-q3-cac");
    updatePremiseAndProbeConfig({
      premiseId: target.id,
      operator: target.operator,
      thresholdValue: target.thresholdValue,
      decayWarningMargin: target.decayWarningMargin,
      targetUrlOrQuery: `${OPENROUTER_MODELS_URL}?x=1`,
    });
    process.env.PREMISE_PUBLIC_DEMO = "1";
    mockFetch(() => Response.json(openRouterBody("0.0000025")));
    await executeActiveProbes({ premiseId: target.id });
    expect(calls).toEqual([]);
  });
});

describe("Offline feed mode for CI (saved OpenRouter copy)", () => {
  test("reads the saved copy, never the network, and labels it saved", async () => {
    process.env.PREMISE_FEED_FIXTURE_DIR = FIXTURE_DIR;
    mockFetch(() => {
      throw new Error("network must not be used in offline feed mode");
    });
    await executeActiveProbes({ premiseId: LIVE_PREMISE });

    const p = premise(LIVE_PREMISE);
    expect(calls).toEqual([]);
    expect(p.currentValue).toBe("2");
    expect(p.status).toBe("BROKEN");
    expect(p.valueSource).toBe(`saved:${OPENROUTER_MODELS_URL}`);
    expect(isLiveSource(p.valueSource)).toBe(false);
    expect(p.valueObservedAt).toBe("2026-10-27T02:38:57.000Z");
  });

  test("a URL with no saved copy is an error, not a number", async () => {
    const target = premise("prem-gtm-q3-cac");
    updatePremiseAndProbeConfig({
      premiseId: target.id,
      operator: target.operator,
      thresholdValue: target.thresholdValue,
      decayWarningMargin: target.decayWarningMargin,
      targetUrlOrQuery: "https://example.com/metrics.json",
    });
    process.env.PREMISE_FEED_FIXTURE_DIR = FIXTURE_DIR;
    await executeActiveProbes({ premiseId: target.id });
    const after = premise(target.id);
    expect(after.currentValue).toBe(target.currentValue);
    expect(after.probes[0].lastError).toContain("no saved copy");
  });
});

describe("check --expect-broken", () => {
  const broken = [{ id: "prem-adr-014-cost", variableName: "upstream_llm_input_cost_usd" }];

  test("passes when exactly the expected premises are broken (by id or variable)", () => {
    expect(compareBrokenToExpected(broken, ["upstream_llm_input_cost_usd"]).ok).toBe(true);
    expect(compareBrokenToExpected(broken, ["prem-adr-014-cost"]).ok).toBe(true);
  });

  test("fails when an expected premise holds or another one breaks", () => {
    expect(compareBrokenToExpected([], ["upstream_llm_input_cost_usd"])).toEqual({
      ok: false,
      missing: ["upstream_llm_input_cost_usd"],
      unexpected: [],
    });
    const extra = [...broken, { id: "prem-gtm-q3-cac", variableName: "blended_search_cac_usd" }];
    expect(compareBrokenToExpected(extra, ["upstream_llm_input_cost_usd"])).toEqual({
      ok: false,
      missing: [],
      unexpected: ["prem-gtm-q3-cac"],
    });
  });
});
