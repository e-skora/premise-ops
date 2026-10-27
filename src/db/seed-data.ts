import { DecisionArtifactRecord, CompiledArtifactOutput } from "@/lib/types";
import { OPENROUTER_MODELS_URL } from "@/lib/live-feeds";

// Seeded values are demo data and are labeled that way in the UI. The one
// exception is prem-adr-014-cost: it has no seeded value and reads the real
// Claude Sonnet 5.5 input price from OpenRouter on its first probe run.

export const SEED_HISTORICAL_SERIES: Record<string, number[]> = {
  "prem-adr-014-ttft": [890, 855, 820, 795, 760, 735, 712, 695],
  "prem-vendor-redis-util": [81.0, 79.4, 78.2, 77.5, 76.8, 75.9, 75.1, 74.5],
  "prem-pr-892-uptime": [99.12, 99.18, 99.24, 99.29, 99.31, 99.36, 99.39, 99.42],
  "prem-gtm-q3-cac": [48.2, 50.4, 52.8, 54.9, 56.5, 58.4, 59.8, 61.2],
  "prem-gtm-q3-conv": [17.8, 17.5, 17.2, 17.0, 16.9, 16.7, 16.5, 16.4],
};

export const INITIAL_SEED_ARTIFACTS: DecisionArtifactRecord[] = [
  {
    id: "art-adr-014",
    title: "ADR-014: Custom Semantic Caching Microservice",
    type: "ADR",
    targetLocus: "examples/demo-repo/packages/llm-gateway/src/semantic-cache.ts:L1-L30",
    blastRadius:
      "4,200 LOC Redis vector cache + $600/mo Redis cluster can be deleted if upstream models become cheap and fast enough.",
    logicCombinator: "ANY",
    dependsOnIds: [],
    downstreamDependentIds: ["art-vendor-redis"],
    cascadedFromId: null,
    monthlyCloudSpendUsd: 600,
    maintenanceHoursPerMonth: 14,
    realizedAnnualSavingsUsd: 0,
    status: "AT_RISK",
    createdAt: "2026-06-14T10:15:00.000Z",
    lastEvaluatedAt: "2026-10-19T09:30:00.000Z",
    rawContent: `# ADR-014: Custom Semantic Caching Microservice
**Status:** Accepted | **Owner:** Core AI Platform | **Locus:** \`examples/demo-repo/packages/llm-gateway/src/semantic-cache.ts:L1-L30\`

## Context & Problem Statement
Our inference gateway processes 84M daily prompt tokens across customer support and code-analysis workflows. Direct passthrough to frontier upstream models introduces prohibitive unit economics and tail latency.

## Load-Bearing Premises
We justify maintaining our custom HNSW Redis semantic vector cache only while the following quantitative assumptions hold true:
1. **Token Unit Economics:** Upstream LLM input cost > $2.00 / 1M tokens across our primary tier-1 reasoning endpoints.
2. **Tail Latency Envelope:** P95 upstream time-to-first-token > 650ms during peak North America traffic windows.

## Decision & Architecture
We deploy a dedicated 3-node Redis Stack cluster (\`redis-semantic-prod-01\`) running cosine-similarity embedding lookup (\`threshold >= 0.94\`) in \`examples/demo-repo/packages/llm-gateway/src/semantic-cache.ts:L1-L30\`.

## Blast Radius & Sunset Criteria
4,200 LOC Redis vector cache + $600/mo Redis cluster can be deleted if upstream models become cheap and fast enough. Once either load-bearing premise is invalidated by upstream provider price cuts or inference speedups, decommission the Redis vector cluster and cascade-terminate downstream \`VENDOR-04: Redis Enterprise Annual FinOps Commit\`.`,
    premises: [
      {
        id: "prem-adr-014-cost",
        artifactId: "art-adr-014",
        claim: "Upstream LLM input cost > $2.00 / 1M tokens",
        variableName: "upstream_llm_input_cost_usd",
        unit: "USD / 1M tokens",
        operator: "GT",
        thresholdValue: "2.00",
        currentValue: "",
        decayWarningMargin: 0.15,
        status: "UNBOUND",
        probes: [
          {
            id: "probe-adr-014-cost",
            premiseId: "prem-adr-014-cost",
            probeType: "HTTP_JSON_PATH",
            targetUrlOrQuery: OPENROUTER_MODELS_URL,
            // pricing.prompt is a string in USD per input token
            jsonPath: '$.data[?(@.id=="anthropic/claude-sonnet-5.5")].pricing.prompt',
            valueMultiplier: 1_000_000,
            status: "ACTIVE",
            pollingIntervalSeconds: 600,
            lastRunAt: null,
            lastLatencyMs: null,
            lastRawResponse: null,
            lastError: null,
          },
        ],
      },
      {
        id: "prem-adr-014-ttft",
        artifactId: "art-adr-014",
        claim: "P95 upstream time-to-first-token > 650ms",
        variableName: "upstream_ttft_p95_ms",
        unit: "ms",
        operator: "GT",
        thresholdValue: "650",
        currentValue: "695",
        decayWarningMargin: 0.1,
        status: "DECAYING",
        probes: [
          {
            id: "probe-adr-014-ttft",
            premiseId: "prem-adr-014-ttft",
            probeType: "HTTP_JSON_PATH",
            targetUrlOrQuery:
              "/api/telemetry/live?source=datadog-llm-synthetics",
            jsonPath: "$.metrics.upstream_ttft_p95_ms",
            pollingIntervalSeconds: 60,
            lastRunAt: "2026-10-19T09:30:00.000Z",
            lastLatencyMs: 24,
            lastRawResponse: JSON.stringify(
              {
                source: "datadog-llm-synthetics",
                window: "rolling_1h",
                metrics: {
                  upstream_ttft_p95_ms: 695,
                  upstream_ttft_p50_ms: 380,
                },
                timestamp: "2026-10-19T09:30:00.000Z",
              },
              null,
              2
            ),
            lastError: null,
          },
        ],
      },
    ],
    invalidationEvents: [],
  },
  {
    id: "art-vendor-redis",
    title: "VENDOR-04: Redis Enterprise Annual FinOps Commit ($7,200/yr)",
    type: "VENDOR_CONTRACT",
    targetLocus: "examples/demo-repo/infra/finops/redis-enterprise-commit.yaml:L1-L20",
    blastRadius:
      "Terminate $7,200/yr ($600/mo) Redis Enterprise 3-node r7g.xlarge committed-use contract and disable auto-renewal before 30-day lock-in window.",
    logicCombinator: "ANY",
    dependsOnIds: ["art-adr-014"],
    downstreamDependentIds: [],
    cascadedFromId: null,
    monthlyCloudSpendUsd: 600,
    maintenanceHoursPerMonth: 2,
    realizedAnnualSavingsUsd: 0,
    status: "HEALTHY",
    createdAt: "2026-06-20T11:00:00.000Z",
    lastEvaluatedAt: "2026-10-19T09:30:00.000Z",
    rawContent: `# VENDOR-04: Redis Enterprise Annual FinOps Commit ($7,200/yr)
**Owner:** Cloud FinOps & Core AI Platform | **Upstream Dependency:** \`ADR-014\` | **Locus:** \`examples/demo-repo/infra/finops/redis-enterprise-commit.yaml:L1-L20\`

## Contract Scope & Upstream Dependency
This 12-month Redis Enterprise committed-use reservation (\`redis-semantic-prod-01\`) exists solely to back \`ADR-014: Custom Semantic Caching Microservice\`. If \`ADR-014\` is invalidated by upstream model price/latency improvements, this contract is automatically obsolete via multi-hop cascade.

## Load-Bearing Premises
1. **Cluster Memory Utilization:** Redis vector index memory utilization >= 60% across the 3x r7g.xlarge node reservation.

## Blast Radius & FinOps Teardown
Terminate $7,200/yr ($600/mo) Redis Enterprise 3-node r7g.xlarge committed-use contract and disable auto-renewal in \`examples/demo-repo/infra/finops/redis-enterprise-commit.yaml:L1-L20\`.`,
    premises: [
      {
        id: "prem-vendor-redis-util",
        artifactId: "art-vendor-redis",
        claim: "Redis vector index memory utilization >= 60%",
        variableName: "redis_cluster_memory_utilization_pct",
        unit: "%",
        operator: "GTE",
        thresholdValue: "60",
        currentValue: "74.5",
        decayWarningMargin: 0.1,
        status: "VALID",
        probes: [
          {
            id: "probe-vendor-redis-util",
            premiseId: "prem-vendor-redis-util",
            probeType: "PROMQL",
            targetUrlOrQuery:
              'last_over_time(redis_cluster_memory_utilization_pct{cluster="redis-semantic-prod-01"}[5m])',
            jsonPath: "$.metrics.redis_cluster_memory_utilization_pct",
            pollingIntervalSeconds: 300,
            lastRunAt: "2026-10-19T09:30:00.000Z",
            lastLatencyMs: 14,
            lastRawResponse: JSON.stringify(
              {
                engine: "promql-timeseries-evaluator",
                expression:
                  'last_over_time(redis_cluster_memory_utilization_pct{cluster="redis-semantic-prod-01"}[5m])',
                functionName: "last_over_time",
                metricName: "redis_cluster_memory_utilization_pct",
                labels: { cluster: "redis-semantic-prod-01" },
                rangeWindow: "5m",
                value: 74.5,
                timestamp: "2026-10-19T09:30:00.000Z",
              },
              null,
              2
            ),
            lastError: null,
          },
        ],
      },
    ],
    invalidationEvents: [],
  },
  {
    id: "art-pr-892",
    title: "PR #892: Multi-Provider Failover & Retry Queue",
    type: "GITHUB_PR",
    targetLocus: "examples/demo-repo/services/ingest-worker/queue.ts:L1-L30",
    blastRadius:
      "1,850 LOC BullMQ dead-letter failover worker + $420/mo secondary webhook relay cluster can be removed once primary provider exceeds 99.9% 30-day SLA.",
    logicCombinator: "ANY",
    dependsOnIds: [],
    downstreamDependentIds: [],
    cascadedFromId: null,
    monthlyCloudSpendUsd: 420,
    maintenanceHoursPerMonth: 10,
    realizedAnnualSavingsUsd: 0,
    status: "HEALTHY",
    createdAt: "2026-07-22T16:40:00.000Z",
    lastEvaluatedAt: "2026-10-19T09:30:00.000Z",
    rawContent: `# PR #892: Multi-Provider Failover & Retry Queue
**Author:** \`@sre-platform\` | **Merged:** \`main\` | **Locus:** \`examples/demo-repo/services/ingest-worker/queue.ts:L1-L30\`

## Summary of Changes
Introduces a dual-write outbox table and a BullMQ dead-letter retry state machine in \`examples/demo-repo/services/ingest-worker/queue.ts:L1-L30\` that automatically fails over outbound billing and lifecycle events to a secondary relay cluster.

## Operational Premise
This failover queue and outbox state machine are only necessary while:
- **Reliability Constraint:** Primary webhook provider SLA uptime < 99.9% over rolling 30d window.

## Maintenance Cost & Blast Radius
1,850 LOC BullMQ dead-letter failover worker + $420/mo secondary webhook relay cluster can be removed once primary provider exceeds 99.9% 30-day SLA. Maintaining dual-provider idempotency keys adds 14ms write overhead to every checkout transaction.`,
    premises: [
      {
        id: "prem-pr-892-uptime",
        artifactId: "art-pr-892",
        claim:
          "Primary webhook provider SLA uptime < 99.9% over rolling 30d window",
        variableName: "primary_webhook_uptime_pct",
        unit: "%",
        operator: "LT",
        thresholdValue: "99.9",
        currentValue: "99.42",
        decayWarningMargin: 0.003,
        status: "VALID",
        probes: [
          {
            id: "probe-pr-892-uptime",
            premiseId: "prem-pr-892-uptime",
            probeType: "HTTP_JSON_PATH",
            targetUrlOrQuery: "/api/telemetry/live?source=webhook-sla-monitor",
            jsonPath: "$.metrics.primary_webhook_uptime_pct",
            pollingIntervalSeconds: 120,
            lastRunAt: "2026-10-19T09:30:00.000Z",
            lastLatencyMs: 15,
            lastRawResponse: JSON.stringify(
              {
                source: "webhook-sla-monitor",
                rollingWindowDays: 30,
                metrics: {
                  primary_webhook_uptime_pct: 99.42,
                  incident_count_30d: 4,
                },
                timestamp: "2026-10-19T09:30:00.000Z",
              },
              null,
              2
            ),
            lastError: null,
          },
        ],
      },
    ],
    invalidationEvents: [],
  },
  {
    id: "art-gtm-q3",
    title: "GTM-Q3: Paid Search Outbound Funnel",
    type: "STRATEGY_MEMO",
    targetLocus: "examples/demo-repo/ops/growth/paid-acquisition-budget.yaml:L1-L27",
    blastRadius:
      "$45,000/mo high-intent search ad spend + 3 dedicated Clearbit attribution enrichment pipelines must be paused or reallocated if unit economics breach bounds.",
    logicCombinator: "ANY",
    dependsOnIds: [],
    downstreamDependentIds: [],
    cascadedFromId: null,
    monthlyCloudSpendUsd: 48800,
    maintenanceHoursPerMonth: 25,
    realizedAnnualSavingsUsd: 0,
    status: "AT_RISK",
    createdAt: "2026-08-05T14:00:00.000Z",
    lastEvaluatedAt: "2026-10-19T09:30:00.000Z",
    rawContent: `# GTM-Q3: Paid Search Outbound Funnel
**Owner:** VP Growth & RevOps | **Budget Locus:** \`examples/demo-repo/ops/growth/paid-acquisition-budget.yaml:L1-L27\`

## Strategic Thesis
We are allocating $45,000/mo in automated high-intent non-brand search capture ("CI/CD observability", "microservice drift") routed into an automated Clearbit + Clay outbound SDR enrichment sequence.

## Load-Bearing Economic Premises
This acquisition channel remains positive-NPV and funded only while both unit-economic guardrails hold:
1. **Acquisition Ceiling:** Blended CAC < $65.00 across paid search cohorts.
2. **Payback Velocity:** Day-30 payback conversion >= 14.5% from workspace creation to paid team seat.

## Teardown / Kill-Switch Protocol
$45,000/mo high-intent search ad spend + 3 dedicated Clearbit attribution enrichment pipelines must be paused or reallocated if unit economics breach bounds. If auction competition pushes CAC >= $65.00 or Day-30 conversion drops below 14.5%, freeze ad-group spend via RevOps webhook and sunset the enrichment workers.`,
    premises: [
      {
        id: "prem-gtm-q3-cac",
        artifactId: "art-gtm-q3",
        claim: "Blended CAC < $65.00",
        variableName: "blended_search_cac_usd",
        unit: "USD",
        operator: "LT",
        thresholdValue: "65.00",
        currentValue: "61.20",
        decayWarningMargin: 0.1,
        status: "DECAYING",
        probes: [
          {
            id: "probe-gtm-q3-cac",
            premiseId: "prem-gtm-q3-cac",
            probeType: "HTTP_JSON_PATH",
            targetUrlOrQuery:
              "/api/telemetry/live?source=revops-unit-economics",
            jsonPath: "$.metrics.blended_search_cac_usd",
            pollingIntervalSeconds: 600,
            lastRunAt: "2026-10-19T09:30:00.000Z",
            lastLatencyMs: 21,
            lastRawResponse: JSON.stringify(
              {
                source: "revops-unit-economics",
                cohort: "2026-Q3-paid-search",
                metrics: {
                  blended_search_cac_usd: 61.2,
                  d30_payback_conversion_pct: 16.4,
                },
                timestamp: "2026-10-19T09:30:00.000Z",
              },
              null,
              2
            ),
            lastError: null,
          },
        ],
      },
      {
        id: "prem-gtm-q3-conv",
        artifactId: "art-gtm-q3",
        claim: "Day-30 payback conversion >= 14.5%",
        variableName: "d30_payback_conversion_pct",
        unit: "%",
        operator: "GTE",
        thresholdValue: "14.5",
        currentValue: "16.4",
        decayWarningMargin: 0.1,
        status: "VALID",
        probes: [
          {
            id: "probe-gtm-q3-conv",
            premiseId: "prem-gtm-q3-conv",
            probeType: "SQL_METRIC",
            targetUrlOrQuery:
              "SELECT CAST(value AS REAL) AS value, unit, updatedAt FROM TelemetryMetric WHERE variableName = 'd30_payback_conversion_pct'",
            jsonPath: "$.metrics.d30_payback_conversion_pct",
            pollingIntervalSeconds: 900,
            lastRunAt: "2026-10-19T09:30:00.000Z",
            lastLatencyMs: 12,
            lastRawResponse: JSON.stringify(
              {
                engine: "sqlite-wal-readonly",
                executedQuery:
                  "SELECT CAST(value AS REAL) AS value, unit, updatedAt FROM TelemetryMetric WHERE variableName = 'd30_payback_conversion_pct'",
                rowCount: 1,
                value: 16.4,
                timestamp: "2026-10-19T09:30:00.000Z",
              },
              null,
              2
            ),
            lastError: null,
          },
        ],
      },
    ],
    invalidationEvents: [],
  },
];

