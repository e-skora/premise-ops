/**
 * Horizon D: Production Telemetry Connectors
 * 1. Prometheus / Thanos Live HTTP Client (/api/v1/query, /api/v1/query_range, Bearer / Basic auth, custom headers)
 * 2. Datadog Metric API v2 Connector (DD-API-KEY, DD-APPLICATION-KEY, query/timeseries, fallback query)
 */

import {
  ConnectorTestResult,
  DatadogConfig,
  DatadogTimeseriesResult,
  PrometheusConfig,
  PrometheusInstantQueryResult,
  PrometheusRangeQueryResult,
} from "./types";

// ============================================================================
// 1. Prometheus / Thanos Telemetry Connector
// ============================================================================

export function buildPrometheusHeaders(
  config: PrometheusConfig
): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(config.customHeaders || {}),
  };

  if (config.authType === "bearer" && config.bearerToken?.trim()) {
    headers["Authorization"] = `Bearer ${config.bearerToken.trim()}`;
  } else if (
    config.authType === "basic" &&
    config.username &&
    config.password !== undefined
  ) {
    const credentials = Buffer.from(
      `${config.username}:${config.password}`
    ).toString("base64");
    headers["Authorization"] = `Basic ${credentials}`;
  }

  return headers;
}

export function sanitizePrometheusBaseUrl(rawUrl: string): string {
  const trimmed = (rawUrl || "http://localhost:9090").trim();
  return trimmed.replace(/\/+$/, "");
}

/**
 * Executes a Prometheus/Thanos instant query against /api/v1/query.
 */
export async function queryPrometheusInstant(
  config: PrometheusConfig,
  query: string,
  timeSec?: number
): Promise<PrometheusInstantQueryResult> {
  const startMs = Date.now();
  const baseUrl = sanitizePrometheusBaseUrl(config.baseUrl);
  const targetUrl = new URL(`${baseUrl}/api/v1/query`);
  targetUrl.searchParams.set("query", query);
  if (timeSec) {
    targetUrl.searchParams.set("time", String(timeSec));
  }

  const timeoutMs = config.timeoutMs ?? 6000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(targetUrl.toString(), {
      method: "GET",
      headers: buildPrometheusHeaders(config),
      signal: controller.signal,
    });
    clearTimeout(timer);

    const latencyMs = Math.max(1, Date.now() - startMs);

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return {
        ok: false,
        query,
        resultType: "vector",
        value: null,
        latencyMs,
        error: `Prometheus HTTP ${res.status}: ${errText.slice(0, 250) || res.statusText}`,
      };
    }

    const payload = (await res.json()) as {
      status: string;
      data?: {
        resultType: "vector" | "matrix" | "scalar" | "string";
        result: unknown;
      };
      errorType?: string;
      error?: string;
    };

    if (payload.status !== "success" || !payload.data) {
      return {
        ok: false,
        query,
        resultType: payload.data?.resultType || "vector",
        value: null,
        latencyMs,
        rawResponse: payload,
        error:
          payload.error ||
          `Prometheus query error (${payload.errorType || "unknown"})`,
      };
    }

    const { resultType, result } = payload.data;
    let extractedValue: number | null = null;
    let metricLabels: Record<string, string> | undefined;
    let timestamp: number | undefined;

    if (resultType === "vector" && Array.isArray(result)) {
      if (result.length > 0) {
        const first = result[0] as {
          metric?: Record<string, string>;
          value?: [number, string];
        };
        metricLabels = first.metric;
        if (first.value && Array.isArray(first.value)) {
          timestamp = first.value[0];
          const parsed = parseFloat(first.value[1]);
          extractedValue = Number.isNaN(parsed) ? null : parsed;
        }
      }
    } else if (resultType === "scalar" && Array.isArray(result)) {
      timestamp = result[0] as number;
      const parsed = parseFloat(result[1] as string);
      extractedValue = Number.isNaN(parsed) ? null : parsed;
    } else if (resultType === "matrix" && Array.isArray(result)) {
      if (result.length > 0) {
        const first = result[0] as {
          metric?: Record<string, string>;
          values?: Array<[number, string]>;
        };
        metricLabels = first.metric;
        if (first.values && first.values.length > 0) {
          const last = first.values[first.values.length - 1];
          timestamp = last[0];
          const parsed = parseFloat(last[1]);
          extractedValue = Number.isNaN(parsed) ? null : parsed;
        }
      }
    } else if (resultType === "string" && Array.isArray(result)) {
      timestamp = result[0] as number;
      const parsed = parseFloat(result[1] as string);
      extractedValue = Number.isNaN(parsed) ? null : parsed;
    }

    return {
      ok: extractedValue !== null,
      query,
      resultType,
      value: extractedValue,
      timestamp,
      metricLabels,
      rawResponse: payload,
      latencyMs,
      ...(extractedValue === null
        ? { error: "Prometheus query returned empty result series" }
        : {}),
    };
  } catch (err) {
    clearTimeout(timer);
    const latencyMs = Math.max(1, Date.now() - startMs);
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      query,
      resultType: "vector",
      value: null,
      latencyMs,
      error: `Prometheus request failed: ${message}`,
    };
  }
}

