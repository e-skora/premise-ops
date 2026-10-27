import {
  Operator,
  OPERATOR_SYMBOLS,
  PremiseRecord,
  PremiseStatus,
  ArtifactStatus,
  LogicCombinator,
  MetricSampleRecord,
  DriftForecast,
} from "./types";
import { buildRealGitApplyPatch } from "./locus-inspector";

export interface EvaluationResult {
  status: PremiseStatus;
  isSatisfied: boolean;
  isDecaying: boolean;
  driftPercent: number; // 0 = healthy far from threshold, 100 = at or past threshold
  marginBoundary: number;
  deltaFromThreshold: number;
}

/**
 * Evaluates a numeric or string value against an operator, threshold, and decay warning margin.
 */
export function evaluatePremiseState(
  currentRaw: string | number,
  operator: Operator,
  thresholdRaw: string | number,
  decayWarningMargin: number = 0.1
): EvaluationResult {
  // No value has been reported yet: nothing to judge
  if (currentRaw === null || currentRaw === undefined || String(currentRaw).trim() === "") {
    return {
      status: "UNBOUND",
      isSatisfied: false,
      isDecaying: false,
      driftPercent: 0,
      marginBoundary: 0,
      deltaFromThreshold: 0,
    };
  }

  const currentNum = Number(currentRaw);
  const thresholdNum = Number(thresholdRaw);

  if (Number.isNaN(currentNum) || Number.isNaN(thresholdNum)) {
    const curStr = String(currentRaw).trim();
    const thrStr = String(thresholdRaw).trim();
    const isSatisfied =
      operator === "NEQ" ? curStr !== thrStr : curStr === thrStr;
    return {
      status: isSatisfied ? "VALID" : "BROKEN",
      isSatisfied,
      isDecaying: false,
      driftPercent: isSatisfied ? 15 : 100,
      marginBoundary: 0,
      deltaFromThreshold: 0,
    };
  }

  let isSatisfied = false;
  switch (operator) {
    case "GT":
      isSatisfied = currentNum > thresholdNum;
      break;
    case "GTE":
      isSatisfied = currentNum >= thresholdNum;
      break;
    case "LT":
      isSatisfied = currentNum < thresholdNum;
      break;
    case "LTE":
      isSatisfied = currentNum <= thresholdNum;
      break;
    case "EQ":
      isSatisfied = Math.abs(currentNum - thresholdNum) < 1e-9;
      break;
    case "NEQ":
      isSatisfied = Math.abs(currentNum - thresholdNum) >= 1e-9;
      break;
  }

  const absThreshold = Math.abs(thresholdNum) || 1;
  const warningBandSize = absThreshold * decayWarningMargin;

  if (!isSatisfied) {
    return {
      status: "BROKEN",
      isSatisfied: false,
      isDecaying: false,
      driftPercent: 100,
      marginBoundary:
        operator === "GT" || operator === "GTE"
          ? thresholdNum + warningBandSize
          : thresholdNum - warningBandSize,
      deltaFromThreshold: currentNum - thresholdNum,
    };
  }

  let isDecaying = false;
  let marginBoundary = thresholdNum;
  let driftPercent = 20;

  const safeSpan = Math.max(warningBandSize * 3.5, absThreshold * 0.25);

  if (operator === "GT" || operator === "GTE") {
    marginBoundary = thresholdNum + warningBandSize;
    isDecaying = currentNum <= marginBoundary;
    const distanceAbove = currentNum - thresholdNum;
    driftPercent = Math.max(
      4,
      Math.min(99, Math.round((1 - distanceAbove / safeSpan) * 100))
    );
    if (isDecaying && driftPercent < 72) {
      driftPercent = 78;
    }
  } else if (operator === "LT" || operator === "LTE") {
    marginBoundary = thresholdNum - warningBandSize;
    isDecaying = currentNum >= marginBoundary;
    const distanceBelow = thresholdNum - currentNum;
    driftPercent = Math.max(
      4,
      Math.min(99, Math.round((1 - distanceBelow / safeSpan) * 100))
    );
    if (isDecaying && driftPercent < 72) {
      driftPercent = 78;
    }
  } else if (operator === "NEQ") {
    const dist = Math.abs(currentNum - thresholdNum);
    isDecaying = dist <= warningBandSize;
    driftPercent = isDecaying ? 82 : 20;
  } else {
    isDecaying = false;
    driftPercent = 10;
  }

  return {
    status: isDecaying ? "DECAYING" : "VALID",
    isSatisfied: true,
    isDecaying,
    driftPercent,
    marginBoundary: Number(marginBoundary.toFixed(4)),
    deltaFromThreshold: Number((currentNum - thresholdNum).toFixed(4)),
  };
}

