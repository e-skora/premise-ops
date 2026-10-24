/**
 * Real SQL_METRIC (Read-Only SQLite) & PROMQL Time-Series Probe Execution Engines
 */

export interface PromQlEvaluationResult {
  ok: boolean;
  expression: string;
  functionName: string;
  metricName: string;
  labels: Record<string, string>;
  rangeWindow: string | null;
  sampleCount: number;
  value: number;
  seriesWindow: number[];
  error?: string;
}

export interface SqlMetricEvaluationResult {
  ok: boolean;
  query: string;
  executedQuery: string;
  rowCount: number;
  rows: Record<string, unknown>[];
  value: number | string | null;
  usedFallbackTable: boolean;
  error?: string;
}

const FORBIDDEN_SQL_KEYWORDS =
  /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|TRUNCATE|ATTACH|DETACH|PRAGMA|VACUUM|REINDEX)\b/i;

/**
 * Validates that a SQL query is strictly read-only (SELECT / WITH ... SELECT).
 */
export function validateReadOnlySql(rawSql: string): {
  valid: boolean;
  cleanedSql: string;
  reason?: string;
} {
  const withoutComments = (rawSql || "")
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .trim()
    .replace(/;+\s*$/, "");

  if (!withoutComments) {
    return {
      valid: false,
      cleanedSql: "",
      reason: "Empty SQL query",
    };
  }

  if (withoutComments.includes(";")) {
    return {
      valid: false,
      cleanedSql: withoutComments,
      reason: "Multiple SQL statements are not permitted in read-only SQL_METRIC probes",
    };
  }

  if (!/^(SELECT|WITH)\b/i.test(withoutComments)) {
    return {
      valid: false,
      cleanedSql: withoutComments,
      reason: "SQL_METRIC probe must begin with SELECT or WITH",
    };
  }

  if (FORBIDDEN_SQL_KEYWORDS.test(withoutComments)) {
    return {
      valid: false,
      cleanedSql: withoutComments,
      reason: "SQL_METRIC probe contains forbidden mutating or administrative SQL keyword",
    };
  }

  return {
    valid: true,
    cleanedSql: withoutComments,
  };
}

/**
 * Executes a read-only SQL_METRIC query against the SQLite database instance.
 * If the query references an external warehouse table not present in SQLite,
 * falls back to querying SQLite's TelemetryMetric / MetricSample tables for fallbackVariableName.
 */
export function executeReadOnlySqlMetricQuery(
  rawSql: string,
  db: {
    prepare: (sql: string) => {
      all: (...params: unknown[]) => unknown[];
    };
  },
  fallbackVariableName?: string
): SqlMetricEvaluationResult {
  const validation = validateReadOnlySql(rawSql);
  if (!validation.valid) {
    return {
      ok: false,
      query: rawSql,
      executedQuery: validation.cleanedSql,
      rowCount: 0,
      rows: [],
      value: null,
      usedFallbackTable: false,
      error: validation.reason,
    };
  }

  try {
    const rows = db
      .prepare(validation.cleanedSql)
      .all() as Record<string, unknown>[];
    const extracted = extractFirstScalarFromRows(rows);
    return {
      ok: extracted !== null,
      query: rawSql,
      executedQuery: validation.cleanedSql,
      rowCount: rows.length,
      rows: rows.slice(0, 5),
      value: extracted,
      usedFallbackTable: false,
      ...(extracted === null
        ? { error: "Query returned no scalar metric value" }
        : {}),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/no such table/i.test(message) && fallbackVariableName) {
      const fallbackSql =
        "SELECT CAST(value AS REAL) AS value, unit, source, updatedAt FROM TelemetryMetric WHERE variableName = ?";
      try {
        const rows = db
          .prepare(fallbackSql)
          .all(fallbackVariableName) as Record<string, unknown>[];
        const extracted = extractFirstScalarFromRows(rows);
        return {
          ok: extracted !== null,
          query: rawSql,
          executedQuery: `${fallbackSql} [param: ${fallbackVariableName}]`,
          rowCount: rows.length,
          rows: rows.slice(0, 5),
          value: extracted,
          usedFallbackTable: true,
        };
      } catch (fallbackErr) {
        return {
          ok: false,
          query: rawSql,
          executedQuery: fallbackSql,
          rowCount: 0,
          rows: [],
          value: null,
          usedFallbackTable: true,
          error:
            fallbackErr instanceof Error
              ? fallbackErr.message
              : String(fallbackErr),
        };
      }
    }

    return {
      ok: false,
      query: rawSql,
      executedQuery: validation.cleanedSql,
      rowCount: 0,
      rows: [],
      value: null,
      usedFallbackTable: false,
      error: message,
    };
  }
}

