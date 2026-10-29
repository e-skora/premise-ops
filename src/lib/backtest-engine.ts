import {
  ArtifactStatus,
  BacktestOptions,
  BacktestReport,
  ArtifactBacktestResult,
  DecisionArtifactRecord,
  Operator,
  PremiseBacktestResult,
  PremiseRecord,
  PremiseStatus,
  ReplayStepSnapshot,
  ScenarioPreset,
  OPERATOR_SYMBOLS,
} from "./types";
import { evaluatePremiseState, computeArtifactStatus } from "./evaluator";
import { SEED_HISTORICAL_SERIES } from "../db/seed-data";

export const SCENARIO_PRESETS: ScenarioPreset[] = [
  {
    id: "price-war",
    name: "Frontier LLM Price War (-60% Step Cuts)",
    description:
      "Simulates aggressive upstream token price cuts (-60% in 2 major market drops). Tests whether custom semantic cache ROI holds or triggers teardown & downstream Redis contract cancellation.",
    category: "LLM_ECONOMICS",
    scenarioType: "PRICE_WAR_DEFLATION",
    defaultSteps: 20,
    defaultShockPct: -60,
    defaultNoisePct: 3,
    targetVariable: "upstream_llm_input_cost_usd",
    targetArtifactId: "art-adr-014",
  },
  {
    id: "latency-spike",
    name: "Black Friday Peak Latency Surge (+65% P95 TTFT)",
    description:
      "Simulates peak global e-commerce traffic where upstream inference tail latency surges past 1,000ms with jitter, testing if latency envelope premise holds under load.",
    category: "INFRA_LATENCY",
    scenarioType: "LATENCY_SPIKE",
    defaultSteps: 20,
    defaultShockPct: 65,
    defaultNoisePct: 6,
    targetVariable: "upstream_ttft_p95_ms",
    targetArtifactId: "art-adr-014",
  },
  {
    id: "vendor-outage",
    name: "Webhook Provider SLA Recovery & Invalidation",
    description:
      "Simulates primary webhook provider SLA rising to 99.98% (exceeding < 99.9% threshold), invalidating the need for secondary BullMQ failover queue and triggering teardown.",
    category: "SLA_RELIABILITY",
    scenarioType: "VENDOR_OUTAGE",
    defaultSteps: 20,
    defaultShockPct: 0.6,
    defaultNoisePct: 0.05,
    targetVariable: "primary_webhook_uptime_pct",
    targetArtifactId: "art-pr-892",
  },
  {
    id: "redis-drain",
    name: "FinOps Vector Memory Depletion (-30% Utilization)",
    description:
      "Simulates vector cluster memory utilization dropping below 60% committed-use threshold due to reduced traffic or context expansion, triggering contract review.",
    category: "FINOPS",
    scenarioType: "FINOPS_DRAIN",
    defaultSteps: 20,
    defaultShockPct: -30,
    defaultNoisePct: 2,
    targetVariable: "redis_cluster_memory_utilization_pct",
    targetArtifactId: "art-vendor-redis",
  },
  {
    id: "cac-surge",
    name: "GTM Outbound Auction Inflation (+35% CAC)",
    description:
      "Simulates ad-auction keyword inflation pushing blended CAC from $61.20 past $65.00 ceiling, triggering outbound marketing freeze & enrichment worker teardown.",
    category: "GROWTH",
    scenarioType: "CAC_SURGE",
    defaultSteps: 20,
    defaultShockPct: 35,
    defaultNoisePct: 4,
    targetVariable: "blended_search_cac_usd",
    targetArtifactId: "art-gtm-q3",
  },
  {
    id: "historical",
    name: "Recorded Database Telemetry Replay (Time-Machine)",
    description:
      "Replays recorded historical telemetry series from SQLite MetricSample records point-by-point to evaluate decision stability over real time series.",
    category: "HISTORICAL",
    scenarioType: "HISTORICAL",
    defaultSteps: 15,
    defaultShockPct: 0,
    defaultNoisePct: 0,
  },
  {
    id: "custom",
    name: "Custom Parameterized Chaos Drift",
    description:
      "Configurable user scenario with customizable shock magnitude, noise jitter, duration, and trend slope.",
    category: "CUSTOM",
    scenarioType: "CUSTOM",
    defaultSteps: 20,
    defaultShockPct: -40,
    defaultNoisePct: 5,
  },
];