/**
 * Computes aggregate parent DecisionArtifact status from its bound premises
 * and its configured boolean logic gate:
 * - ANY (OR gate): Any single BROKEN premise invalidates the artifact.
 * - ALL (AND gate): Artifact is INVALIDATED only when ALL premises are BROKEN;
 *   if some (but not all) are BROKEN or DECAYING, artifact is AT_RISK.
 */
export function computeArtifactStatus(
  premiseStatuses: PremiseStatus[],
  logicCombinator: LogicCombinator = "ANY"
): ArtifactStatus {
  if (premiseStatuses.length === 0) return "HEALTHY";

  if (logicCombinator === "ALL") {
    const allBroken = premiseStatuses.every((s) => s === "BROKEN");
    if (allBroken) return "INVALIDATED";
    if (premiseStatuses.some((s) => s === "BROKEN" || s === "DECAYING")) {
      return "AT_RISK";
    }
    return "HEALTHY";
  }

  // Default ANY (OR Kill-Switch)
  if (premiseStatuses.some((s) => s === "BROKEN")) {
    return "INVALIDATED";
  }
  if (premiseStatuses.some((s) => s === "DECAYING")) {
    return "AT_RISK";
  }
  return "HEALTHY";
}

/**
 * Track 1: Linear-Regression Drift Velocity & Time-to-Invalidation (TTI) Forecaster
 */
export function computeDriftForecast(
  samples: MetricSampleRecord[] | undefined,
  operator: Operator,
  thresholdRaw: string | number,
  currentRaw: string | number,
  status: PremiseStatus
): DriftForecast {
  const thresholdNum = Number(thresholdRaw);
  const currentNum = Number(currentRaw);

  if (status === "BROKEN") {
    return {
      velocityPerSample: 0,
      trendDirection: "BREACHED",
      samplesToBreach: 0,
      etaLabel: "THRESHOLD BREACHED",
    };
  }

  const recent = (samples || []).slice(-8);
  if (
    recent.length < 2 ||
    Number.isNaN(thresholdNum) ||
    Number.isNaN(currentNum)
  ) {
    return {
      velocityPerSample: 0,
      trendDirection: "STABILIZING",
      samplesToBreach: null,
      etaLabel: "STABLE TRAJECTORY",
    };
  }

  const n = recent.length;
  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += recent[i].value;
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const dx = i - meanX;
    num += dx * (recent[i].value - meanY);
    den += dx * dx;
  }

  const slope = den === 0 ? 0 : num / den;
  const velocityPerSample = Number(slope.toFixed(3));

  let driftingTowardBreach = false;
  let distanceRemaining = 0;

  if (operator === "GT" || operator === "GTE") {
    // Breaks when value drops to <= thresholdNum
    driftingTowardBreach = slope < -1e-4;
    distanceRemaining = Math.max(0, currentNum - thresholdNum);
  } else if (operator === "LT" || operator === "LTE") {
    // Breaks when value rises to >= thresholdNum
    driftingTowardBreach = slope > 1e-4;
    distanceRemaining = Math.max(0, thresholdNum - currentNum);
  }

  if (!driftingTowardBreach || Math.abs(slope) < 1e-4) {
    return {
      velocityPerSample,
      trendDirection: "STABILIZING",
      samplesToBreach: null,
      etaLabel: "STABLE TRAJECTORY",
    };
  }

  const steps = Math.max(1, Math.ceil(distanceRemaining / Math.abs(slope)));
  const estHours = steps * 4;
  const etaLabel =
    estHours < 24
      ? `TTI ~${estHours}h at current drift`
      : `TTI ~${Math.ceil(estHours / 24)}d at current drift`;

  return {
    velocityPerSample,
    trendDirection: "DRIFTING_TOWARD_BREACH",
    samplesToBreach: steps,
    etaLabel,
  };
}