/**
 * Executes a Prometheus/Thanos range query against /api/v1/query_range.
 */
export async function queryPrometheusRange(
  config: PrometheusConfig,
  query: string,
  options: {
    startSec: number;
    endSec: number;
    stepSec?: number;
  }
): Promise<PrometheusRangeQueryResult> {
  const startMs = Date.now();
  const baseUrl = sanitizePrometheusBaseUrl(config.baseUrl);
  const targetUrl = new URL(`${baseUrl}/api/v1/query_range`);
  targetUrl.searchParams.set("query", query);
  targetUrl.searchParams.set("start", String(options.startSec));
  targetUrl.searchParams.set("end", String(options.endSec));
  targetUrl.searchParams.set("step", String(options.stepSec || 15));

  const timeoutMs = config.timeoutMs ?? 8000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(targetUrl.toString(), {
      method: "GET",
      headers: buildPrometheusHeaders(config),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const latencyMs = Math.max(1, Date.now() - startMs);

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return {
        ok: false,
        query,
        resultType: "matrix",
        latestValue: null,
        series: [],
        latencyMs,
        error: `Prometheus HTTP ${res.status}: ${errText.slice(0, 250)}`,
      };
    }

    const payload = (await res.json()) as {
      status: string;
      data?: {
        resultType: string;
        result: Array<{
          metric?: Record<string, string>;
          values?: Array<[number, string]>;
        }>;
      };
      error?: string;
    };

    if (payload.status !== "success" || !payload.data?.result) {
      return {
        ok: false,
        query,
        resultType: payload.data?.resultType || "matrix",
        latestValue: null,
        series: [],
        rawResponse: payload,
        latencyMs,
        error: payload.error || "Prometheus range query returned error",
      };
    }

    const series: Array<{ timestamp: number; value: number }> = [];
    let metricLabels: Record<string, string> | undefined;

    if (payload.data.result.length > 0) {
      const first = payload.data.result[0];
      metricLabels = first.metric;
      if (first.values) {
        for (const [t, v] of first.values) {
          const num = parseFloat(v);
          if (!Number.isNaN(num)) {
            series.push({ timestamp: t, value: num });
          }
        }
      }
    }

    const latestValue =
      series.length > 0 ? series[series.length - 1].value : null;

    return {
      ok: series.length > 0,
      query,
      resultType: payload.data.resultType,
      latestValue,
      series,
      metricLabels,
      rawResponse: payload,
      latencyMs,
      ...(series.length === 0
        ? { error: "Range query returned zero samples" }
        : {}),
    };
  } catch (err) {
    clearTimeout(timer);
    const latencyMs = Math.max(1, Date.now() - startMs);
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      query,
      resultType: "matrix",
      latestValue: null,
      series: [],
      latencyMs,
      error: `Prometheus range request failed: ${message}`,
    };
  }
}

/**
 * Verifies connectivity to a Prometheus or Thanos cluster by running an instant check (query=vector(1) or up).
 */
