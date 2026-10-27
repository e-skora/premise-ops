import { describe, expect, test, beforeEach, mock } from "bun:test";
import {
  buildPrometheusHeaders,
  sanitizePrometheusBaseUrl,
  queryPrometheusInstant,
  queryPrometheusRange,
  testPrometheusConnection,
  getDatadogApiHost,
  buildDatadogHeaders,
  queryDatadogTimeseries,
  testDatadogConnection,
} from "../lib/telemetry-connectors";
import {
  buildSlackBlockKitAlert,
  dispatchSlackWebhookAlert,
  testSlackWebhook,
  buildPagerDutyV2Payload,
  dispatchPagerDutyEvent,
  testPagerDutyConnection,
} from "../lib/outbound-dispatchers";
import {
  saveConnectorSetting,
  getConnectorSetting,
  getAllConnectorSettings,
  getMaskedConnectorSettings,
  deleteConnectorSetting,
  dispatchInvalidationAlert,
  executeActiveProbes,
  getAllArtifactsWithRelations,
  getAllInvalidationEvents,
} from "../db";
import { InvalidationEventRecord } from "../lib/types";

describe("Horizon D: Production Telemetry Connectors & Live Outbound Dispatch", () => {
  // Sample InvalidationEvent for dispatcher tests
  const sampleEvent: InvalidationEventRecord = {
    id: "inv-test-token-cost",
    premiseId: "prem-adr-014-cost",
    artifactId: "art-adr-014",
    previousValue: "2.80",
    breakingValue: "0.80",
    thresholdValue: "2.50",
    remediationPlan:
      "Decommission semantic caching Redis cluster and rip out caching layer at examples/demo-repo/packages/llm-gateway/src/semantic-cache.ts",
    acknowledged: false,
    triggeredAt: "2026-10-23T01:40:00.000Z",
    premiseClaim: "Upstream OpenAI API pricing remains >= $2.50 per 1M tokens",
    variableName: "upstream_token_cost_usd",
    operator: "GT",
    unit: "USD / 1M tokens",
    artifactTitle: "ADR-014: Semantic Caching Gateway for LLM Queries",
    targetLocus: "examples/demo-repo/packages/llm-gateway/src/semantic-cache.ts:L1-L30",
  };

  // ==========================================================================
  // 1. Prometheus / Thanos Telemetry Connector Tests
  // ==========================================================================
  describe("1. Prometheus / Thanos Connector", () => {
    test("buildPrometheusHeaders builds correct bearer, basic, and custom headers", () => {
      // 1. None
      const hNone = buildPrometheusHeaders({
        baseUrl: "http://localhost:9090",
        authType: "none",
      });
      expect(hNone.Accept).toBe("application/json");
      expect(hNone.Authorization).toBeUndefined();

      // 2. Bearer
      const hBearer = buildPrometheusHeaders({
        baseUrl: "https://thanos.internal",
        authType: "bearer",
        bearerToken: "my-secret-token",
        customHeaders: { "THANOS-TENANT-ID": "tenant-llm" },
      });
      expect(hBearer.Authorization).toBe("Bearer my-secret-token");
      expect(hBearer["THANOS-TENANT-ID"]).toBe("tenant-llm");

      // 3. Basic
      const hBasic = buildPrometheusHeaders({
        baseUrl: "https://prom.internal",
        authType: "basic",
        username: "prom_user",
        password: "secret_password",
      });
      const expectedEncoded = Buffer.from("prom_user:secret_password").toString(
        "base64"
      );
      expect(hBasic.Authorization).toBe(`Basic ${expectedEncoded}`);
    });

    test("sanitizePrometheusBaseUrl cleans trailing slashes and handles defaults", () => {
      expect(sanitizePrometheusBaseUrl("http://localhost:9090/")).toBe(
        "http://localhost:9090"
      );
      expect(sanitizePrometheusBaseUrl("https://thanos.internal///")).toBe(
        "https://thanos.internal"
      );
      expect(sanitizePrometheusBaseUrl("")).toBe("http://localhost:9090");
    });

    test("queryPrometheusInstant parses vector responses and extracts scalar telemetry", async () => {
      const origFetch = globalThis.fetch;
      try {
        globalThis.fetch = (async (url: string | URL) => {
          const u = new URL(url.toString());
          expect(u.searchParams.get("query")).toBe("up{job='api'}");

          return new Response(
            JSON.stringify({
              status: "success",
              data: {
                resultType: "vector",
                result: [
                  {
                    metric: { __name__: "up", job: "api", instance: "node1" },
                    value: [1700000000, "1.45"],
                  },
                ],
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }) as unknown as typeof fetch;

        const res = await queryPrometheusInstant(
          { baseUrl: "http://localhost:9090", authType: "none" },
          "up{job='api'}"
        );

        expect(res.ok).toBe(true);
        expect(res.value).toBe(1.45);
        expect(res.resultType).toBe("vector");
        expect(res.metricLabels?.job).toBe("api");
      } finally {
        globalThis.fetch = origFetch;
      }
    });

    test("queryPrometheusRange parses matrix responses into time series", async () => {
      const origFetch = globalThis.fetch;
      try {
        globalThis.fetch = (async () => {
          return new Response(
            JSON.stringify({
              status: "success",
              data: {
                resultType: "matrix",
                result: [
                  {
                    metric: { __name__: "http_requests_total" },
                    values: [
                      [1700000000, "100.5"],
                      [1700000015, "102.3"],
                      [1700000030, "105.8"],
                    ],
                  },
                ],
              },
            }),
            { status: 200 }
          );
        }) as unknown as typeof fetch;

        const res = await queryPrometheusRange(
          { baseUrl: "http://localhost:9090", authType: "none" },
          "rate(http_requests_total[5m])",
          { startSec: 1700000000, endSec: 1700000030, stepSec: 15 }
        );

        expect(res.ok).toBe(true);
        expect(res.series.length).toBe(3);
        expect(res.latestValue).toBe(105.8);
        expect(res.series[0].value).toBe(100.5);
      } finally {
        globalThis.fetch = origFetch;
      }
    });

    test("testPrometheusConnection validates connectivity with instant vector probe", async () => {
      const origFetch = globalThis.fetch;
      try {
        globalThis.fetch = (async (url: string | URL) => {
          return new Response(
            JSON.stringify({
              status: "success",
              data: {
                resultType: "vector",
                result: [{ value: [1700000000, "1"] }],
              },
            }),
            { status: 200 }
          );
        }) as unknown as typeof fetch;

        const testRes = await testPrometheusConnection({
          baseUrl: "http://localhost:9090",
          authType: "none",
        });

        expect(testRes.ok).toBe(true);
        expect(testRes.connectorType).toBe("PROMETHEUS");
        expect(testRes.message).toContain("Successfully connected");
      } finally {
        globalThis.fetch = origFetch;
      }
    });
  });

  // ==========================================================================
  // 2. Datadog Metric API v2 Connector Tests
  // ==========================================================================
  describe("2. Datadog Metric API v2 Connector", () => {
    test("getDatadogApiHost maps regions correctly", () => {
      expect(getDatadogApiHost("datadoghq.com")).toBe(
        "https://api.datadoghq.com"
      );
      expect(getDatadogApiHost("datadoghq.eu")).toBe(
        "https://api.datadoghq.eu"
      );
      expect(getDatadogApiHost("us5.datadoghq.com")).toBe(
        "https://api.us5.datadoghq.com"
      );
      expect(getDatadogApiHost("https://custom.datadog.local")).toBe(
        "https://custom.datadog.local"
      );
    });

    test("buildDatadogHeaders formats DD-API-KEY and DD-APPLICATION-KEY", () => {
      const h = buildDatadogHeaders({
        apiKey: "dd-api-key-12345",
        appKey: "dd-app-key-67890",
      });
      expect(h["DD-API-KEY"]).toBe("dd-api-key-12345");
      expect(h["DD-APPLICATION-KEY"]).toBe("dd-app-key-67890");
      expect(h["Content-Type"]).toBe("application/json");
      expect(h["Accept"]).toBe("application/json");
    });

    test("queryDatadogTimeseries queries v2 API and extracts latest metric value", async () => {
      const origFetch = globalThis.fetch;
      try {
        globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
          const urlStr = url.toString();
          if (urlStr.includes("/api/v2/query/timeseries")) {
            const body = JSON.parse((init?.body as string) || "{}");
            expect(body.data?.attributes?.queries?.[0]?.query).toBe(
              "avg:system.cpu.user{*}"
            );

            return new Response(
              JSON.stringify({
                data: {
                  type: "timeseries_response",
                  attributes: {
                    times: [1700000000, 1700000060, 1700000120],
                    values: [[42.5, 45.1, 48.9]],
                    series: [{ unit: [{ name: "percent" }] }],
                  },
                },
              }),
              { status: 200 }
            );
          }
          return new Response("Not found", { status: 404 });
        }) as unknown as typeof fetch;

        const res = await queryDatadogTimeseries(
          {
            apiKey: "mock-api-key",
            appKey: "mock-app-key",
            site: "datadoghq.com",
          },
          "avg:system.cpu.user{*}"
        );

        expect(res.ok).toBe(true);
        expect(res.latestValue).toBe(48.9);
        expect(res.points.length).toBe(3);
        expect(res.unit).toBe("percent");
      } finally {
        globalThis.fetch = origFetch;
      }
    });

    test("queryDatadogTimeseries falls back to v1 metric query if v2 is unavailable", async () => {
      const origFetch = globalThis.fetch;
      try {
        globalThis.fetch = (async (url: string | URL) => {
          const urlStr = url.toString();
          if (urlStr.includes("/api/v2/query/timeseries")) {
            return new Response("V2 endpoint not enabled", { status: 400 });
          }
          if (urlStr.includes("/api/v1/query")) {
            return new Response(
              JSON.stringify({
                status: "ok",
                series: [
                  {
                    metric: "system.mem.used",
                    unit: [{ name: "byte" }],
                    pointlist: [
                      [1700000000000, 2048],
                      [1700000060000, 4096],
                    ],
                  },
                ],
              }),
              { status: 200 }
            );
          }
          return new Response("Not found", { status: 404 });
        }) as unknown as typeof fetch;

        const res = await queryDatadogTimeseries(
          {
            apiKey: "mock-api-key",
            appKey: "mock-app-key",
          },
          "system.mem.used{*}"
        );

        expect(res.ok).toBe(true);
        expect(res.latestValue).toBe(4096);
        expect(res.metricName).toBe("system.mem.used");
      } finally {
        globalThis.fetch = origFetch;
      }
    });

    test("testDatadogConnection validates credentials via /api/v1/validate", async () => {
      const origFetch = globalThis.fetch;
      try {
        globalThis.fetch = (async (url: string | URL) => {
          if (url.toString().includes("/api/v1/validate")) {
            return new Response(JSON.stringify({ valid: true }), {
              status: 200,
            });
          }
          return new Response("Not found", { status: 404 });
        }) as unknown as typeof fetch;

        const testRes = await testDatadogConnection({
          apiKey: "valid-key-12345",
          appKey: "valid-app-67890",
        });

        expect(testRes.ok).toBe(true);
        expect(testRes.connectorType).toBe("DATADOG");
        expect(testRes.message).toContain("Successfully validated Datadog");
      } finally {
        globalThis.fetch = origFetch;
      }
    });
  });

  // ==========================================================================
  // 3. Live Outbound Dispatchers: Slack Block Kit & PagerDuty Events v2
  // ==========================================================================
  describe("3. Live Outbound Dispatchers", () => {
    test("buildSlackBlockKitAlert produces interactive Block Kit blocks", () => {
      const payload = buildSlackBlockKitAlert({
        event: sampleEvent,
        channel: "#arch-killswitch",
      });

      expect(payload.channel).toBe("#arch-killswitch");
      expect(payload.text).toContain("PREMISE BROKEN");
      expect(payload.blocks.length).toBeGreaterThanOrEqual(5);

      // Header block
      const headerBlock = payload.blocks[0] as {
        type: string;
        text: { text: string };
      };
      expect(headerBlock.type).toBe("header");
      expect(headerBlock.text.text).toContain("ADR-014");

      // Fields section
      const fieldsSection = payload.blocks[2] as {
        type: string;
        fields: Array<{ text: string }>;
      };
      expect(fieldsSection.type).toBe("section");
      expect(fieldsSection.fields.some((f) => f.text.includes("0.80"))).toBe(
        true
      );
      expect(
        fieldsSection.fields.some((f) => f.text.includes("upstream_token_cost_usd"))
      ).toBe(true);

      // Actions block with interactive buttons
      const actionsBlock = payload.blocks[5] as {
        type: string;
        elements: Array<{ action_id: string; text: { text: string } }>;
      };
      expect(actionsBlock.type).toBe("actions");
      const actionIds = actionsBlock.elements.map((el) => el.action_id);
      expect(actionIds).toContain("premise_acknowledge_event");
      expect(actionIds).toContain("premise_create_teardown_pr");
      expect(actionIds).toContain("premise_view_control_plane");
    });

    test("dispatchSlackWebhookAlert sends alert via mock webhook and supports dryRun", async () => {
      // Dry run
      const dryRunRes = await dispatchSlackWebhookAlert({
        webhookUrl: "https://hooks.slack.com/services/T00/B00/mock",
        event: sampleEvent,
        dryRun: true,
      });
      expect(dryRunRes.ok).toBe(true);
      expect(dryRunRes.status).toBe("DRY_RUN");
      expect(dryRunRes.statusCode).toBe(0);
      expect(dryRunRes.responseBody).toBeUndefined();
      expect(dryRunRes.summary).toContain("Dry run: nothing was sent");

      // No webhook URL: also a dry run, never a fake success
      const noUrlRes = await dispatchSlackWebhookAlert({
        webhookUrl: "",
        event: sampleEvent,
      });
      expect(noUrlRes.status).toBe("DRY_RUN");
      expect(noUrlRes.summary).toContain("no Slack webhook URL is set");

      // Live mock dispatch
      const origFetch = globalThis.fetch;
      try {
        globalThis.fetch = (async () => {
          return new Response("ok", { status: 200 });
        }) as unknown as typeof fetch;

        const liveRes = await dispatchSlackWebhookAlert({
          webhookUrl:
            "https://hooks.slack.com/services/T111/B222/real-webhook-hash",
          event: sampleEvent,
          dryRun: false,
        });

        expect(liveRes.ok).toBe(true);
        expect(liveRes.status).toBe("SENT");
        expect(liveRes.statusCode).toBe(200);
        expect(liveRes.responseBody).toBe("ok");

        // A rejected webhook is a FAILED result with Slack's real answer
        globalThis.fetch = (async () => {
          return new Response("invalid_token", { status: 403 });
        }) as unknown as typeof fetch;
        const failedRes = await dispatchSlackWebhookAlert({
          webhookUrl:
            "https://hooks.slack.com/services/T111/B222/real-webhook-hash",
          event: sampleEvent,
        });
        expect(failedRes.ok).toBe(false);
        expect(failedRes.status).toBe("FAILED");
        expect(failedRes.error).toContain("invalid_token");
      } finally {
        globalThis.fetch = origFetch;
      }
    });

    test("buildPagerDutyV2Payload produces Events v2 schema with dedup_key & custom_details", () => {
      const payload = buildPagerDutyV2Payload({
        event: sampleEvent,
        routingKey: "test-routing-key-12345",
        severity: "critical",
      });

      expect(payload.routing_key).toBe("test-routing-key-12345");
      expect(payload.event_action).toBe("trigger");
      expect(payload.dedup_key).toBe(`premise-${sampleEvent.id}`);
      expect(payload.payload.severity).toBe("critical");
      expect(payload.payload.component).toBe(sampleEvent.targetLocus);
      expect(payload.payload.custom_details.eventId).toBe(sampleEvent.id);
      expect(payload.payload.custom_details.breakingValue).toBe("0.80");
      expect(payload.payload.custom_details.operator).toBe("GT");
    });

    test("dispatchPagerDutyEvent handles real endpoint call and dry-run", async () => {
      // Dry run
      const dryRes = await dispatchPagerDutyEvent({
        routingKey: "test-routing-key",
        event: sampleEvent,
        dryRun: true,
      });
      expect(dryRes.ok).toBe(true);
      expect(dryRes.status).toBe("DRY_RUN");
      expect(dryRes.statusCode).toBe(0);
      expect(dryRes.responseBody).toBeUndefined();
      expect(dryRes.dedupKey).toBe(`premise-${sampleEvent.id}`);

      // Mock live call
      const origFetch = globalThis.fetch;
      try {
        globalThis.fetch = (async () => {
          return new Response(
            JSON.stringify({
              status: "success",
              message: "Event processed",
              dedup_key: `premise-${sampleEvent.id}`,
            }),
            { status: 202 }
          );
        }) as unknown as typeof fetch;

        const liveRes = await dispatchPagerDutyEvent({
          routingKey: "1234567890abcdef1234567890abcdef", // valid length
          event: sampleEvent,
          severity: "critical",
          dryRun: false,
        });

        expect(liveRes.ok).toBe(true);
        expect(liveRes.status).toBe("SENT");
        expect(liveRes.statusCode).toBe(202);
        expect(liveRes.dedupKey).toBe(`premise-${sampleEvent.id}`);
      } finally {
        globalThis.fetch = origFetch;
      }
    });
  });

  // ==========================================================================
  // 4. Connector Settings SQLite Persistence & Secret Masking
  // ==========================================================================
  describe("4. Connector Settings SQLite Persistence", () => {
    test("saveConnectorSetting persists config and getMaskedConnectorSettings masks secrets", () => {
      // Save Prometheus
      saveConnectorSetting("PROMETHEUS", {
        baseUrl: "http://thanos.internal:9090",
        authType: "bearer",
        bearerToken: "top-secret-bearer-token-12345",
      });

      // Save Datadog
      saveConnectorSetting("DATADOG", {
        site: "datadoghq.eu",
        apiKey: "dd-api-key-abcdef98765",
        appKey: "dd-app-key-12345678901234567890",
      });

      // Save Slack
      saveConnectorSetting("SLACK", {
        webhookUrl:
          "https://hooks.slack.com/services/T11/B22/my-secret-webhook-key",
        defaultChannel: "#architecture-drift",
      });

      // Save PagerDuty
      saveConnectorSetting("PAGERDUTY", {
        routingKey: "pd-routing-key-999988887777",
        severity: "critical",
      });

      const maskedList = getMaskedConnectorSettings();
      expect(maskedList.length).toBe(4);

      const promMasked = maskedList.find((c) => c.connectorType === "PROMETHEUS");
      expect(promMasked?.isConfigured).toBe(true);
      expect(promMasked?.maskedConfig.baseUrl).toBe(
        "http://thanos.internal:9090"
      );
      // Secrets should be masked with ****
      expect(promMasked?.maskedConfig.bearerToken).toContain("****");
      expect(promMasked?.maskedConfig.bearerToken).not.toBe(
        "top-secret-bearer-token-12345"
      );

      const ddMasked = maskedList.find((c) => c.connectorType === "DATADOG");
      expect(ddMasked?.isConfigured).toBe(true);
      expect(ddMasked?.maskedConfig.site).toBe("datadoghq.eu");
      expect(ddMasked?.maskedConfig.apiKey).toContain("****");

      // Verify that re-saving with masked secret preserves the original secret
      saveConnectorSetting("PROMETHEUS", {
        baseUrl: "http://thanos.internal:9090",
        authType: "bearer",
        bearerToken: "****2345", // UI sent masked value back
      });

      const rawProm = getConnectorSetting("PROMETHEUS");
      const parsedProm = JSON.parse(rawProm!.configJson);
      expect(parsedProm.bearerToken).toBe("top-secret-bearer-token-12345"); // Preserved!
    });

    test("deleteConnectorSetting removes connector setting from SQLite", () => {
      saveConnectorSetting("PAGERDUTY", { routingKey: "test-pd-key" });
      expect(getConnectorSetting("PAGERDUTY")).not.toBeNull();

      deleteConnectorSetting("PAGERDUTY");
      expect(getConnectorSetting("PAGERDUTY")).toBeNull();
    });
  });

  // ==========================================================================
  // 5. End-to-End Probe Execution & Outbound Dispatch Integration
  // ==========================================================================
  describe("5. End-to-End Live Dispatch Integration", () => {
    test("dispatchInvalidationAlert with SLACK_WEBHOOK uses stored connector and logs audit entry", async () => {
      // Configure Slack connector
      saveConnectorSetting("SLACK", {
        webhookUrl: "https://hooks.slack.com/services/T00/B00/test-slack",
        defaultChannel: "#arch-live-alerts",
      });

      // Find an existing invalidation event or trigger one
      const events = getAllInvalidationEvents();
      let eventToDispatch = events[0];

      if (!eventToDispatch) {
        // Trigger probe execution to get events
        const res = await executeActiveProbes();
        eventToDispatch = res.invalidationEvents[0];
      }

      if (eventToDispatch) {
        const dispatchRes = await dispatchInvalidationAlert({
          eventId: eventToDispatch.id,
          channel: "SLACK_WEBHOOK",
          dryRun: true,
        });

        expect(dispatchRes.dispatchLog).toBeDefined();
        expect(dispatchRes.dispatchLog.channel).toBe("SLACK_WEBHOOK");
        expect(dispatchRes.dispatchLog.deliveryStatus).toBe("DRY_RUN");
        expect(dispatchRes.dispatchLog.responseStatus).toBe(0);
        expect(dispatchRes.dispatchLog.externalUrl).toBe("");

        // Check Block Kit payload
        const payload = JSON.parse(dispatchRes.dispatchLog.payloadPreview);
        expect(payload.blocks).toBeDefined();
        expect(payload.blocks.length).toBeGreaterThan(0);
      }
    });

    test("dispatchInvalidationAlert with PAGERDUTY_EVENT logs Events v2 payload into OutboundDispatchLog", async () => {
      saveConnectorSetting("PAGERDUTY", {
        routingKey: "test-pd-routing-key-1234",
        severity: "critical",
      });

      const events = getAllInvalidationEvents();
      if (events.length > 0) {
        const dispatchRes = await dispatchInvalidationAlert({
          eventId: events[0].id,
          channel: "PAGERDUTY_EVENT",
          dryRun: true,
        });

        expect(dispatchRes.dispatchLog).toBeDefined();
        expect(dispatchRes.dispatchLog.channel).toBe("PAGERDUTY_EVENT");
        expect(dispatchRes.dispatchLog.deliveryStatus).toBe("DRY_RUN");
        expect(dispatchRes.dispatchLog.responseStatus).toBe(0);
        expect(dispatchRes.dispatchLog.externalUrl).toBe("");

        const payload = JSON.parse(dispatchRes.dispatchLog.payloadPreview);
        expect(payload.event_action).toBe("trigger");
        expect(payload.dedup_key).toContain(events[0].id);
      }
    });
  });
});