/**
 * Deterministic pseudo-random generator (seeded PRNG) so backtest replays are 100% reproducible.
 */
function seededRandom(seed: number): () => number {
  let s = Math.sin(seed) * 10000;
  return () => {
    s = Math.sin(s) * 10000;
    return s - Math.floor(s);
  };
}

/**
 * Generates an array of simulated numeric telemetry values for a premise over N steps.
 */
export function generatePremiseReplaySeries(params: {
  premise: PremiseRecord;
  scenarioPreset: ScenarioPreset;
  steps: number;
  shockMagnitudePct: number;
  noiseFactorPct: number;
  seed?: number;
}): number[] {
  const {
    premise,
    scenarioPreset,
    steps,
    shockMagnitudePct,
    noiseFactorPct,
    seed = 42,
  } = params;

  // No reported value and no history: nothing to replay, never an invented baseline
  const hasValue = String(premise.currentValue ?? "").trim() !== "";
  if (
    !hasValue &&
    (premise.metricSamples || []).length === 0 &&
    !(SEED_HISTORICAL_SERIES[premise.id] || []).length
  ) {
    return [];
  }

  const baseVal = hasValue
    ? Number(premise.currentValue)
    : (premise.metricSamples || []).at(-1)?.value ?? SEED_HISTORICAL_SERIES[premise.id]!.at(-1)!;
  const rand = seededRandom(seed + premise.id.length * 17);

  // 1. Historical Replay Scenario
  if (scenarioPreset.scenarioType === "HISTORICAL") {
    const historicalRecords = premise.metricSamples || [];
    const seedValues = SEED_HISTORICAL_SERIES[premise.id] || [];
    const sourceSeries =
      historicalRecords.length >= 2
        ? historicalRecords.map((s) => s.value)
        : seedValues.length >= 2
        ? seedValues
        : [baseVal];

    if (sourceSeries.length === steps) {
      return [...sourceSeries];
    }
    // Interpolate or resample to requested step count
    const res: number[] = [];
    for (let i = 0; i < steps; i++) {
      const idxFloat = (i / (steps - 1 || 1)) * (sourceSeries.length - 1);
      const low = Math.floor(idxFloat);
      const high = Math.min(sourceSeries.length - 1, Math.ceil(idxFloat));
      const frac = idxFloat - low;
      const val = sourceSeries[low] * (1 - frac) + sourceSeries[high] * frac;
      res.push(Number(val.toFixed(2)));
    }
    return res;
  }

  // Check if premise is targeted by this scenario
  const isTarget =
    !scenarioPreset.targetVariable && !scenarioPreset.targetArtifactId
      ? true
      : premise.variableName === scenarioPreset.targetVariable ||
        premise.artifactId === scenarioPreset.targetArtifactId;

  // 2. Scenario-specific synthetic trajectories
  const values: number[] = [];

  if (!isTarget) {
    // Unrelated premise: remains at baseline with slight background jitter
    for (let i = 0; i < steps; i++) {
      if (premise.unit === "%" && baseVal >= 90) {
        const bpJitter = (rand() * 2 - 1) * 0.03;
        const finalVal = Math.min(99.85, Math.max(98.0, baseVal + bpJitter));
        values.push(Number(finalVal.toFixed(3)));
      } else {
        const noiseJitter = (rand() * 2 - 1) * ((noiseFactorPct * 0.4) / 100);
        let finalVal = baseVal * (1.0 + noiseJitter);
        if (premise.unit === "%") {
          finalVal = Math.min(100, Math.max(0, finalVal));
          values.push(Number(finalVal.toFixed(3)));
        } else if (baseVal >= 100) {
          values.push(Number(finalVal.toFixed(1)));
        } else {
          values.push(Number(finalVal.toFixed(2)));
        }
      }
    }
    return values;
  }

  const shockFactor = 1 + shockMagnitudePct / 100;

  for (let i = 0; i < steps; i++) {
    const progress = i / (steps - 1 || 1);
    let targetMultiplier = 1.0;

    switch (scenarioPreset.scenarioType) {
      case "PRICE_WAR_DEFLATION": {
        // Step cuts: Stable until step 3, -25% cut at step 4, second big drop at step 9
        if (i < Math.floor(steps * 0.2)) {
          targetMultiplier = 1.0;
        } else if (i < Math.floor(steps * 0.5)) {
          targetMultiplier = 1.0 + (shockMagnitudePct / 100) * 0.45;
        } else {
          targetMultiplier = shockFactor;
        }
        break;
      }

      case "LATENCY_SPIKE": {
        // Peak surge around middle steps, then sustained plateau
        if (i < Math.floor(steps * 0.15)) {
          targetMultiplier = 1.0;
        } else if (i < Math.floor(steps * 0.6)) {
          const surgeProgress =
            (i - steps * 0.15) / (steps * 0.6 - steps * 0.15);
          targetMultiplier = 1.0 + (shockMagnitudePct / 100) * surgeProgress;
        } else {
          targetMultiplier = shockFactor;
        }
        break;
      }

      case "VENDOR_OUTAGE": {
        // For uptime %, slight breach/recovery
        if (premise.unit === "%") {
          if (i < Math.floor(steps * 0.25)) {
            targetMultiplier = 1.0;
          } else if (i < Math.floor(steps * 0.6)) {
            // SLA breach down to ~98.4%
            targetMultiplier = 0.99;
          } else {
            // Recovery above 99.9%
            targetMultiplier = 1.006;
          }
        } else {
          targetMultiplier = 1.0 + (shockMagnitudePct / 100) * progress;
        }
        break;
      }

      case "FINOPS_DRAIN": {
        // Continuous steady drain
        targetMultiplier = 1.0 + (shockMagnitudePct / 100) * progress;
        break;
      }

      case "CAC_SURGE": {
        // S-curve surge
        const sCurve = 1 / (1 + Math.exp(-6 * (progress - 0.45)));
        targetMultiplier = 1.0 + (shockMagnitudePct / 100) * sCurve;
        break;
      }

      case "CUSTOM":
      default: {
        // Linear drift
        targetMultiplier = 1.0 + (shockMagnitudePct / 100) * progress;
        break;
      }
    }

    // Apply bounded noise
    let finalVal = baseVal * targetMultiplier;
    if (premise.unit === "%" && baseVal >= 90) {
      const bpNoise = (rand() * 2 - 1) * 0.02;
      finalVal = Math.min(100, Math.max(0, finalVal + bpNoise));
      values.push(Number(finalVal.toFixed(3)));
    } else {
      const noiseJitter = (rand() * 2 - 1) * (noiseFactorPct / 100);
      finalVal = baseVal * (targetMultiplier + noiseJitter);
      if (premise.unit === "%") {
        finalVal = Math.min(100, Math.max(0, finalVal));
        values.push(Number(finalVal.toFixed(3)));
      } else if (baseVal >= 100) {
        values.push(Number(finalVal.toFixed(1)));
      } else {
        values.push(Number(finalVal.toFixed(2)));
      }
    }
  }


  return values;
}