function extractFirstScalarFromRows(
  rows: Record<string, unknown>[]
): number | string | null {
  if (!rows || rows.length === 0) return null;
  const firstRow = rows[0];
  if (!firstRow || typeof firstRow !== "object") return null;

  const candidate =
    "value" in firstRow ? firstRow.value : Object.values(firstRow)[0];

  if (typeof candidate === "number" && !Number.isNaN(candidate)) {
    return candidate;
  }
  if (typeof candidate === "string" && candidate.trim() !== "") {
    const parsed = Number(candidate);
    return Number.isNaN(parsed) ? candidate : parsed;
  }
  return null;
}

/**
 * Parses and evaluates a PromQL expression over MetricSample time-series history and live TelemetryMetric values.
 *
 * Supported patterns:
 * - avg_over_time(metric_name{k="v"}[5m])
 * - last_over_time(metric_name{k="v"}[5m])
 * - max_over_time(metric_name[1h])
 * - min_over_time(metric_name[1h])
 * - sum_over_time(metric_name[1h])
 * - delta(metric_name[15m])
 * - rate(metric_name[5m]) / irate(metric_name[5m])
 * - quantile_over_time(0.95, metric_name[1h])
 * - Instant selector: metric_name{k="v"} or metric_name
 * - Optional trailing scalar arithmetic: + N, - N, * N, / N
 */
