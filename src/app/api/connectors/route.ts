import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  deleteConnectorSetting,
  getConnectorSetting,
  getMaskedConnectorSettings,
  saveConnectorSetting,
} from "@/db";
import { ConnectorType } from "@/lib/types";
import {
  testDatadogConnection,
  testPrometheusConnection,
} from "@/lib/telemetry-connectors";
import {
  testPagerDutyConnection,
  testSlackWebhook,
} from "@/lib/outbound-dispatchers";
import { demoDisabledResponse, withDemoSandbox } from "@/lib/demo-sandbox";
import { isPublicDemo } from "@/lib/demo-mode";

export const dynamic = "force-dynamic";

const ConnectorTypeEnum = z.enum([
  "PROMETHEUS",
  "DATADOG",
  "SLACK",
  "PAGERDUTY",
]);

const ActionEnum = z.enum(["save", "delete", "test"]);

const ConnectorPostSchema = z.object({
  action: ActionEnum.default("save"),
  connectorType: ConnectorTypeEnum,
  config: z.record(z.unknown()).optional(),
});

async function handleGet() {
  try {
    const connectors = getMaskedConnectorSettings();
    return NextResponse.json({
      ok: true,
      connectors,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load connector settings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function handlePost(req: NextRequest) {
  // Public demo: no credentials saved, no connectivity tests sent out
  if (isPublicDemo()) {
    return demoDisabledResponse();
  }
  try {
    const body = await req.json();
    const { action, connectorType, config = {} } = ConnectorPostSchema.parse(body);

    if (action === "delete") {
      deleteConnectorSetting(connectorType as ConnectorType);
      return NextResponse.json({
        ok: true,
        connectorType,
        deleted: true,
        connectors: getMaskedConnectorSettings(),
      });
    }

    if (action === "save") {
      saveConnectorSetting(connectorType as ConnectorType, config);
      return NextResponse.json({
        ok: true,
        connectorType,
        saved: true,
        connectors: getMaskedConnectorSettings(),
      });
    }

    // action === "test"
    // Merge provided config with saved config so tests can use saved secrets if incoming has masked/empty secret
    const existing = getConnectorSetting(connectorType as ConnectorType);
    let effectiveConfig: Record<string, unknown> = { ...config };

    if (existing) {
      try {
        const saved = JSON.parse(existing.configJson) as Record<string, unknown>;
        for (const [k, v] of Object.entries(saved)) {
          const incomingVal = config[k];
          if (
            incomingVal === undefined ||
            incomingVal === "" ||
            (typeof incomingVal === "string" && incomingVal.startsWith("****"))
          ) {
            effectiveConfig[k] = v;
          }
        }
      } catch {
        // Use config as is
      }
    }

    let testResult: {
      ok: boolean;
      connectorType: ConnectorType;
      latencyMs: number;
      message: string;
      details?: unknown;
      error?: string;
    };

    if (connectorType === "PROMETHEUS") {
      const baseUrl = (effectiveConfig.baseUrl as string) || "http://localhost:9090";
      const authType = (effectiveConfig.authType as "none" | "bearer" | "basic") || "none";
      testResult = await testPrometheusConnection({
        baseUrl,
        authType,
        bearerToken: effectiveConfig.bearerToken as string | undefined,
        username: effectiveConfig.username as string | undefined,
        password: effectiveConfig.password as string | undefined,
        customHeaders: effectiveConfig.customHeaders as Record<string, string> | undefined,
      });
    } else if (connectorType === "DATADOG") {
      const apiKey = (effectiveConfig.apiKey as string) || "";
      const appKey = (effectiveConfig.appKey as string) || "";
      const site = (effectiveConfig.site as string) || "datadoghq.com";
      testResult = await testDatadogConnection({
        apiKey,
        appKey,
        site,
      });
    } else if (connectorType === "SLACK") {
      const webhookUrl = (effectiveConfig.webhookUrl as string) || "";
      const channel = (effectiveConfig.defaultChannel as string) || "#arch-decision-drift";
      testResult = await testSlackWebhook(webhookUrl, channel);
    } else {
      // PAGERDUTY
      const routingKey = (effectiveConfig.routingKey as string) || "";
      const severity =
        (effectiveConfig.severity as "critical" | "error" | "warning" | "info") ||
        "warning";
      testResult = await testPagerDutyConnection(routingKey, severity);
    }

    return NextResponse.json({
      ok: testResult.ok,
      testResult,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to execute connector operation";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export const GET = withDemoSandbox(handleGet);
export const POST = withDemoSandbox(handlePost);