/**
 * Calculates Quantitative Premise Resilience Score (0 - 100).
 */
export function calculateResilienceMetrics(params: {
  steps: ReplayStepSnapshot[];
  operator: Operator;
  thresholdValue: string;
  decayWarningMargin: number;
}): {
  survivalRatePct: number;
  resilienceScore: number;
  resilienceRating: "HIGH" | "MODERATE" | "BRITTLE";
  firstDecayingStep: number | null;
  breachStep: number | null;
  breachValue: number | null;
  maxDriftPercent: number;
  minSafetyMarginRemaining: number;
} {
  const { steps } = params;
  const n = steps.length;
  if (n === 0) {
    return {
      survivalRatePct: 100,
      resilienceScore: 100,
      resilienceRating: "HIGH",
      firstDecayingStep: null,
      breachStep: null,
      breachValue: null,
      maxDriftPercent: 0,
      minSafetyMarginRemaining: 1.0,
    };
  }

  let stepsBroken = 0;
  let stepsDecaying = 0;
  let stepsValid = 0;
  let firstDecayingStep: number | null = null;
  let breachStep: number | null = null;
  let breachValue: number | null = null;
  let maxDriftPercent = 0;

  for (const s of steps) {
    if (s.driftPercent > maxDriftPercent) {
      maxDriftPercent = s.driftPercent;
    }
    if (s.status === "BROKEN") {
      stepsBroken++;
      if (breachStep === null) {
        breachStep = s.step;
        breachValue = s.simulatedValue;
      }
    } else if (s.status === "DECAYING") {
      stepsDecaying++;
      if (firstDecayingStep === null) {
        firstDecayingStep = s.step;
      }
    } else {
      stepsValid++;
    }
  }

  const survivalRatePct = Number(
    (((n - stepsBroken) / n) * 100).toFixed(1)
  );

  // Score Component 1 (Survival - max 45 pts)
  const c1Survival = (survivalRatePct / 100) * 45;

  // Score Component 2 (Clean validity health - max 30 pts)
  const c2MarginHealth = (stepsValid / n) * 30;

  // Score Component 3 (Decay delay - max 15 pts)
  let c3DecayDelay = 15;
  if (firstDecayingStep !== null) {
    c3DecayDelay = Math.round((firstDecayingStep / n) * 15);
  } else if (breachStep !== null) {
    c3DecayDelay = 0;
  }

  // Score Component 4 (Drift volatility absorption - max 10 pts)
  const c4Drift = Math.max(0, 100 - maxDriftPercent) * 0.1;

  const rawScore = c1Survival + c2MarginHealth + c3DecayDelay + c4Drift;
  const resilienceScore = Math.max(0, Math.min(100, Math.round(rawScore)));

  const resilienceRating =
    resilienceScore >= 80
      ? "HIGH"
      : resilienceScore >= 50
      ? "MODERATE"
      : "BRITTLE";

  const minSafetyMarginRemaining = Number(
    Math.max(0, 1 - maxDriftPercent / 100).toFixed(3)
  );

  return {
    survivalRatePct,
    resilienceScore,
    resilienceRating,
    firstDecayingStep,
    breachStep,
    breachValue,
    maxDriftPercent,
    minSafetyMarginRemaining,
  };
}