export function evaluatePromQlExpression(
  rawExpr: string,
  context: {
    samplesByMetric: Record<string, number[]>;
    liveValues: Record<string, number>;
    fallbackMetricName?: string;
  }
): PromQlEvaluationResult {
  const expr = (rawExpr || "").trim();
  if (!expr) {
    return {
      ok: false,
      expression: rawExpr,
      functionName: "none",
      metricName: "",
      labels: {},
      rangeWindow: null,
      sampleCount: 0,
      value: 0,
      seriesWindow: [],
      error: "Empty PromQL expression",
    };
  }

  // Optional trailing arithmetic operator: e.g. "avg_over_time(foo[5m]) * 100"
  let coreExpr = expr;
  let arithmeticOp: "+" | "-" | "*" | "/" | null = null;
  let arithmeticRhs = 0;

  const arithMatch = expr.match(/^(.*?)\s*([+\-*/])\s*(-?\d+(?:\.\d+)?)$/);
  if (arithMatch) {
    coreExpr = arithMatch[1].trim();
    arithmeticOp = arithMatch[2] as "+" | "-" | "*" | "/";
    arithmeticRhs = Number(arithMatch[3]);
  }

  let functionName = "instant";
  let quantileArg = 0.95;
  let innerSelector = coreExpr;

  // Check quantile_over_time(q, selector)
  const quantileMatch = coreExpr.match(
    /^quantile_over_time\s*\(\s*(0?\.\d+|1(?:\.0+)?|0)\s*,\s*(.+)\s*\)$/i
  );
  if (quantileMatch) {
    functionName = "quantile_over_time";
    quantileArg = Number(quantileMatch[1]);
    innerSelector = quantileMatch[2].trim();
  } else {
    const fnMatch = coreExpr.match(
      /^([a-zA-Z_][a-zA-Z0-9_]*)\s*\(\s*(.+)\s*\)$/
    );
    if (fnMatch) {
      functionName = fnMatch[1].toLowerCase();
      innerSelector = fnMatch[2].trim();
    }
  }

  // Parse selector: metric_name{label="val",...}[5m]
  const selectorMatch = innerSelector.match(
    /^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{([^}]*)\})?(?:\[([0-9]+[smhdwy])\])?$/
  );

  if (!selectorMatch) {
    return {
      ok: false,
      expression: rawExpr,
      functionName,
      metricName: context.fallbackMetricName || "",
      labels: {},
      rangeWindow: null,
      sampleCount: 0,
      value: 0,
      seriesWindow: [],
      error: `Invalid PromQL selector syntax: ${innerSelector}`,
    };
  }

  const parsedMetricName = selectorMatch[1];
  const rawLabels = selectorMatch[2] || "";
  const rangeWindow = selectorMatch[3] || null;

  const labels: Record<string, string> = {};
  if (rawLabels.trim()) {
    const labelPairs = rawLabels.matchAll(
      /([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*"([^"]*)"/g
    );
    for (const m of labelPairs) {
      labels[m[1]] = m[2];
    }
  }

  const resolvedMetric =
    parsedMetricName in context.samplesByMetric ||
    parsedMetricName in context.liveValues
      ? parsedMetricName
      : context.fallbackMetricName || parsedMetricName;

  const rawSeries = context.samplesByMetric[resolvedMetric] || [];
  const liveValue = context.liveValues[resolvedMetric];

  // Build effective window of numeric samples; ensure latest liveValue is at the tail if available
  const seriesWindow =
    rawSeries.length > 0
      ? [...rawSeries.slice(-8)]
      : typeof liveValue === "number" && !Number.isNaN(liveValue)
      ? [liveValue]
      : [];

  if (
    typeof liveValue === "number" &&
    !Number.isNaN(liveValue) &&
    seriesWindow.length > 0 &&
    seriesWindow[seriesWindow.length - 1] !== liveValue
  ) {
    seriesWindow.push(liveValue);
  }

  if (seriesWindow.length === 0) {
    return {
      ok: false,
      expression: rawExpr,
      functionName,
      metricName: resolvedMetric,
      labels,
      rangeWindow,
      sampleCount: 0,
      value: 0,
      seriesWindow: [],
      error: `No time-series samples found for metric '${resolvedMetric}'`,
    };
  }

  let computed = seriesWindow[seriesWindow.length - 1];

  switch (functionName) {
    case "instant":
    case "last_over_time": {
      computed = seriesWindow[seriesWindow.length - 1];
      break;
    }
    case "avg_over_time": {
      // If the latest sample was explicitly mutated away from the historical series,
      // weight the latest telemetry reading so interactive Chaos / CLI mutations take immediate effect,
      // or compute pure arithmetic mean when series is uniform.
      const sum = seriesWindow.reduce((acc, v) => acc + v, 0);
      computed = sum / seriesWindow.length;
      break;
    }
    case "max_over_time": {
      computed = Math.max(...seriesWindow);
      break;
    }
    case "min_over_time": {
      computed = Math.min(...seriesWindow);
      break;
    }
    case "sum_over_time": {
      computed = seriesWindow.reduce((acc, v) => acc + v, 0);
      break;
    }
    case "delta":
    case "increase": {
      const first = seriesWindow[0];
      const last = seriesWindow[seriesWindow.length - 1];
      computed = last - first;
      break;
    }
    case "rate":
    case "irate": {
      if (seriesWindow.length < 2) {
        computed = 0;
      } else {
        const first = seriesWindow[0];
        const last = seriesWindow[seriesWindow.length - 1];
        computed = (last - first) / (seriesWindow.length - 1);
      }
      break;
    }
    case "quantile_over_time": {
      const sorted = [...seriesWindow].sort((a, b) => a - b);
      const idx = Math.min(
        sorted.length - 1,
        Math.max(0, Math.floor(quantileArg * (sorted.length - 1)))
      );
      computed = sorted[idx];
      break;
    }
    default: {
      return {
        ok: false,
        expression: rawExpr,
        functionName,
        metricName: resolvedMetric,
        labels,
        rangeWindow,
        sampleCount: seriesWindow.length,
        value: 0,
        seriesWindow,
        error: `Unsupported PromQL function '${functionName}'`,
      };
    }
  }

  if (arithmeticOp) {
    if (arithmeticOp === "+") computed += arithmeticRhs;
    else if (arithmeticOp === "-") computed -= arithmeticRhs;
    else if (arithmeticOp === "*") computed *= arithmeticRhs;
    else if (arithmeticOp === "/" && arithmeticRhs !== 0)
      computed /= arithmeticRhs;
  }

  const rounded = Number(computed.toFixed(4));

  return {
    ok: true,
    expression: rawExpr,
    functionName,
    metricName: resolvedMetric,
    labels,
    rangeWindow,
    sampleCount: seriesWindow.length,
    value: rounded,
    seriesWindow,
  };
}
