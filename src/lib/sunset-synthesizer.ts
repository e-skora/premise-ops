import {
  ArtifactType,
  CompiledArtifactOutput,
  DecisionArtifactRecord,
  InvalidationEventRecord,
  PremiseRecord,
  SunsetRetireAndPromoteResult,
  SynthesizedReplacementAdr,
} from "./types";
import { calculateArtifactDrag } from "./finops-engine";

/**
 * Formulates a next-generation replacement architecture pattern and auto-generates
 * a schema-compliant replacement ADR (e.g. ADR-015) based on telemetry breach and target locus.
 */
export function synthesizeReplacementAdr(params: {
  artifact: DecisionArtifactRecord;
  breachingEvent?: InvalidationEventRecord;
  activeBreaches?: Array<{
    premise: PremiseRecord;
    currentValue: string;
    thresholdValue: string;
  }>;
} | DecisionArtifactRecord): SynthesizedReplacementAdr {
  const artifact = "artifact" in params ? params.artifact : params;
  const breachingEvent = "artifact" in params ? params.breachingEvent : undefined;
  const locus = artifact.targetLocus || "";
  const title = artifact.title || "";
  const blast = artifact.blastRadius || "";

  const dragMetrics = calculateArtifactDrag(artifact);
  const estimatedAnnualSavingsUsd = dragMetrics.annualizedDragUsd;

  // Pattern 1: LLM Gateway / Semantic Cache -> Direct Frontier Streaming & Native Prompt Caching
  if (
    locus.includes("semantic-cache") ||
    locus.includes("llm-gateway") ||
    artifact.id === "art-adr-014" ||
    artifact.premises.some((p) => p.variableName.includes("upstream_llm") || p.variableName.includes("upstream_ttft"))
  ) {
    const nextId = "art-adr-015";
    const nextTitle = "ADR-015: Direct Frontier Streaming with Native Vendor Prompt Caching (Replaces ADR-014)";
    const patternName = "Direct Frontier Streaming & Native Prompt Caching";
    const targetLocus = "examples/demo-repo/packages/llm-gateway/src/semantic-cache.ts:L1-L25";
    const blastRadius = "Replaces 4,200 LOC custom Redis vector cache with zero-infra direct streaming; saves $7,200/yr in dedicated Redis clusters.";

    const rationale =
      "Upstream frontier models now feature native prompt caching (e.g. Anthropic prompt caching, OpenAI cached tokens at 90% discount) and sustained P95 TTFT under 400ms. Maintaining a custom 3-node Redis vector cache microservice introduces net negative latency and $7,200/yr in obsolete cloud commitments.";

    const rawContent = `# ${nextTitle}
**Status:** Accepted | **Owner:** Core AI Platform | **Supersedes:** \`${artifact.title}\` | **Locus:** \`${targetLocus}\`

## Context & Problem Statement
In \`ADR-014\`, we deployed a dedicated 3-node Redis Stack cluster (\`redis-semantic-prod-01\`) to cache prompt completions because upstream frontier models were priced at > $2.00/1M tokens with TTFT exceeding 650ms. 

Telemetry recorded by the PremiseOps engine proved that upstream frontier model pricing dropped below the boundary and P95 TTFT stabilized below 450ms. The custom Redis HNSW cache lookup overhead (18-24ms) and $600/mo committed spend now represent pure architectural drag.

## Decision & Replacement Architecture
We decommission the custom Redis vector microservice and cascade-terminate \`VENDOR-04: Redis Enterprise Annual Commit\`. We adopt:
1. **Direct Passthrough Streaming:** High-concurrency SSE streaming directly to frontier model endpoints without local embedding calculation hops.
2. **Native Vendor Prompt Caching:** Leveraging automatic provider-side prefix caching for system prompts and few-shot examples, yielding 75-90% token discounts at zero operational infrastructure cost.

## Forward-Looking Load-Bearing Premises
This replacement architecture remains valid and funded while:
1. **Vendor Prompt Caching Efficiency:** Provider prompt caching discount >= 50.0% compared to standard input token cost.
2. **Frontier TTFT SLA:** Direct frontier model P95 TTFT <= 450ms during peak production windows.
3. **Gateway Infrastructure Cost:** Monthly cloud infrastructure spend for gateway routing < $100/mo (Eliminate dedicated vector hardware).

## Blast Radius & Decommissioning
- 4,200 LOC in \`examples/demo-repo/packages/llm-gateway/src/semantic-cache.ts\` deleted/bypassed.
- Multi-file callers in \`examples/demo-repo/services/gateway-consumer.ts\` updated to call direct baseline.
- Annual realized savings: $7,200/yr in cloud spend + 168 engineering hours/yr.`;

    const compiled: CompiledArtifactOutput = {
      title: nextTitle,
      type: "ADR",
      targetLocus,
      blastRadius,
      logicCombinator: "ANY",
      dependsOnIds: [],
      monthlyCloudSpendUsd: 18,
      maintenanceHoursPerMonth: 2,
      premises: [
        {
          claim: "Provider prompt caching discount >= 50.0% compared to standard input token cost",
          variableName: "vendor_prompt_cache_discount_pct",
          unit: "%",
          operator: "GTE",
          thresholdValue: "50.0",
          currentValue: "",
          decayWarningMargin: 0.1,
          recommendedProbe: {
            probeType: "HTTP_JSON_PATH",
            targetUrlOrQuery: "",
            jsonPath: "$.metrics.vendor_prompt_cache_discount_pct",
            pollingIntervalSeconds: 300,
          },
        },
        {
          claim: "Direct frontier model P95 TTFT <= 450ms without cache hop",
          variableName: "upstream_ttft_p95_ms",
          unit: "ms",
          operator: "LTE",
          thresholdValue: "450",
          currentValue: "",
          decayWarningMargin: 0.1,
          recommendedProbe: {
            probeType: "HTTP_JSON_PATH",
            targetUrlOrQuery: "",
            jsonPath: "$.metrics.upstream_ttft_p95_ms",
            pollingIntervalSeconds: 60,
          },
        },
        {
          claim: "Gateway routing cloud infrastructure spend < $100/mo",
          variableName: "gateway_monthly_cloud_spend_usd",
          unit: "USD",
          operator: "LT",
          thresholdValue: "100",
          currentValue: "",
          decayWarningMargin: 0.15,
          recommendedProbe: {
            probeType: "SQL_METRIC",
            targetUrlOrQuery:
              "SELECT CAST(value AS REAL) AS value FROM TelemetryMetric WHERE variableName = 'gateway_monthly_cloud_spend_usd'",
            jsonPath: "$.value",
            pollingIntervalSeconds: 600,
          },
        },
      ],
    };

    return {
      id: nextId,
      replacementAdrId: "ADR-015",
      title: nextTitle,
      type: "ADR",
      targetLocus,
      blastRadius,
      rawContent,
      compiled,
      supersedesArtifactId: artifact.id,
      supersedesTitle: artifact.title,
      rationale,
      patternName,
      estimatedAnnualSavingsUsd,
      forwardLookingPremisesCount: compiled.premises.length,
    };
  }

  // Pattern 2: Webhook Outbox Failover -> Direct Ephemeral Ingestion
  if (
    locus.includes("queue.ts") ||
    locus.includes("ingest-worker") ||
    artifact.id === "art-pr-892" ||
    artifact.premises.some((p) => p.variableName.includes("webhook") || p.variableName.includes("uptime"))
  ) {
    const nextId = "art-adr-016";
    const nextTitle = "ADR-016: Direct Webhook Dispatch with In-Memory Linear Retry (Replaces PR #892)";
    const patternName = "Direct Ephemeral Dispatch & Zero-Outbox Pipeline";
    const targetLocus = "examples/demo-repo/services/ingest-worker/queue.ts:L1-L25";
    const blastRadius = "Removes 1,850 LOC BullMQ dead-letter retry worker + $420/mo secondary relay cluster; eliminates 14ms write overhead.";

    const rationale =
      "Primary webhook provider has exceeded 99.9% rolling 30-day uptime SLA. Maintaining dual-write transactional outbox tables and secondary relay workers creates unnecessary latency overhead and $5,040/yr in idle cloud infrastructure.";

    const rawContent = `# ${nextTitle}
**Status:** Accepted | **Owner:** SRE Platform | **Supersedes:** \`${artifact.title}\` | **Locus:** \`${targetLocus}\`

## Context & Problem Statement
In \`PR #892\`, we introduced a dual-write outbox table and BullMQ dead-letter state machine in \`examples/demo-repo/services/ingest-worker/queue.ts\` because the primary webhook provider was dropping events (uptime < 99.9%).

Telemetry shows primary provider has sustained >= 99.9% uptime over rolling 30 days. The dual-write database lock and secondary relay cluster now cause 14ms write overhead per checkout.

## Decision & Replacement Architecture
We remove the BullMQ dead-letter failover state machine and secondary relay cluster. We transition to direct HTTP dispatch with lightweight in-memory linear backoff (max 3 retries, 1500ms max timeout).

## Forward-Looking Premises
1. **Primary Provider SLA:** Primary webhook provider SLA uptime >= 99.9% over rolling 30d window.
2. **Direct Dispatch Latency:** P99 webhook write overhead < 50ms (Zero outbox table contention).

## Blast Radius & Decommissioning
- 1,850 LOC BullMQ retry queue removed from \`examples/demo-repo/services/ingest-worker/queue.ts\`.
- Decommission secondary webhook relay cluster in \`us-east-1\` ($420/mo saved).`;

    const compiled: CompiledArtifactOutput = {
      title: nextTitle,
      type: "ADR",
      targetLocus,
      blastRadius,
      logicCombinator: "ANY",
      dependsOnIds: [],
      monthlyCloudSpendUsd: 0,
      maintenanceHoursPerMonth: 2,
      premises: [
        {
          claim: "Primary webhook provider SLA uptime >= 99.9% over rolling 30d",
          variableName: "primary_webhook_uptime_pct",
          unit: "%",
          operator: "GTE",
          thresholdValue: "99.9",
          currentValue: "",
          decayWarningMargin: 0.003,
          recommendedProbe: {
            probeType: "HTTP_JSON_PATH",
            targetUrlOrQuery: "",
            jsonPath: "$.metrics.primary_webhook_uptime_pct",
            pollingIntervalSeconds: 120,
          },
        },
        {
          claim: "Direct webhook dispatch P99 write latency < 50ms",
          variableName: "webhook_write_latency_p99_ms",
          unit: "ms",
          operator: "LT",
          thresholdValue: "50",
          currentValue: "",
          decayWarningMargin: 0.1,
          recommendedProbe: {
            probeType: "SQL_METRIC",
            targetUrlOrQuery:
              "SELECT CAST(value AS REAL) AS value FROM TelemetryMetric WHERE variableName = 'webhook_write_latency_p99_ms'",
            jsonPath: "$.value",
            pollingIntervalSeconds: 300,
          },
        },
      ],
    };

    return {
      id: nextId,
      replacementAdrId: "ADR-016",
      title: nextTitle,
      type: "ADR",
      targetLocus,
      blastRadius,
      rawContent,
      compiled,
      supersedesArtifactId: artifact.id,
      supersedesTitle: artifact.title,
      rationale,
      patternName,
      estimatedAnnualSavingsUsd,
      forwardLookingPremisesCount: compiled.premises.length,
    };
  }

  // Pattern 3: GTM Paid Acquisition -> Product-Led Growth
  if (
    locus.includes("growth") ||
    locus.includes("paid-acquisition") ||
    artifact.id === "art-gtm-q3" ||
    artifact.premises.some((p) => p.variableName.includes("cac") || p.variableName.includes("conversion"))
  ) {
    const nextId = "art-memo-017";
    const nextTitle = "MEMO-017: Product-Led Growth & Open-Source Community Telemetry (Replaces GTM-Q3)";
    const patternName = "Product-Led Organic Growth & Developer Loops";
    const targetLocus = "examples/demo-repo/ops/growth/paid-acquisition-budget.yaml:L1-L20";
    const blastRadius = "Pauses $45,000/mo high-intent search ad spend and sunsets 3 Clearbit attribution enrichment workers.";

    const rationale =
      "Search keyword competition drove blended CAC over the $65.00 limit while payback conversion drifted below 14.5%. Reallocating budget from paid ad groups into interactive sandbox documentation and open-source telemetry loops.";

    const rawContent = `# ${nextTitle}
**Status:** Accepted | **Owner:** VP Growth & RevOps | **Supersedes:** \`${artifact.title}\` | **Locus:** \`${targetLocus}\`

## Strategic Thesis
In \`GTM-Q3\`, we funded $45,000/mo in paid search keywords. Auction competition pushed CAC past $65.00, rendering paid customer acquisition non-viable.

## Decision & Reallocation
We freeze paid search ad groups and sunset Clearbit enrichers. We reallocate capital into organic developer acquisition, CLI telemetry, and interactive sandbox onboarding.

## Forward-Looking Premises
1. **Organic Adoption Share:** Organic developer signup share >= 70.0% of weekly active workspaces.
2. **Product-Led CAC:** Blended developer onboarding CAC < $20.00.`;

    const compiled: CompiledArtifactOutput = {
      title: nextTitle,
      type: "STRATEGY_MEMO",
      targetLocus,
      blastRadius,
      logicCombinator: "ANY",
      dependsOnIds: [],
      monthlyCloudSpendUsd: 2500,
      maintenanceHoursPerMonth: 6,
      premises: [
        {
          claim: "Organic developer signup share >= 70.0%",
          variableName: "organic_signup_share_pct",
          unit: "%",
          operator: "GTE",
          thresholdValue: "70.0",
          currentValue: "",
          decayWarningMargin: 0.1,
          recommendedProbe: {
            probeType: "HTTP_JSON_PATH",
            targetUrlOrQuery: "",
            jsonPath: "$.metrics.organic_signup_share_pct",
            pollingIntervalSeconds: 600,
          },
        },
        {
          claim: "Product-led developer acquisition cost < $20.00",
          variableName: "product_led_cac_usd",
          unit: "USD",
          operator: "LT",
          thresholdValue: "20.00",
          currentValue: "",
          decayWarningMargin: 0.1,
          recommendedProbe: {
            probeType: "HTTP_JSON_PATH",
            targetUrlOrQuery: "",
            jsonPath: "$.metrics.product_led_cac_usd",
            pollingIntervalSeconds: 600,
          },
        },
      ],
    };

    return {
      id: nextId,
      replacementAdrId: "MEMO-017",
      title: nextTitle,
      type: "STRATEGY_MEMO",
      targetLocus,
      blastRadius,
      rawContent,
      compiled,
      supersedesArtifactId: artifact.id,
      supersedesTitle: artifact.title,
      rationale,
      patternName,
      estimatedAnnualSavingsUsd,
      forwardLookingPremisesCount: compiled.premises.length,
    };
  }

  // Generic Pattern Fallback
  const sanitizedTitle = title.replace(/^ADR-\d+:\s*|^PR\s*#\d+:\s*|^GTM-[^:]+:\s*/, "");
  const nextId = `art-adr-auto-${Date.now().toString().slice(-4)}`;
  const nextTitle = `ADR-AUTOGEN: Cloud-Native Baseline Refactor for ${sanitizedTitle}`;
  const patternName = "Automated Cloud-Native Baseline Refactor";
  const targetLocus = artifact.targetLocus;
  const blastRadius = `Decommission obsolete workaround layer in ${artifact.targetLocus}.`;
  const rationale = `Load-bearing premises in '${title}' have been invalidated by live telemetry. Workaround layer decommissioned in favor of managed baseline.`;

  const rawContent = `# ${nextTitle}
**Status:** Accepted | **Supersedes:** \`${artifact.title}\` | **Locus:** \`${targetLocus}\`

## Context & Invalidation Rationale
The original assumptions in \`${artifact.title}\` no longer hold true based on live telemetry assertions.

## Decision
Decommission the workaround layer and revert to the direct cloud-native baseline.`;

  const anchorPremise = artifact.premises[0];
  const compiled: CompiledArtifactOutput = {
    title: nextTitle,
    type: "ADR",
    targetLocus,
    blastRadius,
    logicCombinator: "ANY",
    dependsOnIds: [],
    monthlyCloudSpendUsd: 0,
    maintenanceHoursPerMonth: 2,
    premises: [
      {
        claim: anchorPremise
          ? `Baseline performance of ${anchorPremise.variableName} remains within SLA`
          : "System error rate remains below 0.1%",
        variableName: anchorPremise
          ? `baseline_${anchorPremise.variableName}`
          : "system_error_rate_pct",
        unit: anchorPremise?.unit || "%",
        operator: "LT",
        thresholdValue: anchorPremise ? anchorPremise.thresholdValue : "0.1",
        currentValue: "",
        decayWarningMargin: 0.1,
        recommendedProbe: {
          probeType: "SQL_METRIC",
          targetUrlOrQuery: "",
          jsonPath: "$.value",
          pollingIntervalSeconds: 300,
        },
      },
    ],
  };

  return {
    id: nextId,
    replacementAdrId: `${artifact.title.split(":")[0]?.trim() || "ADR"}-REPLACEMENT`,
    title: nextTitle,
    type: "ADR",
    targetLocus,
    blastRadius,
    rawContent,
    compiled,
    supersedesArtifactId: artifact.id,
    supersedesTitle: artifact.title,
    rationale,
    patternName,
    estimatedAnnualSavingsUsd,
    forwardLookingPremisesCount: compiled.premises.length,
  };
}