/**
 * Calculates the recommended threshold adjustments to survive the scenario shock without breach.
 */
export function calculateRecommendedThreshold(params: {
  operator: Operator;
  currentThreshold: string;
  minSimulated: number;
  maxSimulated: number;
  decayWarningMargin: number;
  unit: string;
}): {
  recommendedThreshold: string;
  recommendedThresholdAdjustment: string;
} {
  const {
    operator,
    currentThreshold,
    minSimulated,
    maxSimulated,
    decayWarningMargin,
    unit,
  } = params;

  const curNum = Number(currentThreshold);
  if (Number.isNaN(curNum)) {
    return {
      recommendedThreshold: currentThreshold,
      recommendedThresholdAdjustment: "Manual review required",
    };
  }

  const unitTag = unit ? ` ${unit}` : "";

  if (operator === "GT" || operator === "GTE") {
    // Must remain below minSimulated with safety margin
    const safeTarget = minSimulated / (1 + decayWarningMargin + 0.05);
    const rounded = Number(safeTarget.toFixed(2));
    if (rounded < curNum) {
      const deltaPct = Math.round(((curNum - rounded) / curNum) * 100);
      return {
        recommendedThreshold: String(rounded),
        recommendedThresholdAdjustment: `Adjust ${OPERATOR_SYMBOLS[operator]} ${rounded}${unitTag} (-${deltaPct}% safety buffer)`,
      };
    }
    return {
      recommendedThreshold: currentThreshold,
      recommendedThresholdAdjustment: "Current threshold sufficient (resilient bound)",
    };
  }

  if (operator === "LT" || operator === "LTE") {
    // Must remain above maxSimulated with safety margin
    const safeTarget = maxSimulated / (1 - decayWarningMargin - 0.05);
    const rounded =
      unit === "%" ? Math.min(99.99, Number(safeTarget.toFixed(3))) : Number(safeTarget.toFixed(2));
    if (rounded > curNum) {
      const deltaPct = Math.round(((rounded - curNum) / curNum) * 100);
      return {
        recommendedThreshold: String(rounded),
        recommendedThresholdAdjustment: `Adjust ${OPERATOR_SYMBOLS[operator]} ${rounded}${unitTag} (+${deltaPct}% safety buffer)`,
      };
    }
    return {
      recommendedThreshold: currentThreshold,
      recommendedThresholdAdjustment: "Current threshold sufficient (resilient bound)",
    };
  }

  return {
    recommendedThreshold: currentThreshold,
    recommendedThresholdAdjustment: "Current threshold matches bound",
  };
}

