/**
 * Horizon D: Live Outbound Dispatchers
 * 1. Slack Webhook (Block Kit alert with interactive 'Acknowledge' and 'Create PR' buttons)
 * 2. PagerDuty Events API v2 (Routing Key, dedup_key, severity, custom_details payload)
 */

import {
  ConnectorTestResult,
  InvalidationEventRecord,
  OPERATOR_SYMBOLS,
  PagerDutyDispatchResult,
  PagerDutyV2Payload,
  SlackBlockKitPayload,
  SlackDispatchResult,
} from "./types";

// ============================================================================
// 1. Slack Webhook Block Kit Dispatcher
// ============================================================================

export interface SlackWebhookConfig {
  webhookUrl: string;
  defaultChannel?: string;
  botUsername?: string;
  iconEmoji?: string;
  appBaseUrl?: string;
}

/**
 * Builds an architecture-grade Slack Block Kit payload with interactive action buttons.
 */
export function buildSlackBlockKitAlert(params: {
  event: InvalidationEventRecord;
  appBaseUrl?: string;
  channel?: string;
  username?: string;
}): SlackBlockKitPayload {
  const { event, appBaseUrl, channel, username } = params;
  const baseUrl = (
    appBaseUrl ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.PREMISE_APP_URL ||
    "https://premise-ops.com"
  ).replace(/\/+$/, "");
  const controlPlaneUrl = `${baseUrl}/#event-${event.id}`;
  const opSymbol = event.operator ? OPERATOR_SYMBOLS[event.operator] || event.operator : "";
  const unit = event.unit ? ` ${event.unit}` : "";
  const title = event.artifactTitle || "Architectural Decision";
  const locus = event.targetLocus || "workspace";

  const fallbackText = `🚨 PREMISE BROKEN: [${title}] ${event.variableName || "metric"} reached ${event.breakingValue}${unit} (Threshold: ${opSymbol} ${event.thresholdValue})`;

  const blocks: Array<Record<string, unknown>> = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `🚨 PREMISE BROKEN: ${title.slice(0, 70)}`,
        emoji: true,
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `🔴 *CRITICAL KILL-SWITCH* | Engine: *Premise v3.0* | Triggered: \`${event.triggeredAt}\` | Event: \`${event.id}\``,
        },
      ],
    },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*Violated Premise:*\n"${event.premiseClaim || "Load-bearing architectural assumption violated"}"`,
        },
        {
          type: "mrkdwn",
          text: `*Monitored Metric:*\n\`${event.variableName || "telemetry_metric"}\``,
        },
        {
          type: "mrkdwn",
          text: `*Breaking Telemetry:*\n*${event.breakingValue}${unit}* (Threshold: \`${opSymbol} ${event.thresholdValue}${unit}\`)`,
        },
        {
          type: "mrkdwn",
          text: `*Target Locus:*\n\`${locus}\``,
        },
      ],
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*⚡ Blast Radius:*\n${event.remediationPlan ? event.remediationPlan.split("\n")[0].slice(0, 180) : "Obsolete codebase locus and associated cloud resources require immediate teardown."}`,
      },
    },
    {
      type: "divider",
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "✅ Acknowledge Invalidation",
            emoji: true,
          },
          style: "primary",
          action_id: "premise_acknowledge_event",
          value: event.id,
        },
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "⚡ Open Teardown PR",
            emoji: true,
          },
          style: "danger",
          action_id: "premise_create_teardown_pr",
          value: event.id,
          url: controlPlaneUrl,
        },
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "🔍 View in Premise Control Plane",
            emoji: true,
          },
          action_id: "premise_view_control_plane",
          url: controlPlaneUrl,
        },
      ],
    },
  ];

  return {
    channel: channel || "#arch-decision-drift",
    username: username || "Premise Kill-Switch Bot",
    icon_emoji: ":boom:",
    text: fallbackText,
    blocks,
  };
}

/**
 * Dispatches an InvalidationEvent alert to a live Slack Webhook URL.
 */
export async function dispatchSlackWebhookAlert(params: {
  webhookUrl: string;
  event: InvalidationEventRecord;
  channel?: string;
  username?: string;
  appBaseUrl?: string;
  dryRun?: boolean;
}): Promise<SlackDispatchResult> {
  const { webhookUrl, event, channel, username, appBaseUrl, dryRun } = params;
  const payload = buildSlackBlockKitAlert({
    event,
    appBaseUrl,
    channel,
    username,
  });

  const summary = `Posted Block Kit Kill-Switch Alert to ${channel || "#arch-decision-drift"} (${event.variableName} = ${event.breakingValue})`;

  const hasWebhookUrl =
    typeof webhookUrl === "string" && /^https?:\/\//i.test(webhookUrl.trim());

  if (dryRun || !hasWebhookUrl) {
    const reason = dryRun
      ? "dry run was requested"
      : "no Slack webhook URL is set";
    return {
      ok: true,
      status: "DRY_RUN",
      statusCode: 0,
      webhookUrl: hasWebhookUrl ? webhookUrl : "",
      summary: `Dry run: nothing was sent (${reason}). Alert prepared for ${channel || "#arch-decision-drift"}.`,
      payload,
    };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timer);

    const responseBody = await res.text().catch(() => "");

    if (res.ok) {
      return {
        ok: true,
        status: "SENT",
        statusCode: res.status,
        webhookUrl,
        summary,
        payload,
        responseBody,
      };
    }

    return {
      ok: false,
      status: "FAILED",
      statusCode: res.status,
      webhookUrl,
      summary: `Slack dispatch failed with status ${res.status}`,
      payload,
      responseBody,
      error: `Slack Webhook returned HTTP ${res.status}: ${responseBody.slice(0, 200)}`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      status: "FAILED",
      statusCode: 0,
      webhookUrl,
      summary: `Slack dispatch request error: ${message}`,
      payload,
      error: message,
    };
  }
}

/**
 * Tests a Slack Incoming Webhook by sending a test Block Kit notification.
 */
export async function testSlackWebhook(
  webhookUrl: string,
  channel?: string
): Promise<ConnectorTestResult> {
  const startMs = Date.now();
  if (!webhookUrl?.trim()) {
    return {
      ok: false,
      connectorType: "SLACK",
      latencyMs: 1,
      message: "Slack Webhook URL cannot be empty",
      error: "Missing Webhook URL",
    };
  }

  const mockEvent: InvalidationEventRecord = {
    id: `test-event-${Date.now()}`,
    premiseId: "prem-test-cost",
    artifactId: "art-test-adr",
    previousValue: "2.80",
    breakingValue: "0.80",
    thresholdValue: "2.50",
    remediationPlan: "Teardown redundant caching proxy",
    acknowledged: false,
    triggeredAt: new Date().toISOString(),
    premiseClaim: "Token cost stays above $2.50",
    variableName: "token_cost_usd",
    operator: "GT",
    unit: "USD / 1M tokens",
    artifactTitle: "ADR-TEST: Live Slack Dispatcher Verification",
    targetLocus: "packages/llm-gateway/src/semantic-cache.ts",
  };

  const dispatchRes = await dispatchSlackWebhookAlert({
    webhookUrl,
    event: mockEvent,
    channel: channel || "#arch-decision-drift",
  });

  const latencyMs = Math.max(1, Date.now() - startMs);

  if (dispatchRes.status === "SENT") {
    return {
      ok: true,
      connectorType: "SLACK",
      latencyMs,
      message: `Successfully dispatched test Block Kit alert to Slack (${latencyMs}ms)`,
      details: {
        statusCode: dispatchRes.statusCode,
        channel: channel || "#arch-decision-drift",
        blocksCount: dispatchRes.payload.blocks.length,
      },
    };
  }

  return {
    ok: false,
    connectorType: "SLACK",
    latencyMs,
    message:
      dispatchRes.status === "DRY_RUN"
        ? dispatchRes.summary
        : `Failed to dispatch to Slack: ${dispatchRes.error || "Unknown error"}`,
    error: dispatchRes.error || dispatchRes.summary,
  };
}

// ============================================================================
// 2. PagerDuty Events API v2 Dispatcher
// ============================================================================

export interface PagerDutyConfig {
  routingKey: string;
  severity?: "critical" | "error" | "warning" | "info";
  appBaseUrl?: string;
  customEndpoint?: string;
}

/**
 * Builds a PagerDuty Events API v2 JSON payload with full architectural telemetry context.
 */
export function buildPagerDutyV2Payload(params: {
  event: InvalidationEventRecord;
  routingKey: string;
  severity?: "critical" | "error" | "warning" | "info";
  appBaseUrl?: string;
}): PagerDutyV2Payload {
  const { event, routingKey, severity = "critical", appBaseUrl } = params;
  const baseUrl = (
    appBaseUrl ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.PREMISE_APP_URL ||
    "https://premise-ops.com"
  ).replace(/\/+$/, "");
  const controlPlaneUrl = `${baseUrl}/#event-${event.id}`;
  const opSymbol = event.operator ? OPERATOR_SYMBOLS[event.operator] || event.operator : "";
  const unit = event.unit ? ` ${event.unit}` : "";
  const title = event.artifactTitle || "Architectural Decision";
  const locus = event.targetLocus || "workspace";

  const summary = `[PREMISE KILL-SWITCH] ${title}: ${event.variableName || "metric"} = ${event.breakingValue}${unit} (Threshold: ${opSymbol} ${event.thresholdValue})`;

  return {
    routing_key: routingKey.trim(),
    event_action: "trigger",
    dedup_key: `premise-${event.id}`,
    payload: {
      summary: summary.slice(0, 1024),
      source: "premise-decay-engine",
      severity,
      timestamp: event.triggeredAt || new Date().toISOString(),
      component: locus,
      group: "architecture-governance",
      class: "premise-invalidation",
      custom_details: {
        eventId: event.id,
        artifactId: event.artifactId,
        artifactTitle: title,
        premiseClaim: event.premiseClaim || "Load-bearing premise breached",
        variableName: event.variableName,
        operator: event.operator,
        thresholdValue: event.thresholdValue,
        previousValue: event.previousValue,
        breakingValue: event.breakingValue,
        unit: event.unit,
        targetLocus: locus,
        remediationPlanPreview: event.remediationPlan ? event.remediationPlan.slice(0, 500) : "",
      },
    },
    links: [
      {
        href: controlPlaneUrl,
        text: "Premise Control Plane & 1-Click Teardown Diff",
      },
    ],
  };
}

