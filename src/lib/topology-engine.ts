import {
  ArtifactStatus,
  ArtifactType,
  DecisionArtifactRecord,
  LogicCombinator,
  Operator,
  PremiseStatus,
} from "./types";

export interface TopologyNodePremise {
  id: string;
  claim: string;
  variableName: string;
  status: PremiseStatus;
  operator: Operator;
  thresholdValue: string;
  currentValue: string;
  unit: string;
}

export interface TopologyNode {
  id: string;
  title: string;
  type: ArtifactType;
  status: ArtifactStatus;
  targetLocus: string;
  blastRadius: string;
  combinator: LogicCombinator;
  cascadedFromId: string | null;
  dependsOnIds: string[];
  downstreamDependentIds: string[];
  premisesCount: number;
  brokenCount: number;
  decayingCount: number;
  validCount: number;
  monthlyCloudSpendUsd: number;
  tier: number;
  tierIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  premises: TopologyNodePremise[];
}

export interface TopologyEdge {
  id: string;
  sourceId: string;
  targetId: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  pathD: string;
  isCascaded: boolean;
  isBreached: boolean;
  relation: "DEPENDS_ON" | "CASCADED_FROM";
}

export interface TopologyGraphStats {
  totalNodes: number;
  totalEdges: number;
  healthyNodes: number;
  atRiskNodes: number;
  invalidatedNodes: number;
  cascadedNodes: number;
  rootNodes: number;
  leafNodes: number;
  maxDepth: number;
}

export interface TopologyGraphData {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  tiersCount: number;
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
  };
  stats: TopologyGraphStats;
}

export interface TopologyLayoutOptions {
  nodeWidth?: number;
  nodeHeight?: number;
  colGap?: number;
  rowGap?: number;
  padding?: number;
}

const DEFAULT_OPTIONS: Required<TopologyLayoutOptions> = {
  nodeWidth: 300,
  nodeHeight: 140,
  colGap: 90,
  rowGap: 36,
  padding: 40,
};

/**
 * Finds all transitive downstream artifacts that would be impacted or invalidated
 * if the given root artifact is breached or torn down.
 */
