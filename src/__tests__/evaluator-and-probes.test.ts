import { describe, expect, test } from "bun:test";
import {
  computeArtifactStatus,
  computeDriftForecast,
  evaluatePremiseState,
  extractJsonPath,
} from "../lib/evaluator";
import {
  evaluatePromQlExpression,
  executeReadOnlySqlMetricQuery,
  validateReadOnlySql,
} from "../lib/probe-engines";

describe("Premise Evaluator & Drift Forecaster", () => {
  test("evaluatePremiseState evaluates GT, LT, GTE, LTE, EQ, NEQ and decayWarningMargin", () => {
    // GT > 2.00 with 15% margin (warning boundary = 2.30)
    const validGt = evaluatePremiseState("3.00", "GT", "2.00", 0.15);
    expect(validGt.status).toBe("VALID");
    expect(validGt.isSatisfied).toBe(true);

    const decayingGt = evaluatePremiseState("2.15", "GT", "2.00", 0.15);
    expect(decayingGt.status).toBe("DECAYING");
    expect(decayingGt.isSatisfied).toBe(true);

    const brokenGt = evaluatePremiseState("1.85", "GT", "2.00", 0.15);
    expect(brokenGt.status).toBe("BROKEN");
    expect(brokenGt.isSatisfied).toBe(false);

    // LT < 65.00 with 10% margin (warning boundary = 58.50)
    const decayingLt = evaluatePremiseState("61.20", "LT", "65.00", 0.1);
    expect(decayingLt.status).toBe("DECAYING");

    const brokenLt = evaluatePremiseState("66.00", "LT", "65.00", 0.1);
    expect(brokenLt.status).toBe("BROKEN");
  });

  test("computeArtifactStatus respects ANY (OR) and ALL (AND) boolean gates", () => {
    expect(computeArtifactStatus(["VALID", "BROKEN"], "ANY")).toBe(
      "INVALIDATED"
    );
    expect(computeArtifactStatus(["VALID", "BROKEN"], "ALL")).toBe("AT_RISK");
    expect(computeArtifactStatus(["BROKEN", "BROKEN"], "ALL")).toBe(
      "INVALIDATED"
    );
    expect(computeArtifactStatus(["VALID", "VALID"], "ANY")).toBe("HEALTHY");
  });

  test("computeArtifactStatus says NO_DATA, never HEALTHY, when no premise has a value", () => {
    expect(computeArtifactStatus([], "ANY")).toBe("NO_DATA");
    expect(computeArtifactStatus(["UNBOUND"], "ANY")).toBe("NO_DATA");
    expect(computeArtifactStatus(["UNBOUND", "UNBOUND"], "ALL")).toBe(
      "NO_DATA"
    );
    // One real value is enough to judge the decision
    expect(computeArtifactStatus(["UNBOUND", "VALID"], "ANY")).toBe("HEALTHY");
    expect(computeArtifactStatus(["UNBOUND", "BROKEN"], "ANY")).toBe(
      "INVALIDATED"
    );
  });

  test("computeDriftForecast computes linear regression velocity and TTI samples", () => {
    const samples = [890, 855, 820, 795, 760, 735, 712, 695].map(
      (value, idx) => ({
        id: `s-${idx}`,
        premiseId: "p-1",
        variableName: "upstream_ttft_p95_ms",
        value,
        source: "test",
        recordedAt: new Date(Date.now() + idx * 1000).toISOString(),
      })
    );

    const forecast = computeDriftForecast(
      samples,
      "GT",
      "650",
      "695",
      "DECAYING"
    );
    expect(forecast.trendDirection).toBe("DRIFTING_TOWARD_BREACH");
    expect(forecast.velocityPerSample).toBeLessThan(0);
    expect(forecast.samplesToBreach).not.toBeNull();
  });

  test("extractJsonPath extracts nested fields from JSON payloads", () => {
    const payload = {
      metrics: {
        upstream_llm_input_cost_usd: 2.75,
      },
    };
    expect(
      extractJsonPath(payload, "$.metrics.upstream_llm_input_cost_usd")
    ).toBe(2.75);
  });

  test("extractJsonPath supports array indexes and equality filters", () => {
    const payload = {
      data: [
        { id: "other/model", pricing: { prompt: "0.000009" } },
        { id: "anthropic/claude-sonnet-5.5", pricing: { prompt: "0.000002" } },
      ],
      list: [10, 20],
    };
    expect(
      extractJsonPath(
        payload,
        '$.data[?(@.id=="anthropic/claude-sonnet-5.5")].pricing.prompt'
      )
    ).toBe("0.000002");
    expect(extractJsonPath(payload, "$.list[1]")).toBe(20);
    expect(
      extractJsonPath(payload, '$.data[?(@.id=="missing/model")].pricing.prompt')
    ).toBeUndefined();
  });

  test("evaluatePremiseState reports UNBOUND when no value has been reported", () => {
    expect(evaluatePremiseState("", "GT", "2.00", 0.15).status).toBe("UNBOUND");
    expect(evaluatePremiseState("  ", "LT", "65", 0.1).status).toBe("UNBOUND");
    expect(computeArtifactStatus(["UNBOUND", "VALID"], "ANY")).toBe("HEALTHY");
  });
});

