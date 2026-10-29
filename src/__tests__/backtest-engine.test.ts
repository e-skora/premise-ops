import { describe, expect, it } from "bun:test";
import {
  calculateRecommendedThreshold,
  calculateResilienceMetrics,
  generatePremiseReplaySeries,
  runBacktestSimulation,
  SCENARIO_PRESETS,
} from "../lib/backtest-engine";
import { getAllArtifactsWithRelations, resetDatabaseToSeed } from "../db";
import { PremiseRecord, ReplayStepSnapshot } from "../lib/types";

describe("Horizon C: Historical Drift Backtesting & Scenario Replay Engine", () => {
  const dummyPremise: PremiseRecord = {
    id: "prem-test-cost",
    artifactId: "art-test-01",
    claim: "Upstream token cost > $2.00 / 1M tokens",
    variableName: "upstream_llm_input_cost_usd",
    unit: "USD / 1M tokens",
    operator: "GT",
    thresholdValue: "2.00",
    currentValue: "3.00",
    decayWarningMargin: 0.15,
    status: "VALID",
    probes: [],
    metricSamples: [
      {
        id: "s1",
        premiseId: "prem-test-cost",
        variableName: "upstream_llm_input_cost_usd",
        value: 3.5,
        source: "test",
        recordedAt: "2026-10-19T00:00:00Z",
      },
      {
        id: "s2",
        premiseId: "prem-test-cost",
        variableName: "upstream_llm_input_cost_usd",
        value: 3.0,
        source: "test",
        recordedAt: "2026-10-19T01:00:00Z",
      },
    ],
  };

  it("1. Presets catalog contains complete scenario definitions", () => {
    expect(SCENARIO_PRESETS.length).toBeGreaterThanOrEqual(6);
    const priceWar = SCENARIO_PRESETS.find((s) => s.id === "price-war");
    expect(priceWar).toBeDefined();
    expect(priceWar?.scenarioType).toBe("PRICE_WAR_DEFLATION");
    expect(priceWar?.defaultShockPct).toBe(-60);

    const historical = SCENARIO_PRESETS.find((s) => s.id === "historical");
    expect(historical).toBeDefined();
    expect(historical?.scenarioType).toBe("HISTORICAL");

    const latencySpike = SCENARIO_PRESETS.find((s) => s.id === "latency-spike");
    expect(latencySpike).toBeDefined();
    expect(latencySpike?.category).toBe("INFRA_LATENCY");
  });

  it("2. generatePremiseReplaySeries generates realistic step-cut and historical series", () => {
    const priceWarPreset = SCENARIO_PRESETS.find((s) => s.id === "price-war")!;
    const series = generatePremiseReplaySeries({
      premise: dummyPremise,
      scenarioPreset: priceWarPreset,
      steps: 20,
      shockMagnitudePct: -60,
      noiseFactorPct: 0,
      seed: 42,
    });

    expect(series.length).toBe(20);
    // Initial step should be near baseline (3.00)
    expect(Math.abs(series[0] - 3.0) < 0.1).toBe(true);
    // End step should reflect -60% drop (~1.20)
    expect(series[19]).toBeLessThanOrEqual(1.3);
    expect(series[19]).toBeGreaterThanOrEqual(1.1);

    // Historical scenario extraction
    const histPreset = SCENARIO_PRESETS.find((s) => s.id === "historical")!;
    const histSeries = generatePremiseReplaySeries({
      premise: dummyPremise,
      scenarioPreset: histPreset,
      steps: 5,
      shockMagnitudePct: 0,
      noiseFactorPct: 0,
    });
    expect(histSeries.length).toBe(5);
    expect(histSeries[0]).toBe(3.5);
    expect(histSeries[4]).toBe(3.0);
  });

  it("3. calculateResilienceMetrics accurately scores resilient vs brittle trajectories", () => {
    // A. Clean healthy trajectory
    const healthySnaps: ReplayStepSnapshot[] = Array.from({ length: 10 }, (_, i) => ({
      step: i,
      timestamp: new Date().toISOString(),
      premiseId: "p1",
      variableName: "cost",
      simulatedValue: 3.0,
      status: "VALID",
      driftPercent: 10,
      isBreached: false,
      isDecaying: false,
      deltaFromThreshold: 1.0,
    }));

    const healthyMetrics = calculateResilienceMetrics({
      steps: healthySnaps,
      operator: "GT",
      thresholdValue: "2.00",
      decayWarningMargin: 0.1,
    });

    expect(healthyMetrics.survivalRatePct).toBe(100);
    expect(healthyMetrics.resilienceScore).toBeGreaterThanOrEqual(85);
    expect(healthyMetrics.resilienceRating).toBe("HIGH");
    expect(healthyMetrics.breachStep).toBeNull();

    // B. Trajectory that decays and breaches early
    const brokenSnaps: ReplayStepSnapshot[] = Array.from({ length: 10 }, (_, i) => {
      const isBreached = i >= 4;
      const isDecaying = i === 2 || i === 3;
      return {
        step: i,
        timestamp: new Date().toISOString(),
        premiseId: "p1",
        variableName: "cost",
        simulatedValue: isBreached ? 1.4 : isDecaying ? 2.1 : 3.0,
        status: isBreached ? "BROKEN" : isDecaying ? "DECAYING" : "VALID",
        driftPercent: isBreached ? 100 : isDecaying ? 80 : 15,
        isBreached,
        isDecaying,
        deltaFromThreshold: isBreached ? -0.6 : 0.1,
      };
    });

    const brokenMetrics = calculateResilienceMetrics({
      steps: brokenSnaps,
      operator: "GT",
      thresholdValue: "2.00",
      decayWarningMargin: 0.15,
    });

    expect(brokenMetrics.survivalRatePct).toBe(40);
    expect(brokenMetrics.resilienceScore).toBeLessThan(50);
    expect(brokenMetrics.resilienceRating).toBe("BRITTLE");
    expect(brokenMetrics.firstDecayingStep).toBe(2);
    expect(brokenMetrics.breachStep).toBe(4);
    expect(brokenMetrics.breachValue).toBe(1.4);
  });

  it("4. calculateRecommendedThreshold produces safe boundary adjustments", () => {
    // Under price drops to min 1.20, threshold > 2.00 should be lowered
    const adviceGt = calculateRecommendedThreshold({
      operator: "GT",
      currentThreshold: "2.00",
      minSimulated: 1.2,
      maxSimulated: 3.0,
      decayWarningMargin: 0.15,
      unit: "USD / 1M tokens",
    });

    expect(Number(adviceGt.recommendedThreshold)).toBeLessThan(1.2);
    expect(adviceGt.recommendedThresholdAdjustment).toContain("-");

    // Under CAC surge to max 82.00, threshold < 65.00 should be raised
    const adviceLt = calculateRecommendedThreshold({
      operator: "LT",
      currentThreshold: "65.00",
      minSimulated: 50.0,
      maxSimulated: 82.0,
      decayWarningMargin: 0.1,
      unit: "USD",
    });

    expect(Number(adviceLt.recommendedThreshold)).toBeGreaterThan(82.0);
    expect(adviceLt.recommendedThresholdAdjustment).toContain("+");
  });

  it("5. runBacktestSimulation evaluates all decisions and captures multi-hop cascade invalidation", () => {
    resetDatabaseToSeed();
    const artifacts = getAllArtifactsWithRelations();

    // Run price war scenario targeting ADR-014
    const report = runBacktestSimulation(artifacts, {
      scenarioId: "price-war",
      steps: 20,
      shockMagnitudePct: -60,
      noiseFactorPct: 2,
    });

    expect(report.totalSteps).toBe(20);
    expect(report.artifacts.length).toBe(4);

    const adr014 = report.artifacts.find((a) => a.artifactId === "art-adr-014");
    expect(adr014).toBeDefined();
    expect(adr014?.statusAtEnd).toBe("INVALIDATED");

    // VENDOR-04 depends on ADR-014 and must be invalidated via multi-hop cascade
    const vendor04 = report.artifacts.find(
      (a) => a.artifactId === "art-vendor-redis"
    );
    expect(vendor04).toBeDefined();
    expect(vendor04?.statusAtEnd).toBe("INVALIDATED");
    expect(vendor04?.cascadedFromId).toBe("art-adr-014");
    expect(adr014?.cascadedDownstreamArtifactIds).toContain("art-vendor-redis");

    expect(report.summary.invalidatedArtifacts).toBeGreaterThanOrEqual(2);
    expect(report.summary.cascadedArtifacts).toBeGreaterThanOrEqual(1);
  });

  it("6. runBacktestSimulation with historical telemetry proves initial baseline stability", () => {
    resetDatabaseToSeed();
    const artifacts = getAllArtifactsWithRelations();

    const report = runBacktestSimulation(artifacts, {
      scenarioId: "historical",
      steps: 15,
      shockMagnitudePct: 0,
      noiseFactorPct: 0,
    });

    expect(report.summary.survivedArtifacts).toBe(4);
    expect(report.summary.invalidatedArtifacts).toBe(0);
    expect(report.summary.overallRating).toBe("HIGH");

    // The live premise has no value until its first real fetch: no score, no advice
    const live = report.artifacts
      .flatMap((a) => a.premises)
      .find((p) => p.premiseId === "prem-adr-014-cost");
    expect(live?.hasData).toBe(false);
    expect(live?.initialValue).toBeNull();
    expect(live?.recommendedThreshold).toBe(live?.thresholdValue);
    expect(live?.steps.every((s) => s.simulatedValue === null && s.status === "UNBOUND")).toBe(true);
  });
});