/**
 * Executes a full backtest simulation across all targeted artifacts, premises, and multi-hop cascade dependencies.
 */
export function runBacktestSimulation(
  artifacts: DecisionArtifactRecord[],
  options: BacktestOptions
): BacktestReport {
  const scenario =
    SCENARIO_PRESETS.find((s) => s.id === options.scenarioId) ||
    SCENARIO_PRESETS[0];

  const totalSteps = Math.max(
    5,
    Math.min(100, options.steps ?? scenario.defaultSteps)
  );
  const shockMagnitudePct =
    options.shockMagnitudePct ?? scenario.defaultShockPct;
  const noiseFactorPct = options.noiseFactorPct ?? scenario.defaultNoisePct;

  // Filter artifacts if artifactId is specified
  let targetArtifacts = artifacts;
  if (options.artifactId) {
    targetArtifacts = artifacts.filter(
      (a) =>
        a.id === options.artifactId ||
        (a.dependsOnIds && a.dependsOnIds.includes(options.artifactId!))
    );
    if (targetArtifacts.length === 0) {
      targetArtifacts = artifacts;
    }
  }

  const baseTimestamp = new Date("2026-10-23T00:00:00.000Z").getTime();
  const stepIntervalMs = 3600 * 1000; // 1 hour per step in virtual time-machine

  // Pre-generate series for each premise
  const premiseSeriesMap = new Map<string, number[]>();
  for (const art of targetArtifacts) {
    for (const p of art.premises) {
      if (options.premiseId && p.id !== options.premiseId) {
        // If single premise filtered, keep others stable
        const stableSeries = Array.from({ length: totalSteps }, () =>
          Number(p.currentValue)
        );
        premiseSeriesMap.set(p.id, stableSeries);
      } else {
        const series = generatePremiseReplaySeries({
          premise: p,
          scenarioPreset: scenario,
          steps: totalSteps,
          shockMagnitudePct,
          noiseFactorPct,
        });
        premiseSeriesMap.set(p.id, series);
      }
    }
  }

  // Step-by-step simulation state tracking
  const premiseSnapshotsMap = new Map<string, ReplayStepSnapshot[]>();
  for (const art of targetArtifacts) {
    for (const p of art.premises) {
      premiseSnapshotsMap.set(p.id, []);
    }
  }

  // Track artifact status timeline
  const artifactStatusTimeline = new Map<string, ArtifactStatus[]>();
  const cascadedFromTimeline = new Map<string, (string | null)[]>();
  for (const art of targetArtifacts) {
    artifactStatusTimeline.set(art.id, []);
    cascadedFromTimeline.set(art.id, []);
  }

  // Simulation execution loop across time steps
  for (let step = 0; step < totalSteps; step++) {
    const stepTime = new Date(baseTimestamp + step * stepIntervalMs).toISOString();

    // 1. Evaluate individual premises at step
    const premiseStatusAtStep = new Map<string, PremiseStatus>();
    for (const art of targetArtifacts) {
      for (const p of art.premises) {
        const series = premiseSeriesMap.get(p.id) || [];
        const simVal: number | null =
          series.length === 0 ? null : series[step] ?? series[series.length - 1];
        // A premise with no data stays UNBOUND for the whole replay
        const evalRes = evaluatePremiseState(
          simVal ?? "",
          p.operator,
          p.thresholdValue,
          p.decayWarningMargin
        );

        premiseStatusAtStep.set(p.id, evalRes.status);

        const snap: ReplayStepSnapshot = {
          step,
          timestamp: stepTime,
          premiseId: p.id,
          variableName: p.variableName,
          simulatedValue: simVal,
          status: evalRes.status,
          driftPercent: evalRes.driftPercent,
          isBreached: evalRes.status === "BROKEN",
          isDecaying: evalRes.status === "DECAYING",
          deltaFromThreshold: evalRes.deltaFromThreshold,
        };
        premiseSnapshotsMap.get(p.id)!.push(snap);
      }
    }

    // 2. Evaluate parent artifact status at step
    const rawArtStatus = new Map<string, ArtifactStatus>();
    for (const art of targetArtifacts) {
      const artPremiseStatuses = art.premises.map(
        (p) => premiseStatusAtStep.get(p.id) || "VALID"
      );
      const computed = computeArtifactStatus(
        artPremiseStatuses,
        art.logicCombinator || "ANY"
      );
      rawArtStatus.set(art.id, computed);
    }

    // 3. Multi-hop cascade propagation at step
    const effectiveStatus = new Map<string, ArtifactStatus>(rawArtStatus);
    const cascadeSource = new Map<string, string | null>();

    for (let pass = 0; pass < 5; pass++) {
      let changed = false;
      for (const art of targetArtifacts) {
        if (effectiveStatus.get(art.id) === "INVALIDATED") continue;
        const deps = art.dependsOnIds || [];
        const brokenUpstream = deps.find(
          (upId) => effectiveStatus.get(upId) === "INVALIDATED"
        );
        if (brokenUpstream) {
          effectiveStatus.set(art.id, "INVALIDATED");
          cascadeSource.set(art.id, brokenUpstream);
          changed = true;
        }
      }
      if (!changed) break;
    }

    for (const art of targetArtifacts) {
      artifactStatusTimeline.get(art.id)!.push(
        effectiveStatus.get(art.id) || "HEALTHY"
      );
      cascadedFromTimeline.get(art.id)!.push(
        cascadeSource.get(art.id) || null
      );
    }
  }

  // Compile Premise & Artifact results
  const artifactResults: ArtifactBacktestResult[] = [];
  let earliestBreachStep: number | null = null;
  let earliestBreachingPremiseId: string | null = null;
  let totalResilienceSum = 0;
  let totalPremiseCount = 0;
  let scoredPremiseCount = 0;

  for (const art of targetArtifacts) {
    const artPremiseResults: PremiseBacktestResult[] = [];
    const artTimeline = artifactStatusTimeline.get(art.id)!;
    const firstInvalidStep = artTimeline.findIndex((s) => s === "INVALIDATED");
    const cascTimeline = cascadedFromTimeline.get(art.id)!;
    const cascadedFromId =
      firstInvalidStep !== -1 ? cascTimeline[firstInvalidStep] : null;

    for (const p of art.premises) {
      totalPremiseCount++;
      const snaps = premiseSnapshotsMap.get(p.id)!;
      const metrics = calculateResilienceMetrics({
        steps: snaps,
        operator: p.operator,
        thresholdValue: p.thresholdValue,
        decayWarningMargin: p.decayWarningMargin,
      });

      const simVals = snaps
        .map((s) => s.simulatedValue)
        .filter((v): v is number => v !== null);
      const thresholdNum = Number(p.thresholdValue);
      const minSim = simVals.length ? Math.min(...simVals) : thresholdNum;
      const maxSim = simVals.length ? Math.max(...simVals) : thresholdNum;

      const hasData = simVals.length > 0;
      const thresholdAdvice = hasData
        ? calculateRecommendedThreshold({
            operator: p.operator,
            currentThreshold: p.thresholdValue,
            minSimulated: minSim,
            maxSimulated: maxSim,
            decayWarningMargin: p.decayWarningMargin,
            unit: p.unit,
          })
        : {
            recommendedThreshold: p.thresholdValue,
            recommendedThresholdAdjustment: "No data to replay yet",
          };

      if (metrics.breachStep !== null) {
        if (
          earliestBreachStep === null ||
          metrics.breachStep < earliestBreachStep
        ) {
          earliestBreachStep = metrics.breachStep;
          earliestBreachingPremiseId = p.id;
        }
      }

      // Premises with no data do not count toward any score
      if (hasData) {
        totalResilienceSum += metrics.resilienceScore;
        scoredPremiseCount += 1;
      }

      artPremiseResults.push({
        premiseId: p.id,
        artifactId: art.id,
        variableName: p.variableName,
        claim: p.claim,
        operator: p.operator,
        thresholdValue: p.thresholdValue,
        initialValue: String(p.currentValue ?? "").trim() ? Number(p.currentValue) : null,
        hasData,
        unit: p.unit,
        steps: snaps,
        survivalRatePct: metrics.survivalRatePct,
        resilienceScore: metrics.resilienceScore,
        resilienceRating: metrics.resilienceRating,
        firstDecayingStep: metrics.firstDecayingStep,
        breachStep: metrics.breachStep,
        breachValue: metrics.breachValue,
        maxDriftPercent: metrics.maxDriftPercent,
        minSafetyMarginRemaining: metrics.minSafetyMarginRemaining,
        recommendedThreshold: thresholdAdvice.recommendedThreshold,
        recommendedThresholdAdjustment:
          thresholdAdvice.recommendedThresholdAdjustment,
      });
    }

    const scoredPremises = artPremiseResults.filter((p) => p.hasData);
    const avgArtResilience =
      scoredPremises.length > 0
        ? Math.round(
            scoredPremises.reduce((acc, p) => acc + p.resilienceScore, 0) /
              scoredPremises.length
          )
        : 100;

    // Find downstream artifacts that cascaded from this one
    const downstreamCascaded = targetArtifacts
      .filter((other) => {
        const otherTimeline = cascadedFromTimeline.get(other.id)!;
        return otherTimeline.some((src) => src === art.id);
      })
      .map((other) => other.id);

    artifactResults.push({
      artifactId: art.id,
      title: art.title,
      targetLocus: art.targetLocus,
      logicCombinator: art.logicCombinator || "ANY",
      statusAtEnd: artTimeline[artTimeline.length - 1] || "HEALTHY",
      firstInvalidatedStep: firstInvalidStep !== -1 ? firstInvalidStep : null,
      cascadedFromId,
      cascadedDownstreamArtifactIds: downstreamCascaded,
      premises: artPremiseResults,
      overallResilienceScore: avgArtResilience,
    });
  }

  const avgResilience =
    scoredPremiseCount > 0
      ? Math.round(totalResilienceSum / scoredPremiseCount)
      : 100;

  const overallRating =
    avgResilience >= 80 ? "HIGH" : avgResilience >= 50 ? "MODERATE" : "BRITTLE";

  const invalidatedCount = artifactResults.filter(
    (a) => a.statusAtEnd === "INVALIDATED"
  ).length;
  const cascadedCount = artifactResults.filter(
    (a) => Boolean(a.cascadedFromId)
  ).length;

  return {
    scenario,
    executedAt: new Date().toISOString(),
    totalSteps,
    options,
    artifacts: artifactResults,
    summary: {
      totalArtifacts: artifactResults.length,
      totalPremises: totalPremiseCount,
      survivedArtifacts: artifactResults.length - invalidatedCount,
      invalidatedArtifacts: invalidatedCount,
      cascadedArtifacts: cascadedCount,
      averageResilienceScore: avgResilience,
      overallRating,
      earliestBreachStep,
      earliestBreachingPremiseId,
    },
  };
}