// 3 Rich Pre-Loaded Real-World Engineering/Strategy Templates for Pipeline A (/api/compile)
export interface CompilerTemplate {
  id: string;
  label: string;
  badge: string;
  title: string;
  type: "ADR" | "GITHUB_PR" | "STRATEGY_MEMO" | "VENDOR_CONTRACT";
  targetLocus: string;
  rawContent: string;
  precompiled: CompiledArtifactOutput;
}

export const COMPILER_TEMPLATES: CompilerTemplate[] = [
  {
    id: "tpl-gpu-whisper",
    label: "ADR-021: Self-Hosted GPU Whisper Fleet",
    badge: "ADR",
    title: "ADR-021: Dedicated L40S GPU Whisper Transcription Fleet",
    type: "ADR",
    targetLocus: "examples/demo-repo/infra/k8s/gpu-whisper-pool/deployment.yaml:L1-140",
    rawContent: `# ADR-021: Dedicated L40S GPU Whisper Transcription Fleet
**Locus:** \`examples/demo-repo/infra/k8s/gpu-whisper-pool/deployment.yaml:L1-140\`

## Context
We operate an autoscaled Kubernetes node pool of 8x NVIDIA L40S GPUs running TensorRT-LLM Whisper-Large-v3 to transcribe enterprise meeting audio streams.

## Load-Bearing Assumptions
Maintaining our self-hosted GPU cluster and custom CUDA batching daemon is only justified while:
1. Managed transcription API cost > $0.0055 / minute for enterprise bilingual audio.
2. External API P95 transcription turnaround latency > 1200ms per 30-second audio chunk.

## Blast Radius if Invalidated
Decommission the 8x L40S GPU Kubernetes node pool ($7,400/mo AWS EC2 G6e spend), delete \`examples/demo-repo/services/audio-batcher/cuda-worker.py\` (2,900 LOC), and route audio streams directly to the managed API endpoint.`,
    precompiled: {
      title: "ADR-021: Dedicated L40S GPU Whisper Transcription Fleet",
      type: "ADR",
      targetLocus: "examples/demo-repo/infra/k8s/gpu-whisper-pool/deployment.yaml:L1-140",
      blastRadius:
        "Decommission 8x L40S GPU Kubernetes node pool ($7,400/mo AWS G6e spend) and delete 2,900 LOC custom CUDA batching daemon in examples/demo-repo/services/audio-batcher/cuda-worker.py.",
      logicCombinator: "ANY",
      premises: [
        {
          claim: "Managed transcription API cost > $0.0055 / minute",
          variableName: "managed_asr_cost_per_min_usd",
          unit: "USD / min",
          operator: "GT",
          thresholdValue: "0.0055",
          currentValue: "0.0068",
          decayWarningMargin: 0.1,
          recommendedProbe: {
            probeType: "HTTP_JSON_PATH",
            targetUrlOrQuery: "/api/telemetry/live?source=asr-vendor-pricing",
            jsonPath: "$.metrics.managed_asr_cost_per_min_usd",
            pollingIntervalSeconds: 300,
          },
        },
        {
          claim: "External API P95 transcription turnaround latency > 1200ms",
          variableName: "external_asr_p95_latency_ms",
          unit: "ms",
          operator: "GT",
          thresholdValue: "1200",
          currentValue: "1420",
          decayWarningMargin: 0.1,
          recommendedProbe: {
            probeType: "HTTP_JSON_PATH",
            targetUrlOrQuery: "/api/telemetry/live?source=asr-synthetics",
            jsonPath: "$.metrics.external_asr_p95_latency_ms",
            pollingIntervalSeconds: 60,
          },
        },
      ],
    },
  },
  {
    id: "tpl-pr-delta-sync",
    label: "PR #1104: Custom IndexedDB Delta Compressor",
    badge: "GITHUB_PR",
    title: "PR #1104: Client-Side LZ4 IndexedDB Sync & Delta Patch Engine",
    type: "GITHUB_PR",
    targetLocus: "apps/web/src/sync/lz4-delta-engine.ts:L18-390",
    rawContent: `# PR #1104: Client-Side LZ4 IndexedDB Sync & Delta Patch Engine
**Locus:** \`apps/web/src/sync/lz4-delta-engine.ts:L18-390\`

## Summary
Adds a WebAssembly LZ4 binary diffing worker and IndexedDB mutation log to avoid full state hydration over GraphQL subscriptions.

## Load-Bearing Premises
This client-side WASM sync complexity is justified only while:
1. P95 workspace state hydration payload > 450KB over standard Brotli HTTP/3.
2. Mobile client reconnect state-sync failure rate > 3.5% on cellular networks.

## Blast Radius
Delete 3,100 LOC in \`apps/web/src/sync/lz4-delta-engine.ts\`, remove the 180KB \`lz4-wasm\` bundle dependency, and revert to standard React Query HTTP/3 cache invalidation.`,
    precompiled: {
      title: "PR #1104: Client-Side LZ4 IndexedDB Sync & Delta Patch Engine",
      type: "GITHUB_PR",
      targetLocus: "apps/web/src/sync/lz4-delta-engine.ts:L18-390",
      blastRadius:
        "Delete 3,100 LOC custom WASM delta sync engine in apps/web/src/sync/lz4-delta-engine.ts, drop 180KB lz4-wasm client bundle dependency, and revert to standard HTTP/3 cache invalidation.",
      logicCombinator: "ANY",
      premises: [
        {
          claim: "P95 workspace state hydration payload > 450KB",
          variableName: "p95_hydration_payload_kb",
          unit: "KB",
          operator: "GT",
          thresholdValue: "450",
          currentValue: "540",
          decayWarningMargin: 0.1,
          recommendedProbe: {
            probeType: "HTTP_JSON_PATH",
            targetUrlOrQuery:
              "/api/telemetry/live?source=rum-payload-telemetry",
            jsonPath: "$.metrics.p95_hydration_payload_kb",
            pollingIntervalSeconds: 120,
          },
        },
        {
          claim: "Mobile client reconnect state-sync failure rate > 3.5%",
          variableName: "mobile_sync_failure_rate_pct",
          unit: "%",
          operator: "GT",
          thresholdValue: "3.5",
          currentValue: "4.2",
          decayWarningMargin: 0.1,
          recommendedProbe: {
            probeType: "WEBHOOK_INGEST",
            targetUrlOrQuery:
              "/api/webhooks/metric (var: mobile_sync_failure_rate_pct)",
            jsonPath: "$.metrics.mobile_sync_failure_rate_pct",
            pollingIntervalSeconds: 180,
          },
        },
      ],
    },
  },
  {
    id: "tpl-vendor-nat-gateway",
    label: "VENDOR-09: Self-Managed BGP NAT Instances",
    badge: "VENDOR_CONTRACT",
    title:
      "VENDOR-09: Self-Managed EC2 BGP NAT Router Fleet vs AWS Managed NAT",
    type: "VENDOR_CONTRACT",
    targetLocus: "examples/demo-repo/infra/terraform/vpc-nat-bgp/main.tf:L1-210",
    rawContent: `# VENDOR-09: Self-Managed EC2 BGP NAT Router Fleet
**Locus:** \`examples/demo-repo/infra/terraform/vpc-nat-bgp/main.tf:L1-210\`

## Context
To avoid AWS Managed NAT Gateway per-GB data processing charges during cross-AZ S3 & ECR pulls, we maintain a custom fleet of 6 c7gn.large EC2 instances running FRR BGP failover scripts.

## Load-Bearing Premises
1. Cross-AZ NAT data processing volume > 42 TB / month before VPC Gateway Endpoints.
2. AWS Managed NAT per-GB processing fee >= $0.045 / GB in us-east-1.

## Blast Radius
Tear down 6x c7gn.large EC2 routers, remove FRR BGP keepalived daemon and PagerDuty on-call runbooks, and switch route tables to native VPC Endpoints + Managed NAT.`,
    precompiled: {
      title:
        "VENDOR-09: Self-Managed EC2 BGP NAT Router Fleet vs AWS Managed NAT",
      type: "VENDOR_CONTRACT",
      targetLocus: "examples/demo-repo/infra/terraform/vpc-nat-bgp/main.tf:L1-210",
      blastRadius:
        "Decommission 6x c7gn.large EC2 BGP routers, delete examples/demo-repo/infra/terraform/vpc-nat-bgp/main.tf (480 LOC) + FRR keepalived runbooks, and cut over to native S3/ECR VPC Gateway Endpoints.",
      logicCombinator: "ANY",
      premises: [
        {
          claim: "Cross-AZ NAT data processing volume > 42 TB / month",
          variableName: "nat_monthly_volume_tb",
          unit: "TB / mo",
          operator: "GT",
          thresholdValue: "42",
          currentValue: "49.5",
          decayWarningMargin: 0.1,
          recommendedProbe: {
            probeType: "SQL_METRIC",
            targetUrlOrQuery:
              "SELECT sum(bytes_transferred)/1e12 FROM cur_billing_nat_hourly WHERE month = CURRENT_MONTH",
            jsonPath: "$.metrics.nat_monthly_volume_tb",
            pollingIntervalSeconds: 3600,
          },
        },
        {
          claim: "AWS Managed NAT per-GB processing fee >= $0.045 / GB",
          variableName: "aws_nat_fee_per_gb_usd",
          unit: "USD / GB",
          operator: "GTE",
          thresholdValue: "0.045",
          currentValue: "0.045",
          decayWarningMargin: 0.05,
          recommendedProbe: {
            probeType: "HTTP_JSON_PATH",
            targetUrlOrQuery: "/api/telemetry/live?source=cloud-finops-tariff",
            jsonPath: "$.metrics.aws_nat_fee_per_gb_usd",
            pollingIntervalSeconds: 3600,
          },
        },
      ],
    },
  },
];