/**
 * Dispatches an InvalidationEvent incident to PagerDuty Events API v2.
 */
export async function dispatchPagerDutyEvent(params: {
  routingKey: string;
  event: InvalidationEventRecord;
  severity?: "critical" | "error" | "warning" | "info";
  appBaseUrl?: string;
  customEndpoint?: string;
  dryRun?: boolean;
}): Promise<PagerDutyDispatchResult> {
  const { routingKey, event, severity = "critical", appBaseUrl, customEndpoint, dryRun } = params;
  const targetEndpoint = customEndpoint || "https://events.pagerduty.com/v2/enqueue";
  const payload = buildPagerDutyV2Payload({
    event,
    routingKey,
    severity,
    appBaseUrl,
  });

  const dedupKey = payload.dedup_key;
  const summary = `Triggered PagerDuty V2 Incident (severity: ${severity}, dedup_key: ${dedupKey})`;

  const hasRoutingKey = Boolean(routingKey && routingKey.trim());

  if (dryRun || !hasRoutingKey) {
    const reason = dryRun
      ? "dry run was requested"
      : "no PagerDuty routing key is set";
    return {
      ok: true,
      status: "DRY_RUN",
      statusCode: 0,
      targetEndpoint,
      dedupKey,
      summary: `Dry run: nothing was sent (${reason}). Incident prepared with severity ${severity}.`,
      payload,
    };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(targetEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timer);

    let responseBody: unknown;
    try {
      responseBody = await res.json();
    } catch {
      responseBody = await res.text();
    }

    if (res.ok) {
      return {
        ok: true,
        status: "SENT",
        statusCode: res.status,
        targetEndpoint,
        dedupKey,
        summary,
        payload,
        responseBody,
      };
    }

    return {
      ok: false,
      status: "FAILED",
      statusCode: res.status,
      targetEndpoint,
      dedupKey,
      summary: `PagerDuty incident trigger failed with status ${res.status}`,
      payload,
      responseBody,
      error: `PagerDuty Events v2 returned HTTP ${res.status}: ${JSON.stringify(responseBody)}`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      status: "FAILED",
      statusCode: 0,
      targetEndpoint,
      dedupKey,
      summary: `PagerDuty dispatch request error: ${message}`,
      payload,
      error: message,
    };
  }
}

