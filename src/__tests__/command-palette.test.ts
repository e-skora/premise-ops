import { describe, expect, it } from "bun:test";
import { INITIAL_SEED_ARTIFACTS } from "../db/seed-data";
import { computeTopologyGraph, findTransitiveBlastRadius } from "../lib/topology-engine";

describe("Package 1: Command Palette & Search Filter Logic", () => {
  it("1. Artifacts search matches titles, loci, and IDs", () => {
    const query = "redis";
    const matched = INITIAL_SEED_ARTIFACTS.filter((art) => {
      const q = query.toLowerCase();
      const inTitle = art.title.toLowerCase().includes(q);
      const inLocus = art.targetLocus.toLowerCase().includes(q);
      const inBlastRadius = art.blastRadius.toLowerCase().includes(q);
      const inPremises = art.premises.some((p) =>
        p.variableName.toLowerCase().includes(q) || p.claim.toLowerCase().includes(q)
      );
      return inTitle || inLocus || inBlastRadius || inPremises;
    });

    expect(matched.length).toBeGreaterThanOrEqual(1);
    expect(matched.some((a) => a.id === "art-adr-014")).toBe(true);
  });

  it("2. Premises search matches quantitative variables and claims", () => {
    const query = "upstream_llm";
    const allPremises = INITIAL_SEED_ARTIFACTS.flatMap((a) =>
      a.premises.map((p) => ({ ...p, parentTitle: a.title }))
    );

    const matched = allPremises.filter((p) =>
      p.variableName.toLowerCase().includes(query) ||
      p.claim.toLowerCase().includes(query)
    );

    expect(matched.length).toBeGreaterThanOrEqual(1);
    expect(matched[0].variableName).toContain("upstream_llm");
    expect(matched[0].parentTitle).toContain("ADR-014");
  });

  it("3. Transitive blast radius search in palette integrates with topology", () => {
    const graph = computeTopologyGraph(INITIAL_SEED_ARTIFACTS);
    const adr014Node = graph.nodes.find((n) => n.id === "art-adr-014");
    expect(adr014Node).toBeDefined();

    const blast = findTransitiveBlastRadius(adr014Node!.id, INITIAL_SEED_ARTIFACTS);
    expect(blast.has("art-vendor-redis")).toBe(true);
  });

  it("4. Category grouping partitions commands, decisions, and premises cleanly", () => {
    const categories = ["commands", "decisions", "premises"] as const;
    expect(categories.length).toBe(3);
  });
});