export async function testPrometheusConnection(
  config: PrometheusConfig
): Promise<ConnectorTestResult> {
  const testRes = await queryPrometheusInstant(config, "vector(1)");
  if (testRes.ok) {
    return {
      ok: true,
      connectorType: "PROMETHEUS",
      latencyMs: testRes.latencyMs,
      message: `Successfully connected to Prometheus/Thanos at ${config.baseUrl} (${testRes.latencyMs}ms)`,
      details: {
        baseUrl: config.baseUrl,
        authType: config.authType,
        latencyMs: testRes.latencyMs,
        resultType: testRes.resultType,
        scalarValue: testRes.value,
      },
    };
  }

  // Fallback test: query time()
  const fallbackRes = await queryPrometheusInstant(config, "time()");
  if (fallbackRes.ok) {
    return {
      ok: true,
      connectorType: "PROMETHEUS",
      latencyMs: fallbackRes.latencyMs,
      message: `Successfully connected to Prometheus/Thanos at ${config.baseUrl} (${fallbackRes.latencyMs}ms)`,
      details: {
        baseUrl: config.baseUrl,
        authType: config.authType,
        latencyMs: fallbackRes.latencyMs,
        serverTime: fallbackRes.value,
      },
    };
  }

  return {
    ok: false,
    connectorType: "PROMETHEUS",
    latencyMs: testRes.latencyMs,
    message: `Failed to connect to Prometheus at ${config.baseUrl}: ${testRes.error || "Connection refused"}`,
    error: testRes.error,
  };
}

// ============================================================================
// 2. Datadog Metric API v2 Connector
// ============================================================================

export function getDatadogApiHost(site?: string): string {
  const s = (site || "datadoghq.com").trim().toLowerCase();
  if (s.startsWith("http://") || s.startsWith("https://")) {
    return s.replace(/\/+$/, "");
  }
  return `https://api.${s}`;
}