/**
 * Tests PagerDuty Events v2 connectivity by dispatching a test event.
 */
export async function testPagerDutyConnection(
  routingKey: string,
  severity?: "critical" | "error" | "warning" | "info"
): Promise<ConnectorTestResult> {
  const startMs = Date.now();
  if (!routingKey?.trim()) {
    return {
      ok: false,
      connectorType: "PAGERDUTY",
      latencyMs: 1,
      message: "PagerDuty Routing/Integration Key cannot be empty",
      error: "Missing Routing Key",
    };
  }

  const mockEvent: InvalidationEventRecord = {
    id: `pd-test-${Date.now()}`,
    premiseId: "prem-test-sla",
    artifactId: "art-test-adr",
    previousValue: "99.95",
    breakingValue: "98.50",
    thresholdValue: "99.90",
    remediationPlan: "Decommission fallback cloud cluster",
    acknowledged: false,
    triggeredAt: new Date().toISOString(),
    premiseClaim: "SLA availability stays above 99.90%",
    variableName: "sla_availability_pct",
    operator: "GTE",
    unit: "%",
    artifactTitle: "ADR-TEST: PagerDuty Events v2 Verification",
    targetLocus: "services/auth/src/provider.ts",
  };

  const dispatchRes = await dispatchPagerDutyEvent({
    routingKey,
    event: mockEvent,
    severity: severity || "warning",
  });

  const latencyMs = Math.max(1, Date.now() - startMs);

  if (dispatchRes.status === "SENT") {
    return {
      ok: true,
      connectorType: "PAGERDUTY",
      latencyMs,
      message: `Successfully connected to PagerDuty Events API v2 (${latencyMs}ms)`,
      details: {
        statusCode: dispatchRes.statusCode,
        dedupKey: dispatchRes.dedupKey,
        severity: severity || "warning",
      },
    };
  }

  return {
    ok: false,
    connectorType: "PAGERDUTY",
    latencyMs,
    message:
      dispatchRes.status === "DRY_RUN"
        ? dispatchRes.summary
        : `Failed to trigger PagerDuty event: ${dispatchRes.error || "Unknown error"}`,
    error: dispatchRes.error || dispatchRes.summary,
  };
}