/**
 * Generates a realistic, actionable Teardown & Remediation Specification when a premise breaks,
 * reading actual targetLocus file lines from disk to produce a `git apply`-ready patch.
 */
export function generateRemediationPlan(params: {
  artifactId: string;
  artifactTitle: string;
  artifactType: string;
  targetLocus: string;
  blastRadius: string;
  premiseClaim: string;
  variableName: string;
  unit: string;
  operator: Operator;
  thresholdValue: string;
  previousValue: string;
  breakingValue: string;
  cascadedFromTitle?: string;
  downstreamCascadeTitles?: string[];
}): string {
  const {
    artifactTitle,
    artifactType,
    targetLocus,
    blastRadius,
    premiseClaim,
    variableName,
    unit,
    operator,
    thresholdValue,
    previousValue,
    breakingValue,
    cascadedFromTitle,
    downstreamCascadeTitles,
  } = params;

  const opSymbol = OPERATOR_SYMBOLS[operator] || operator;
  const unitSuffix = unit ? ` ${unit}` : "";

  const { inspection, unifiedDiff } = buildRealGitApplyPatch({
    targetLocus,
    artifactTitle,
    variableName,
    operator,
    thresholdValue,
    breakingValue,
    unit,
    blastRadius,
    cascadedFromTitle,
  });

  const locusSourceBadge = inspection.exists
    ? `LOCAL FILE VERIFIED (\`${inspection.resolvedPath}:L${inspection.startLine}-L${inspection.endLine}\`, ${inspection.lines.length} lines read)`
    : `SYNTHETIC LOCUS (\`${targetLocus}\`)`;

  const cascadeSection = cascadedFromTitle
    ? `\n#### 1b. Upstream Multi-Hop Cascade Trigger\n- **Cascaded From Upstream Decision:** \`${cascadedFromTitle}\`\n- **Propagation Rule:** Upstream invalidation automatically invalidates dependent downstream contracts/decisions.\n`
    : downstreamCascadeTitles && downstreamCascadeTitles.length > 0
    ? `\n#### 1b. Downstream Multi-Hop Blast Radius (${downstreamCascadeTitles.length} Dependent Decision${downstreamCascadeTitles.length === 1 ? "" : "s"})\n${downstreamCascadeTitles.map((t) => `- **Cascades To:** \`${t}\` (auto-invalidated)`).join("\n")}\n`
    : "";

  return `### KILL-SWITCH TRIGGERED: ${artifactTitle}
**Decision Type:** \`${artifactType}\`
**Target Locus:** \`${targetLocus}\` — *${locusSourceBadge}*
**Violated Variable:** \`${variableName}\`

#### 1. Assertion Failure Summary
The load-bearing premise **"${premiseClaim}"** is no longer true in production reality:
- **Required Assertion:** \`${variableName} ${opSymbol} ${thresholdValue}${unitSuffix}\`
- **Previous Telemetry:** \`${previousValue}${unitSuffix}\`
- **Breaking Telemetry:** \`${breakingValue}${unitSuffix}\`
${cascadeSection}
#### 2. Obsolete Blast Radius (Eligible for Immediate Teardown)
> ${blastRadius}

#### 3. Concrete Refactoring & Teardown Action Plan (\`git apply\` Ready)
1. **Deprecate Target Locus (\`${inspection.resolvedPath}\`)**: Remove the complexity introduced by *${artifactTitle}* and route execution directly through the default baseline path.
2. **Decommission Supporting Infrastructure**: Tear down the associated infrastructure/budget identified in the blast radius above.
3. **Archive Decision Record**: Mark \`${artifactTitle}\` as \`SUPERSEDED_BY_REALITY_DRIFT\` in the engineering decision registry.

\`\`\`diff
${unifiedDiff}
\`\`\``;
}

