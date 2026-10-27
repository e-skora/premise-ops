import { describe, expect, test } from "bun:test";
import { NextRequest } from "next/server";
import { GET as locusGet, POST as locusPost } from "../app/api/locus/route";

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
