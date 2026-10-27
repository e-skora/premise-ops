import { describe, expect, test } from "bun:test";
import { NextRequest } from "next/server";
import { GET as locusGet, POST as locusPost } from "../app/api/locus/route";
import { POST as compilePost } from "../app/api/compile/route";
import { getAllArtifactsWithRelations } from "../db";

function request(url: string, options: { method?: string; body?: unknown } = {}) {
  return new NextRequest(`http://localhost${url}`, {
    method: options.method || "GET",
    headers: { "content-type": "application/json" },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

describe("A decision with no code location", () => {
  test("the code viewer shows nothing instead of another file", async () => {
    const res = await locusGet(request("/api/locus?targetLocus="));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.noLocus).toBe(true);
    expect(data.inspection).toBeNull();
    expect(data.unifiedDiff).toBe("");
  });

  test("patching is refused", async () => {
    const res = await locusPost(
      request("/api/locus", { method: "POST", body: { action: "apply", targetLocus: "" } })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("No code location set");
  });
});

const DOC = `# ADR-900: Queue retry budget

This holds while p95 latency stays under 300ms.`;

function compile(body: Record<string, unknown>) {
  return compilePost(
    request("/api/compile", { method: "POST", body: { rawContent: DOC, ...body } })
  );
}

describe("Compiling a decision checks its code location", () => {
  test("a document with no path is saved with no code location", async () => {
    const res = await compile({ persist: true });
    expect(res.status).toBe(200);
    expect((await res.json()).artifact.targetLocus).toBe("");
  });

  test("a path to a real file is saved", async () => {
    const locus = "examples/demo-repo/services/ingest-worker/queue.ts:L1-L10";
    const res = await compile({ persist: true, overrideLocus: locus });
    expect(res.status).toBe(200);
    expect((await res.json()).artifact.targetLocus).toBe(locus);
  });

  test("a typed path to a missing file is refused and nothing is saved", async () => {
    const before = getAllArtifactsWithRelations().length;
    const res = await compile({ persist: true, overrideLocus: "src/does-not-exist.ts:L1-20" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("File not found: src/does-not-exist.ts");
    expect(getAllArtifactsWithRelations().length).toBe(before);
  });

  test("a missing path named inside the document is refused too", async () => {
    const res = await compile({
      rawContent: `**Locus:** \`infra/made-up.yaml\`\n\n${DOC}`,
      persist: true,
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("File not found: infra/made-up.yaml");
  });

  test("the preview says the file is missing", async () => {
    const res = await compile({ persist: false, overrideLocus: "src/does-not-exist.ts" });
    expect(res.status).toBe(200);
    expect((await res.json()).locusError).toContain("File not found");
  });
});