/**
 * Computes slider min, max, and step for the Chaos / Drift Simulator for any premise.
 */
export function getSimulationRange(premise: PremiseRecord): {
  min: number;
  max: number;
  step: number;
  breakingDirectionLabel: string;
} {
  const threshold = Number(premise.thresholdValue);
  const current = Number(premise.currentValue);

  if (Number.isNaN(threshold)) {
    return {
      min: 0,
      max: 100,
      step: 1,
      breakingDirectionLabel: "Mutate metric value",
    };
  }

  if (premise.unit === "%" && threshold >= 95) {
    return {
      min: 98.5,
      max: 100.0,
      step: 0.02,
      breakingDirectionLabel:
        premise.operator === "LT" || premise.operator === "LTE"
          ? `Breaks when >= ${threshold}%`
          : `Breaks when <= ${threshold}%`,
    };
  }

  const base = Math.max(Math.abs(threshold), Math.abs(current), 1);
  const min = Math.max(0, Number((threshold * 0.2).toFixed(2)));
  const max = Number((base * 1.85).toFixed(2));
  const span = max - min;
  const step =
    span <= 5 ? 0.05 : span <= 25 ? 0.1 : span <= 150 ? 0.5 : 5;

  const breakingDirectionLabel =
    premise.operator === "GT" || premise.operator === "GTE"
      ? `Breaks when <= ${premise.thresholdValue} ${premise.unit}`
      : `Breaks when >= ${premise.thresholdValue} ${premise.unit}`;

  return { min, max, step, breakingDirectionLabel };
}

/**
 * Extracts a value from a JSON object using a simple JSONPath expression like `$.metrics.foo.bar`
 */
/**
 * Small JSONPath subset: dotted keys, array indexes (`[0]`) and equality
 * filters (`[?(@.id=="x")]`, first match wins).
 */
export function extractJsonPath(obj: unknown, jsonPath: string): unknown {
  if (!obj || typeof obj !== "object") return undefined;
  const path = jsonPath.trim().replace(/^\$/, "");
  if (!path || path === ".") return obj;

  const tokenRegex =
    /\.([^.[\]]+)|\[(\d+)\]|\[\?\(@\.([^=!<>\s)]+)\s*==\s*(?:"([^"]*)"|'([^']*)'|(-?\d+(?:\.\d+)?)|(true|false))\s*\)\]/y;
  let cursor: unknown = obj;
  let pos = 0;
  const normalized = path.startsWith(".") || path.startsWith("[") ? path : `.${path}`;
  while (pos < normalized.length) {
    tokenRegex.lastIndex = pos;
    const m = tokenRegex.exec(normalized);
    if (!m) return undefined;
    pos = tokenRegex.lastIndex;

    if (m[1] !== undefined || m[2] !== undefined) {
      const key = m[1] ?? m[2];
      if (cursor !== null && typeof cursor === "object" && key in cursor) {
        cursor = (cursor as Record<string, unknown>)[key];
      } else {
        return undefined;
      }
      continue;
    }

    // Equality filter over an array
    if (!Array.isArray(cursor)) return undefined;
    const field = m[3];
    const expected: unknown =
      m[4] ?? m[5] ?? (m[6] !== undefined ? Number(m[6]) : m[7] === "true");
    cursor = cursor.find(
      (item) =>
        item !== null &&
        typeof item === "object" &&
        (item as Record<string, unknown>)[field] === expected
    );
    if (cursor === undefined) return undefined;
  }
  return cursor;
}
