import { describe, expect, it } from "bun:test";
import {
  computeTopologyGraph,
  findTransitiveBlastRadius,
  findTransitivePrerequisites,
} from "../lib/topology-engine";
import { INITIAL_SEED_ARTIFACTS } from "../db/seed-data";
import { DecisionArtifactRecord } from "../lib/types";

describe("Package 1: Visual Topology Engine", () => {
  it("1. computeTopologyGraph handles empty artifact lists", () => {
    const graph = computeTopologyGraph([]);
    expect(graph.nodes.length).toBe(0);
    expect(graph.edges.length).toBe(0);
    expect(graph.stats.totalNodes).toBe(0);
  });

  it("2. computeTopologyGraph arranges seed artifacts into topological tiers", () => {
    const graph = computeTopologyGraph(INITIAL_SEED_ARTIFACTS);
    expect(graph.nodes.length).toBe(INITIAL_SEED_ARTIFACTS.length);
    expect(graph.stats.totalNodes).toBe(INITIAL_SEED_ARTIFACTS.length);
    expect(graph.tiersCount).toBeGreaterThanOrEqual(2);

    // ADR-014 is a root node (Tier 0)
    const adr014 = graph.nodes.find((n) => n.id === "art-adr-014");
    expect(adr014).toBeDefined();
    expect(adr014?.tier).toBe(0);

    // VENDOR-04 depends on ADR-014 (Tier 1)
    const vendor04 = graph.nodes.find((n) => n.id === "art-vendor-redis");
    expect(vendor04).toBeDefined();
    expect(vendor04?.tier).toBe(1);

    // Check edge between ADR-014 and VENDOR-04
    const edge = graph.edges.find(
      (e) => e.sourceId === "art-adr-014" && e.targetId === "art-vendor-redis"
    );
    expect(edge).toBeDefined();
    expect(edge?.pathD).toContain("M ");
    expect(edge?.pathD).toContain(" C ");
    expect(edge?.sourceX).toBeLessThan(edge?.targetX || 0);
  });

  it("3. findTransitiveBlastRadius identifies all downstream dependents", () => {
    const blast = findTransitiveBlastRadius("art-adr-014", INITIAL_SEED_ARTIFACTS);
    expect(blast.has("art-vendor-redis")).toBe(true);

    // A leaf node should have empty blast radius
    const leafBlast = findTransitiveBlastRadius("art-vendor-redis", INITIAL_SEED_ARTIFACTS);
    expect(leafBlast.size).toBe(0);
  });

  it("4. findTransitivePrerequisites identifies all upstream prerequisites", () => {
    const prereqs = findTransitivePrerequisites("art-vendor-redis", INITIAL_SEED_ARTIFACTS);
    expect(prereqs.has("art-adr-014")).toBe(true);

    // A root node should have empty prerequisites
    const rootPrereqs = findTransitivePrerequisites("art-adr-014", INITIAL_SEED_ARTIFACTS);
    expect(rootPrereqs.size).toBe(0);
  });

  it("5. Multi-hop 3-tier cascade chain computation", () => {
    const mockChain: DecisionArtifactRecord[] = [
      {
        ...INITIAL_SEED_ARTIFACTS[0],
        id: "chain-root",
        dependsOnIds: [],
        downstreamDependentIds: ["chain-mid"],
      },
      {
        ...INITIAL_SEED_ARTIFACTS[1],
        id: "chain-mid",
        dependsOnIds: ["chain-root"],
        downstreamDependentIds: ["chain-leaf"],
      },
      {
        ...INITIAL_SEED_ARTIFACTS[2],
        id: "chain-leaf",
        dependsOnIds: ["chain-mid"],
        downstreamDependentIds: [],
        cascadedFromId: "chain-mid",
        status: "INVALIDATED",
      },
    ];

    const graph = computeTopologyGraph(mockChain);
    expect(graph.tiersCount).toBe(3);

    const rootNode = graph.nodes.find((n) => n.id === "chain-root");
    const midNode = graph.nodes.find((n) => n.id === "chain-mid");
    const leafNode = graph.nodes.find((n) => n.id === "chain-leaf");

    expect(rootNode?.tier).toBe(0);
    expect(midNode?.tier).toBe(1);
    expect(leafNode?.tier).toBe(2);

    // Transitive blast radius of root must include both mid and leaf
    const fullBlast = findTransitiveBlastRadius("chain-root", mockChain);
    expect(fullBlast.size).toBe(2);
    expect(fullBlast.has("chain-mid")).toBe(true);
    expect(fullBlast.has("chain-leaf")).toBe(true);

    // Transitive prerequisites of leaf must include both mid and root
    const fullPrereqs = findTransitivePrerequisites("chain-leaf", mockChain);
    expect(fullPrereqs.size).toBe(2);
    expect(fullPrereqs.has("chain-mid")).toBe(true);
    expect(fullPrereqs.has("chain-root")).toBe(true);

    // Cascade edge verification
    const cascadeEdge = graph.edges.find(
      (e) => e.sourceId === "chain-mid" && e.targetId === "chain-leaf"
    );
    expect(cascadeEdge?.isCascaded).toBe(true);
    expect(cascadeEdge?.relation).toBe("CASCADED_FROM");
  });

  it("6. Cycle handling does not loop infinitely and assigns reasonable tiers", () => {
    const cycleArtifacts: DecisionArtifactRecord[] = [
      {
        ...INITIAL_SEED_ARTIFACTS[0],
        id: "cycle-a",
        dependsOnIds: ["cycle-b"],
      },
      {
        ...INITIAL_SEED_ARTIFACTS[1],
        id: "cycle-b",
        dependsOnIds: ["cycle-a"],
      },
    ];

    const graph = computeTopologyGraph(cycleArtifacts);
    expect(graph.nodes.length).toBe(2);
    expect(graph.edges.length).toBe(2);
  });
});