export function findTransitiveBlastRadius(
  rootId: string,
  artifacts: DecisionArtifactRecord[]
): Set<string> {
  const blastRadius = new Set<string>();
  const queue: string[] = [rootId];
  const visited = new Set<string>([rootId]);

  // Build adjacency map: source -> array of direct downstream dependents
  const downstreamMap = new Map<string, string[]>();
  for (const art of artifacts) {
    // Explicit downstream list
    const explicit = art.downstreamDependentIds || [];
    for (const dId of explicit) {
      const arr = downstreamMap.get(art.id) || [];
      if (!arr.includes(dId)) arr.push(dId);
      downstreamMap.set(art.id, arr);
    }
    // Cross check dependsOnIds
    for (const upId of art.dependsOnIds || []) {
      const arr = downstreamMap.get(upId) || [];
      if (!arr.includes(art.id)) arr.push(art.id);
      downstreamMap.set(upId, arr);
    }
    // Cross check cascadedFromId
    if (art.cascadedFromId) {
      const arr = downstreamMap.get(art.cascadedFromId) || [];
      if (!arr.includes(art.id)) arr.push(art.id);
      downstreamMap.set(art.cascadedFromId, arr);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    const dependents = downstreamMap.get(current) || [];
    for (const depId of dependents) {
      if (!visited.has(depId)) {
        visited.add(depId);
        blastRadius.add(depId);
        queue.push(depId);
      }
    }
  }

  return blastRadius;
}

/**
 * Finds all transitive upstream prerequisites for a given target artifact.
 */
export function findTransitivePrerequisites(
  targetId: string,
  artifacts: DecisionArtifactRecord[]
): Set<string> {
  const prereqs = new Set<string>();
  const queue: string[] = [targetId];
  const visited = new Set<string>([targetId]);

  const upstreamMap = new Map<string, string[]>();
  for (const art of artifacts) {
    const ups: string[] = [...(art.dependsOnIds || [])];
    if (art.cascadedFromId && !ups.includes(art.cascadedFromId)) {
      ups.push(art.cascadedFromId);
    }
    upstreamMap.set(art.id, ups);
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    const parents = upstreamMap.get(current) || [];
    for (const pId of parents) {
      if (!visited.has(pId)) {
        visited.add(pId);
        prereqs.add(pId);
        queue.push(pId);
      }
    }
  }

  return prereqs;
}

/**
 * Computes topological tiers and assigns 2D positions (x, y) for an architecture decision DAG.
 */
export function computeTopologyGraph(
  artifacts: DecisionArtifactRecord[],
  options?: TopologyLayoutOptions
): TopologyGraphData {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const { nodeWidth, nodeHeight, colGap, rowGap, padding } = opts;

  if (artifacts.length === 0) {
    return {
      nodes: [],
      edges: [],
      tiersCount: 0,
      bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 },
      stats: {
        totalNodes: 0,
        totalEdges: 0,
        healthyNodes: 0,
        atRiskNodes: 0,
        invalidatedNodes: 0,
        cascadedNodes: 0,
        rootNodes: 0,
        leafNodes: 0,
        maxDepth: 0,
      },
    };
  }

  const artMap = new Map<string, DecisionArtifactRecord>();
  for (const a of artifacts) {
    artMap.set(a.id, a);
  }

  // Calculate upstream dependencies map
  const directUpstreams = new Map<string, string[]>();
  const directDownstreams = new Map<string, string[]>();

  for (const art of artifacts) {
    directUpstreams.set(art.id, []);
    directDownstreams.set(art.id, []);
  }

  for (const art of artifacts) {
    const ups = new Set<string>();
    for (const upId of art.dependsOnIds || []) {
      if (artMap.has(upId) && upId !== art.id) ups.add(upId);
    }
    if (art.cascadedFromId && artMap.has(art.cascadedFromId) && art.cascadedFromId !== art.id) {
      ups.add(art.cascadedFromId);
    }

    directUpstreams.set(art.id, Array.from(ups));

    for (const upId of ups) {
      const downs = directDownstreams.get(upId) || [];
      if (!downs.includes(art.id)) downs.push(art.id);
      directDownstreams.set(upId, downs);
    }
  }

  // Compute depth tier for each artifact (longest path from any root)
  const tierMap = new Map<string, number>();

  function getTier(id: string, visitedPath = new Set<string>()): number {
    if (tierMap.has(id)) return tierMap.get(id)!;
    if (visitedPath.has(id)) return 0; // Handle potential cycles gracefully

    const ups = directUpstreams.get(id) || [];
    if (ups.length === 0) {
      tierMap.set(id, 0);
      return 0;
    }

    visitedPath.add(id);
    let maxParentTier = -1;
    for (const parentId of ups) {
      const pTier = getTier(parentId, new Set(visitedPath));
      if (pTier > maxParentTier) maxParentTier = pTier;
    }

    const myTier = maxParentTier + 1;
    tierMap.set(id, myTier);
    return myTier;
  }

  for (const art of artifacts) {
    getTier(art.id);
  }

  // Group artifacts into tier buckets
  const maxTier = Math.max(...Array.from(tierMap.values()), 0);
  const tiersCount = maxTier + 1;
  const tierBuckets: DecisionArtifactRecord[][] = Array.from(
    { length: tiersCount },
    () => []
  );

  for (const art of artifacts) {
    const t = tierMap.get(art.id) ?? 0;
    tierBuckets[t].push(art);
  }

  // Calculate coordinates for each node
  const nodes: TopologyNode[] = [];
  const nodePositionMap = new Map<string, { x: number; y: number }>();

  // Determine maximum column height to center shorter columns nicely
  const maxNodesInCol = Math.max(...tierBuckets.map((b) => b.length), 1);
  const totalMaxColHeight = maxNodesInCol * nodeHeight + (maxNodesInCol - 1) * rowGap;

  tierBuckets.forEach((bucket, tier) => {
    const colHeight = bucket.length * nodeHeight + (bucket.length - 1) * rowGap;
    const yOffset = (totalMaxColHeight - colHeight) / 2; // Center column vertically

    bucket.forEach((art, tierIndex) => {
      const x = padding + tier * (nodeWidth + colGap);
      const y = padding + yOffset + tierIndex * (nodeHeight + rowGap);

      nodePositionMap.set(art.id, { x, y });

      const premises = art.premises || [];
      const brokenCount = premises.filter((p) => p.status === "BROKEN").length;
      const decayingCount = premises.filter((p) => p.status === "DECAYING").length;
      const validCount = premises.filter((p) => p.status === "VALID").length;

      const nodePremises: TopologyNodePremise[] = premises.map((p) => ({
        id: p.id,
        claim: p.claim,
        variableName: p.variableName,
        status: p.status,
        operator: p.operator,
        thresholdValue: p.thresholdValue,
        currentValue: p.currentValue,
        unit: p.unit || "",
      }));

      nodes.push({
        id: art.id,
        title: art.title,
        type: art.type,
        status: art.status,
        targetLocus: art.targetLocus,
        blastRadius: art.blastRadius,
        combinator: art.logicCombinator || "ANY",
        cascadedFromId: art.cascadedFromId || null,
        dependsOnIds: art.dependsOnIds || [],
        downstreamDependentIds: directDownstreams.get(art.id) || [],
        premisesCount: premises.length,
        brokenCount,
        decayingCount,
        validCount,
        monthlyCloudSpendUsd: art.monthlyCloudSpendUsd || 0,
        tier,
        tierIndex,
        x,
        y,
        width: nodeWidth,
        height: nodeHeight,
        premises: nodePremises,
      });
    });
  });

  // Build Edges
  const edges: TopologyEdge[] = [];
  const edgeIdSet = new Set<string>();

  for (const art of artifacts) {
    const targetPos = nodePositionMap.get(art.id);
    if (!targetPos) continue;

    // Connect from all upstream parents to this artifact
    const upstreams = directUpstreams.get(art.id) || [];
    for (const upId of upstreams) {
      const sourcePos = nodePositionMap.get(upId);
      if (!sourcePos) continue;

      const edgeKey = `${upId}->${art.id}`;
      if (edgeIdSet.has(edgeKey)) continue;
      edgeIdSet.add(edgeKey);

      const sourceArt = artMap.get(upId);
      const sourceX = sourcePos.x + nodeWidth;
      const sourceY = sourcePos.y + nodeHeight / 2;
      const targetX = targetPos.x;
      const targetY = targetPos.y + nodeHeight / 2;

      // Cubic Bezier curve path
      const horizontalDistance = targetX - sourceX;
      const cp1X = sourceX + Math.max(horizontalDistance * 0.45, 30);
      const cp1Y = sourceY;
      const cp2X = targetX - Math.max(horizontalDistance * 0.45, 30);
      const cp2Y = targetY;

      const pathD = `M ${sourceX} ${sourceY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${targetX} ${targetY}`;

      const isCascaded =
        art.cascadedFromId === upId ||
        (sourceArt?.status === "INVALIDATED" && art.status === "INVALIDATED");
      const isBreached =
        art.status === "INVALIDATED" || sourceArt?.status === "INVALIDATED";
      const relation =
        art.cascadedFromId === upId ? "CASCADED_FROM" : "DEPENDS_ON";

      edges.push({
        id: `edge-${edgeKey}`,
        sourceId: upId,
        targetId: art.id,
        sourceX,
        sourceY,
        targetX,
        targetY,
        pathD,
        isCascaded,
        isBreached,
        relation,
      });
    }
  }

  // Calculate Bounds
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const n of nodes) {
    if (n.x < minX) minX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.x + n.width > maxX) maxX = n.x + n.width;
    if (n.y + n.height > maxY) maxY = n.y + n.height;
  }

  if (minX === Infinity) {
    minX = 0;
    minY = 0;
    maxX = 800;
    maxY = 600;
  } else {
    minX = Math.max(0, minX - padding);
    minY = Math.max(0, minY - padding);
    maxX = maxX + padding;
    maxY = maxY + padding;
  }

  const width = Math.max(maxX - minX, 600);
  const height = Math.max(maxY - minY, 400);

  // Compute Stats
  const healthyNodes = nodes.filter((n) => n.status === "HEALTHY").length;
  const atRiskNodes = nodes.filter((n) => n.status === "AT_RISK").length;
  const invalidatedNodes = nodes.filter((n) => n.status === "INVALIDATED").length;
  const cascadedNodes = nodes.filter((n) => Boolean(n.cascadedFromId)).length;
  const rootNodes = nodes.filter(
    (n) => (directUpstreams.get(n.id) || []).length === 0
  ).length;
  const leafNodes = nodes.filter(
    (n) => (directDownstreams.get(n.id) || []).length === 0
  ).length;

  return {
    nodes,
    edges,
    tiersCount,
    bounds: {
      minX,
      minY,
      maxX,
      maxY,
      width,
      height,
    },
    stats: {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      healthyNodes,
      atRiskNodes,
      invalidatedNodes,
      cascadedNodes,
      rootNodes,
      leafNodes,
      maxDepth: maxTier,
    },
  };
}