export function buildDatadogHeaders(
  config: DatadogConfig
): Record<string, string> {
  return {
    "DD-API-KEY": config.apiKey.trim(),
    "DD-APPLICATION-KEY": config.appKey.trim(),
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

/**
 * Ingests metrics from Datadog Metric API v2 (POST /api/v2/query/timeseries)
 * with graceful fallback to Datadog v1 metrics query (GET /api/v1/query).
 */
export async function queryDatadogTimeseries(
  config: DatadogConfig,
  query: string,
  options?: {
    fromSec?: number;
    toSec?: number;
  }
): Promise<DatadogTimeseriesResult> {
  const startMs = Date.now();
  const host = getDatadogApiHost(config.site);
  const nowSec = Math.floor(Date.now() / 1000);
  const toSec = options?.toSec || nowSec;
  const fromSec = options?.fromSec || toSec - 3600; // default 1 hour window

  if (!config.apiKey?.trim() || !config.appKey?.trim()) {
    return {
      ok: false,
      query,
      latestValue: null,
      points: [],
      latencyMs: 1,
      error: "Missing DD-API-KEY or DD-APPLICATION-KEY credentials",
    };
  }

  const timeoutMs = config.timeoutMs ?? 6000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // Attempt 1: Datadog Metrics API v2 (POST /api/v2/query/timeseries)
  try {
    const v2Url = `${host}/api/v2/query/timeseries`;
    const v2Payload = {
      data: {
        type: "timeseries_request",
        attributes: {
          from: fromSec,
          to: toSec,
          queries: [
            {
              name: "a",
              query: query,
              data_source: "metrics",
            },
          ],
        },
      },
    };

    const res = await fetch(v2Url, {
      method: "POST",
      headers: buildDatadogHeaders(config),
      body: JSON.stringify(v2Payload),
      signal: controller.signal,
    });

    if (res.ok) {
      clearTimeout(timer);
      const latencyMs = Math.max(1, Date.now() - startMs);
      const json = (await res.json()) as {
        data?: {
          attributes?: {
            series?: Array<{
              unit?: Array<{ name?: string }>;
              query_index?: number;
            }>;
            values?: number[][];
            times?: number[];
          };
        };
        errors?: Array<{ detail?: string }>;
      };

      const points: Array<{ timestamp: number; value: number }> = [];
      const times = json.data?.attributes?.times || [];
      const valuesMatrix = json.data?.attributes?.values || [];
      const firstSeriesValues = valuesMatrix[0] || [];

      for (let i = 0; i < firstSeriesValues.length; i++) {
        const val = firstSeriesValues[i];
        if (typeof val === "number" && !Number.isNaN(val)) {
          points.push({
            timestamp: times[i] || fromSec + i * 60,
            value: val,
          });
        }
      }

      if (points.length > 0) {
        return {
          ok: true,
          query,
          latestValue: points[points.length - 1].value,
          points,
          unit: json.data?.attributes?.series?.[0]?.unit?.[0]?.name,
          latencyMs,
          rawResponse: json,
        };
      }
    }
  } catch {
    // Proceed to v1 fallback
  }

  // Attempt 2: Datadog v1 Metrics Query API (GET /api/v1/query?from=...&to=...&query=...)
  try {
    const v1Url = new URL(`${host}/api/v1/query`);
    v1Url.searchParams.set("from", String(fromSec));
    v1Url.searchParams.set("to", String(toSec));
    v1Url.searchParams.set("query", query);

    const v1Res = await fetch(v1Url.toString(), {
      method: "GET",
      headers: buildDatadogHeaders(config),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const latencyMs = Math.max(1, Date.now() - startMs);

    if (!v1Res.ok) {
      const errText = await v1Res.text().catch(() => "");
      return {
        ok: false,
        query,
        latestValue: null,
        points: [],
        latencyMs,
        error: `Datadog HTTP ${v1Res.status}: ${errText.slice(0, 250) || v1Res.statusText}`,
      };
    }

    const v1Json = (await v1Res.json()) as {
      status?: string;
      error?: string;
      series?: Array<{
        metric?: string;
        unit?: Array<{ name?: string }>;
        pointlist?: Array<[number, number]>;
      }>;
    };

    if (v1Json.error) {
      return {
        ok: false,
        query,
        latestValue: null,
        points: [],
        latencyMs,
        rawResponse: v1Json,
        error: `Datadog query error: ${v1Json.error}`,
      };
    }

    const points: Array<{ timestamp: number; value: number }> = [];
    let metricName: string | undefined;
    let unit: string | undefined;

    if (v1Json.series && v1Json.series.length > 0) {
      const first = v1Json.series[0];
      metricName = first.metric;
      unit = first.unit?.[0]?.name;
      if (first.pointlist) {
        for (const [tsMs, val] of first.pointlist) {
          if (typeof val === "number" && !Number.isNaN(val)) {
            points.push({ timestamp: Math.floor(tsMs / 1000), value: val });
          }
        }
      }
    }

    const latestValue =
      points.length > 0 ? points[points.length - 1].value : null;

    return {
      ok: latestValue !== null,
      query,
      latestValue,
      points,
      unit,
      metricName,
      latencyMs,
      rawResponse: v1Json,
      ...(latestValue === null
        ? { error: "Datadog returned zero datapoints for query" }
        : {}),
    };
  } catch (err) {
    clearTimeout(timer);
    const latencyMs = Math.max(1, Date.now() - startMs);
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      query,
      latestValue: null,
      points: [],
      latencyMs,
      error: `Datadog request failed: ${message}`,
    };
  }
}

/**
 * Validates Datadog API & Application credentials via /api/v1/validate.
 */
export async function testDatadogConnection(
  config: DatadogConfig
): Promise<ConnectorTestResult> {
  const startMs = Date.now();
  if (!config.apiKey?.trim()) {
    return {
      ok: false,
      connectorType: "DATADOG",
      latencyMs: 1,
      message: "DD-API-KEY cannot be empty",
      error: "Missing API Key",
    };
  }

  const host = getDatadogApiHost(config.site);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs ?? 5000);

  try {
    const res = await fetch(`${host}/api/v1/validate`, {
      method: "GET",
      headers: {
        "DD-API-KEY": config.apiKey.trim(),
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    const latencyMs = Math.max(1, Date.now() - startMs);

    if (res.ok) {
      const data = (await res.json().catch(() => ({}))) as { valid?: boolean };
      if (data.valid !== false) {
        return {
          ok: true,
          connectorType: "DATADOG",
          latencyMs,
          message: `Successfully validated Datadog credentials against ${host} (${latencyMs}ms)`,
          details: {
            host,
            site: config.site || "datadoghq.com",
            latencyMs,
            valid: true,
          },
        };
      }
    }

    const errText = await res.text().catch(() => "");
    return {
      ok: false,
      connectorType: "DATADOG",
      latencyMs,
      message: `Datadog validation failed (HTTP ${res.status}): ${errText.slice(0, 180)}`,
      error: errText,
    };
  } catch (err) {
    clearTimeout(timer);
    const latencyMs = Math.max(1, Date.now() - startMs);
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      connectorType: "DATADOG",
      latencyMs,
      message: `Failed to connect to Datadog at ${host}: ${message}`,
      error: message,
    };
  }
}
