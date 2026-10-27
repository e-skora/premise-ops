import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  convertDiscoveredToCompiledOutput,
  scanWorkspaceForPremises,
} from "../lib/codebase-scanner";
import {
  executeActiveProbes,
  getAllArtifactsWithRelations,
  insertCompiledArtifact,
} from "../db";

// A user's repo with one @premise comment whose probe has a real source
function writeUserRepo(url: string): string {
  const root = fs.mkdtempSync(
    path.join(path.dirname(process.env.PREMISE_DB_PATH!), "user-repo-")
  );
  fs.mkdirSync(path.join(root, "services"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "services", "pricing.ts"),
    [
      "// @premise title: Keep the cache while tokens are expensive",
      "// @premise metric: model_input_price_usd > 1.00 USD/1M (margin: 0.1)",
      `// @premise probe: HTTP_JSON_PATH | ${url}`,
      "// @premise jsonPath: $.data.price",
      "// @premise blastRadius: Delete the cache layer",
      "export const cacheEnabled = true;",
      "",
    ].join("\n")
  );
  return root;
}

function importFrom(root: string) {
  const previousRoot = process.env.PREMISE_WORKSPACE_ROOT;
  process.env.PREMISE_WORKSPACE_ROOT = root;
  try {
    const item = scanWorkspaceForPremises([]).discovered.find(
      (d) => d.variableName === "model_input_price_usd"
    )!;
    const { rawContent, compiled } = convertDiscoveredToCompiledOutput(item);
    return { item, artifact: insertCompiledArtifact(rawContent, compiled) };
  } finally {
    process.env.PREMISE_WORKSPACE_ROOT = previousRoot;
  }
}

let originalFetch: typeof fetch;
beforeEach(() => {
  originalFetch = globalThis.fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function servePrice(url: string, price: number) {
  globalThis.fetch = (async (input: string | URL | Request) => {
    const asked = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (asked !== url) throw new Error(`unexpected fetch ${asked}`);
    return Response.json({ data: { price } });
  }) as unknown as typeof fetch;
}

describe("probes written in @premise comments really run", () => {
  test("a comment probe with a source is imported connected, with its jsonPath", () => {
    const url = "https://feeds.example.test/price-a.json";
    const { item, artifact } = importFrom(writeUserRepo(url));
    expect(item.jsonPath).toBe("$.data.price");
    const probe = artifact.premises[0].probes[0];
    expect(probe.status).toBe("ACTIVE");
    expect(probe.targetUrlOrQuery).toBe(url);
    expect(probe.jsonPath).toBe("$.data.price");
    expect(artifact.status).toBe("NO_DATA");
  });

  test("running probes breaks the decision when the real value fails the premise", async () => {
    const url = "https://feeds.example.test/price-b.json";
    const { artifact } = importFrom(writeUserRepo(url));
    servePrice(url, 0.5);
    await executeActiveProbes({ artifactId: artifact.id });
    const after = getAllArtifactsWithRelations().find((a) => a.id === artifact.id)!;
    expect(after.premises[0].currentValue).toBe("0.5");
    expect(after.premises[0].status).toBe("BROKEN");
    expect(after.status).toBe("INVALIDATED");
  });

  test("and keeps it healthy when the real value holds", async () => {
    const url = "https://feeds.example.test/price-c.json";
    const { artifact } = importFrom(writeUserRepo(url));
    servePrice(url, 1.5);
    await executeActiveProbes({ artifactId: artifact.id });
    const after = getAllArtifactsWithRelations().find((a) => a.id === artifact.id)!;
    expect(after.premises[0].status).toBe("VALID");
    expect(after.status).toBe("HEALTHY");
  });
});