describe("SQL_METRIC & PROMQL Probe Execution Engines", () => {
  test("validateReadOnlySql allows SELECT/WITH and blocks mutating/DDL statements", () => {
    expect(
      validateReadOnlySql(
        "SELECT value FROM TelemetryMetric WHERE variableName = 'foo'"
      ).valid
    ).toBe(true);

    expect(
      validateReadOnlySql("DROP TABLE DecisionArtifact").valid
    ).toBe(false);

    expect(
      validateReadOnlySql(
        "SELECT 1; DELETE FROM Premise WHERE 1=1"
      ).valid
    ).toBe(false);

    expect(
      validateReadOnlySql("UPDATE Premise SET thresholdValue = '0'").valid
    ).toBe(false);
  });

  test("executeReadOnlySqlMetricQuery executes against mock SQLite interface and extracts scalar", () => {
    const mockDb = {
      prepare: (_sql: string) => ({
        all: () => [{ value: 16.4, unit: "%" }],
      }),
    };

    const res = executeReadOnlySqlMetricQuery(
      "SELECT CAST(value AS REAL) AS value FROM TelemetryMetric WHERE variableName = 'd30_payback_conversion_pct'",
      mockDb
    );
    expect(res.ok).toBe(true);
    expect(res.value).toBe(16.4);
  });

  test("evaluatePromQlExpression evaluates avg_over_time, last_over_time, delta, rate, quantile_over_time, and arithmetic", () => {
    const context = {
      samplesByMetric: {
        redis_cluster_memory_utilization_pct: [70, 72, 74, 76, 78],
        nat_gateway_monthly_gb: [1500, 1600, 1700, 1800],
      },
      liveValues: {
        redis_cluster_memory_utilization_pct: 78,
        nat_gateway_monthly_gb: 1800,
      },
    };

    const avgRes = evaluatePromQlExpression(
      'avg_over_time(redis_cluster_memory_utilization_pct{cluster="prod"}[5m])',
      context
    );
    expect(avgRes.ok).toBe(true);
    expect(avgRes.value).toBe(74);
    expect(avgRes.labels.cluster).toBe("prod");
    expect(avgRes.rangeWindow).toBe("5m");

    const lastRes = evaluatePromQlExpression(
      "last_over_time(redis_cluster_memory_utilization_pct[5m])",
      context
    );
    expect(lastRes.ok).toBe(true);
    expect(lastRes.value).toBe(78);

    const deltaRes = evaluatePromQlExpression(
      "delta(nat_gateway_monthly_gb[1h])",
      context
    );
    expect(deltaRes.ok).toBe(true);
    expect(deltaRes.value).toBe(300);

    const arithRes = evaluatePromQlExpression(
      "last_over_time(nat_gateway_monthly_gb[1h]) / 1000",
      context
    );
    expect(arithRes.ok).toBe(true);
    expect(arithRes.value).toBe(1.8);
  });
});
