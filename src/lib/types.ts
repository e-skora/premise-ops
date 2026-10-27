import { z } from "zod";

export const ArtifactTypeEnum = z.enum([
  "ADR",
  "GITHUB_PR",
  "STRATEGY_MEMO",
  "VENDOR_CONTRACT",
]);
export type ArtifactType = z.infer<typeof ArtifactTypeEnum>;

export const ArtifactStatusEnum = z.enum([
  "HEALTHY",
  "AT_RISK",
  "INVALIDATED",
  "DEPRECATED_BY_PREMISE_ENGINE",
  "RETIRED",
]);
export type ArtifactStatus = z.infer<typeof ArtifactStatusEnum>;

export const LogicCombinatorEnum = z.enum(["ANY", "ALL"]);
export type LogicCombinator = z.infer<typeof LogicCombinatorEnum>;

export const OperatorEnum = z.enum(["LT", "LTE", "GT", "GTE", "EQ", "NEQ"]);
export type Operator = z.infer<typeof OperatorEnum>;

export const PremiseStatusEnum = z.enum([
  "VALID",
  "DECAYING",
  "BROKEN",
  "UNBOUND",
]);
export type PremiseStatus = z.infer<typeof PremiseStatusEnum>;

export const ProbeTypeEnum = z.enum([
  "HTTP_JSON_PATH",
  "WEB_SCRAPE_EXTRACT",
  "WEBHOOK_INGEST",
  "SQL_METRIC",
  "PROMQL",
  "DATADOG_METRIC",
]);
export type ProbeType = z.infer<typeof ProbeTypeEnum>;

// ACTIVE probes run. UNBOUND probes are suggestions with no real source yet.
export const ProbeConnectionStatusEnum = z.enum(["ACTIVE", "UNBOUND"]);
export type ProbeConnectionStatus = z.infer<typeof ProbeConnectionStatusEnum>;

// SENT: the outside service accepted it. DRY_RUN: nothing left this app.
export type DispatchStatus = "SENT" | "DRY_RUN" | "FAILED";

export const DispatchChannelEnum = z.enum([
  "GITHUB_PR",
  "GITHUB_ISSUE",
  "SLACK_WEBHOOK",
  "PAGERDUTY_EVENT",
]);
export type DispatchChannel = z.infer<typeof DispatchChannelEnum>;

export interface MetricSampleRecord {
  id: string;
  premiseId: string;
  variableName: string;
  value: number;
  source: string;
  recordedAt: string;
}

export interface DriftForecast {
  velocityPerSample: number;
  trendDirection: "DRIFTING_TOWARD_BREACH" | "STABILIZING" | "BREACHED";
  samplesToBreach: number | null;
  etaLabel: string;
}

export interface ProbeRecord {
  id: string;
  premiseId: string;
  probeType: ProbeType;
  targetUrlOrQuery: string;
  jsonPath: string;
  pollingIntervalSeconds: number;
  /** Multiplies the extracted number, e.g. 1000000 turns USD per token into USD per 1M tokens */
  valueMultiplier?: number;
  /** Missing means ACTIVE */
  status?: ProbeConnectionStatus;
  lastRunAt: string | null;
  lastLatencyMs: number | null;
  lastRawResponse: string | null;
  lastError: string | null;
}

export interface PremiseRecord {
  id: string;
  artifactId: string;
  claim: string;
  variableName: string;
  unit: string;
  operator: Operator;
  thresholdValue: string;
  /** Empty until a probe or a person reports a real value */
  currentValue: string;
  decayWarningMargin: number;
  status: PremiseStatus;
  /** Where currentValue came from, e.g. "live:https://..." or "demo-seed" */
  valueSource?: string | null;
  /** When currentValue was reported */
  valueObservedAt?: string | null;
  probes: ProbeRecord[];
  metricSamples?: MetricSampleRecord[];
}

export interface OutboundDispatchLogRecord {
  id: string;
  eventId: string;
  artifactId: string;
  channel: DispatchChannel;
  targetEndpoint: string;
  summary: string;
  payloadPreview: string;
  responseStatus: number;
  /** Empty unless something real exists at that address */
  externalUrl: string;
  dispatchedAt: string;
  /** Null for rows written before delivery status was recorded */
  deliveryStatus?: DispatchStatus | null;
  errorMessage?: string | null;
}

export interface GitHubPrRequest {
  eventId: string;
  repo?: string;
  baseBranch?: string;
  headBranch?: string;
  githubToken?: string;
  dryRun?: boolean;
}

export interface GitHubPrResult {
  ok: boolean;
  status: DispatchStatus;
  /** Null unless GitHub really opened the PR */
  prNumber: number | null;
  prUrl: string | null;
  branchName: string;
  commitSha: string | null;
  isDryRun: boolean;
  title: string;
  bodyMarkdown: string;
  ghCliCommand: string;
  compareUrl: string;
  targetEndpoint: string;
  error?: string;
  /** Why nothing was sent, for DRY_RUN results */
  dryRunReason?: string;
}

export interface LocusLineRecord {
  lineNumber: number;
  content: string;
}

export interface LocusInspectionResult {
  rawLocus: string;
  resolvedPath: string;
  exists: boolean;
  startLine: number;
  endLine: number;
  totalLines: number;
  lines: LocusLineRecord[];
  language: string;
  isPatched?: boolean;
  patchedAt?: string | null;
}

export interface DiscoveredCodebasePremise {
  id: string;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  targetLocus: string;
  title: string;
  type: ArtifactType;
  claim: string;
  variableName: string;
  operator: Operator;
  thresholdValue: string;
  currentValue: string;
  unit: string;
  decayWarningMargin: number;
  probeType: ProbeType;
  targetUrlOrQuery: string;
  blastRadius: string;
  codeSnippet: string;
  alreadyMonitored: boolean;
  matchedArtifactId: string | null;
}

export interface InvalidationEventRecord {
  id: string;
  premiseId: string;
  artifactId: string;
  previousValue: string;
  breakingValue: string;
  thresholdValue: string;
  remediationPlan: string;
  realizedAnnualSavingsUsd?: number;
  acknowledged: boolean;
  triggeredAt: string;
  premiseClaim?: string;
  variableName?: string;
  operator?: Operator;
  unit?: string;
  artifactTitle?: string;
  targetLocus?: string;
  dispatchLogs?: OutboundDispatchLogRecord[];
}

export interface DecisionArtifactRecord {
  id: string;
  title: string;
  type: ArtifactType;
  rawContent: string;
  targetLocus: string;
  blastRadius: string;
  logicCombinator?: LogicCombinator;
  dependsOnIds?: string[];
  downstreamDependentIds?: string[];
  cascadedFromId?: string | null;
  monthlyCloudSpendUsd?: number;
  maintenanceHoursPerMonth?: number;
  realizedAnnualSavingsUsd?: number;
  status: ArtifactStatus;
  createdAt: string;
  lastEvaluatedAt: string;
  premises: PremiseRecord[];
  invalidationEvents: InvalidationEventRecord[];
}

// Strict Zod Schema for Pipeline A: The Premise Compiler Output
export const CompiledPremiseSchema = z.object({
  claim: z
    .string()
    .describe("Exact natural-language assumption extracted from the document"),
  variableName: z
    .string()
    .describe(
      "Normalized snake_case metric identifier, e.g., upstream_token_cost_usd"
    ),
  unit: z
    .string()
    .describe("Measurement unit, e.g., USD / 1M tokens, ms, %, USD"),
  operator: OperatorEnum.describe(
    "Comparison operator required for the premise to HOLD TRUE"
  ),
  thresholdValue: z
    .union([z.number(), z.string()])
    .transform((v) => String(v))
    .describe("Boundary value where the decision holds true"),
  currentValue: z
    .union([z.number(), z.string()])
    .default("")
    .transform((v) => String(v))
    .describe("Observed value; empty until a probe reports one"),
  decayWarningMargin: z
    .number()
    .min(0.001)
    .max(0.5)
    .default(0.1)
    .describe(
      "Fractional warning margin (e.g. 0.10 = 10% proximity to threshold)"
    ),
  recommendedProbe: z.object({
    probeType: ProbeTypeEnum,
    targetUrlOrQuery: z.string().default(""),
    jsonPath: z.string().default("$.value"),
    pollingIntervalSeconds: z.number().int().positive().default(60),
    valueMultiplier: z.number().positive().optional(),
    // Suggested probes stay UNBOUND (the default when missing) until a person sets a real source
    status: ProbeConnectionStatusEnum.optional(),
  }),
});

export const CompiledArtifactOutputSchema = z.object({
  title: z.string(),
  type: ArtifactTypeEnum,
  targetLocus: z.string(),
  blastRadius: z.string(),
  logicCombinator: LogicCombinatorEnum.default("ANY"),
  dependsOnIds: z.array(z.string()).default([]).optional(),
  monthlyCloudSpendUsd: z.number().default(0).optional(),
  maintenanceHoursPerMonth: z.number().default(0).optional(),
  premises: z.array(CompiledPremiseSchema).min(1),
});

export type CompiledArtifactOutput = z.infer<
  typeof CompiledArtifactOutputSchema
>;
export type CompiledPremise = z.infer<typeof CompiledPremiseSchema>;

export const OPERATOR_SYMBOLS: Record<Operator, string> = {
  LT: "<",
  LTE: "<=",
  GT: ">",
  GTE: ">=",
  EQ: "==",
  NEQ: "!=",
};

export const OPERATOR_LABELS: Record<Operator, string> = {
  LT: "LESS THAN (<)",
  LTE: "AT MOST (<=)",
  GT: "GREATER THAN (>)",
  GTE: "AT LEAST (>=)",
  EQ: "EQUALS (==)",
  NEQ: "NOT EQUAL (!=)",
};

/**
 * Standardizes git branch naming for architectural teardown operations.
 */
export function formatTeardownBranchName(artifactId: string): string {
  const sanitized = artifactId
    .toLowerCase()
    .replace(/^art-/, "")
    .replace(/[^a-z0-9_-]/g, "-");
  return `premise/teardown-${sanitized}`;
}

// ==========================================
// Horizon C: Historical Drift Backtesting & Scenario Replay
// ==========================================

export type ScenarioType =
  | "HISTORICAL"
  | "PRICE_WAR_DEFLATION"
  | "LATENCY_SPIKE"
  | "VENDOR_OUTAGE"
  | "FINOPS_DRAIN"
  | "CAC_SURGE"
  | "CUSTOM";

export interface ScenarioPreset {
  id: string;
  name: string;
  description: string;
  scenarioType: ScenarioType;
  defaultSteps: number;
  defaultShockPct: number;
  defaultNoisePct: number;
  targetVariable?: string;
  targetArtifactId?: string;
  category:
    | "LLM_ECONOMICS"
    | "INFRA_LATENCY"
    | "SLA_RELIABILITY"
    | "FINOPS"
    | "GROWTH"
    | "HISTORICAL"
    | "CUSTOM";
}

export interface BacktestOptions {
  scenarioId: string;
  artifactId?: string;
  premiseId?: string;
  steps?: number;
  shockMagnitudePct?: number;
  shockStep?: number;
  noiseFactorPct?: number;
  driftVelocity?: number;
}

export interface ReplayStepSnapshot {
  step: number;
  timestamp: string;
  premiseId: string;
  variableName: string;
  /** Null when the premise has no data to replay */
  simulatedValue: number | null;
  status: PremiseStatus;
  driftPercent: number;
  isBreached: boolean;
  isDecaying: boolean;
  deltaFromThreshold: number;
}

export interface PremiseBacktestResult {
  premiseId: string;
  artifactId: string;
  variableName: string;
  claim: string;
  operator: Operator;
  thresholdValue: string;
  /** Null when the premise has no reported value */
  initialValue: number | null;
  unit: string;
  steps: ReplayStepSnapshot[];
  survivalRatePct: number;
  resilienceScore: number;
  resilienceRating: "HIGH" | "MODERATE" | "BRITTLE";
  firstDecayingStep: number | null;
  breachStep: number | null;
  breachValue: number | null;
  maxDriftPercent: number;
  minSafetyMarginRemaining: number;
  recommendedThreshold: string;
  recommendedThresholdAdjustment: string;
}

export interface ArtifactBacktestResult {
  artifactId: string;
  title: string;
  targetLocus: string;
  logicCombinator: LogicCombinator;
  statusAtEnd: ArtifactStatus;
  firstInvalidatedStep: number | null;
  cascadedFromId: string | null;
  cascadedDownstreamArtifactIds: string[];
  premises: PremiseBacktestResult[];
  overallResilienceScore: number;
}

export interface BacktestReport {
  scenario: ScenarioPreset;
  executedAt: string;
  totalSteps: number;
  options: BacktestOptions;
  artifacts: ArtifactBacktestResult[];
  summary: {
    totalArtifacts: number;
    totalPremises: number;
    survivedArtifacts: number;
    invalidatedArtifacts: number;
    cascadedArtifacts: number;
    averageResilienceScore: number;
    portfolioRating: "HIGH" | "MODERATE" | "BRITTLE";
    earliestBreachStep: number | null;
    earliestBreachingPremiseId: string | null;
  };
}

// ==========================================
// GitHub Repository Scanner & Discovered Premises Inbox (v2)
// ==========================================

export type DiscoveredPremiseSource =
  | "ADR_FOLDER"
  | "DEPENDENCY_MANIFEST"
  | "INLINE_CODE";

export interface DiscoveredPremiseItem {
  id: string;
  sourceType: DiscoveredPremiseSource;
  sourceFile: string;
  targetLocus: string;
  title: string;
  artifactType: ArtifactType;
  claim: string;
  variableName: string;
  operator: Operator;
  thresholdValue: string;
  currentValue: string;
  unit: string;
  decayWarningMargin: number;
  blastRadius: string;
  probeType: ProbeType;
  targetUrlOrQuery: string;
  jsonPath?: string;
  architecturalPrompt?: string;
  detectedPackage?: {
    name: string;
    version?: string;
    manifestPath: string;
    category:
      | "VECTOR_CACHE"
      | "QUEUE_WORKER"
      | "LLM_PROVIDER"
      | "OCR_VISION"
      | "RATE_LIMITER"
      | "CLOUD_STORAGE";
  };
  rawMarkdownSnippet?: string;
  alreadyMonitored: boolean;
  matchedArtifactId: string | null;
}

export interface RepoScanTarget {
  repoUrlOrPath: string;
  repoName: string;
  isLocal: boolean;
  adrCount: number;
  manifestCount: number;
  totalFindings: number;
}

export interface RepoScanResult {
  target: RepoScanTarget;
  scannedAt: string;
  adrFilesScanned: string[];
  manifestsScanned: string[];
  discovered: DiscoveredPremiseItem[];
  pendingInboxCount: number;
  catalogCounts: {
    inbox: number;
    adr: number;
    manifests: number;
    inline: number;
    all: number;
  };
}

// ==========================================
// Horizon D: Production Telemetry Connectors & Live Outbound Dispatch
// ==========================================

export type ConnectorType = "PROMETHEUS" | "DATADOG" | "SLACK" | "PAGERDUTY";

export interface PrometheusConfig {
  baseUrl: string;
  authType: "none" | "bearer" | "basic";
  bearerToken?: string;
  username?: string;
  password?: string;
  customHeaders?: Record<string, string>;
  timeoutMs?: number;
}

export interface PrometheusInstantQueryResult {
  ok: boolean;
  query: string;
  resultType: "vector" | "matrix" | "scalar" | "string";
  value: number | null;
  timestamp?: number;
  metricLabels?: Record<string, string>;
  rawResponse?: unknown;
  latencyMs: number;
  error?: string;
}

export interface PrometheusRangeQueryResult {
  ok: boolean;
  query: string;
  resultType: string;
  latestValue: number | null;
  series: Array<{ timestamp: number; value: number }>;
  metricLabels?: Record<string, string>;
  rawResponse?: unknown;
  latencyMs: number;
  error?: string;
}

export interface DatadogConfig {
  site?: string; // "datadoghq.com" | "datadoghq.eu" | "us3.datadoghq.com" | "us5.datadoghq.com" | "ddog-gov.com"
  apiKey: string;
  appKey: string;
  timeoutMs?: number;
}

export interface DatadogTimeseriesResult {
  ok: boolean;
  query: string;
  latestValue: number | null;
  points: Array<{ timestamp: number; value: number }>;
  unit?: string;
  metricName?: string;
  latencyMs: number;
  rawResponse?: unknown;
  error?: string;
}

export interface SlackBlockKitPayload {
  channel?: string;
  username?: string;
  icon_emoji?: string;
  text: string;
  blocks: Array<Record<string, unknown>>;
}

export interface SlackDispatchResult {
  ok: boolean;
  status: DispatchStatus;
  /** 0 when nothing was sent */
  statusCode: number;
  webhookUrl: string;
  summary: string;
  payload: SlackBlockKitPayload;
  responseBody?: string;
  error?: string;
}

export interface PagerDutyV2Payload {
  routing_key: string;
  event_action: "trigger" | "acknowledge" | "resolve";
  dedup_key: string;
  payload: {
    summary: string;
    source: string;
    severity: "critical" | "error" | "warning" | "info";
    timestamp: string;
    component?: string;
    group?: string;
    class?: string;
    custom_details: Record<string, unknown>;
  };
  links?: Array<{ href: string; text: string }>;
}

export interface PagerDutyDispatchResult {
  ok: boolean;
  status: DispatchStatus;
  /** 0 when nothing was sent */
  statusCode: number;
  targetEndpoint: string;
  dedupKey: string;
  summary: string;
  payload: PagerDutyV2Payload;
  responseBody?: unknown;
  error?: string;
}

export interface ConnectorSettingRecord {
  id: ConnectorType;
  connectorType: ConnectorType;
  configJson: string;
  updatedAt: string;
}

export interface ConnectorMaskedSetting {
  id: ConnectorType;
  connectorType: ConnectorType;
  isConfigured: boolean;
  /** Public demo: an example entry shown for illustration, never used */
  isDemoPlaceholder?: boolean;
  summary: string;
  maskedConfig: Record<string, unknown>;
  updatedAt: string;
}

export interface ConnectorTestResult {
  ok: boolean;
  connectorType: ConnectorType;
  latencyMs: number;
  message: string;
  details?: unknown;
  error?: string;
}

// ==========================================
// Horizon E: Architecture Balance Sheet & FinOps Drag Ledger
// ==========================================

export interface FinOpsArtifactBreakdown {
  artifactId: string;
  title: string;
  type: ArtifactType;
  status: ArtifactStatus;
  targetLocus?: string;
  monthlyCloudSpendUsd: number;
  maintenanceHoursPerMonth: number;
  blendedEngCostMonthlyUsd: number;
  totalMonthlyDragUsd: number;
  dailyDragUsd: number;
  annualizedDragUsd: number;
  isDecaying: boolean;
  isBroken: boolean;
  isTeardownApplied: boolean;
  realizedAnnualSavingsUsd: number;
  cascadedFromId: string | null;
}

export interface FinOpsLedgerSummary {
  totalTrackedDecisions: number;
  invalidatedDecisionsCount: number;
  decayingDecisionsCount: number;
  healthyDecisionsCount: number;
  appliedTeardownsCount: number;

  // Active Invalidation Drag ($/mo & $/day)
  activeInvalidationMonthlyDragUsd: number; // ongoing monthly burn of BROKEN / INVALIDATED
  activeDecayingMonthlyDragUsd: number;     // monthly burn at risk from DECAYING
  totalActiveDragMonthlyUsd: number;       // active broken + decaying drag
  totalActiveDragDailyUsd: number;         // amortized daily drag ($/day = monthly / 30)

  // Cumulative Annual Savings ($/yr counter)
  cumulativeAnnualSavingsUsd: number;      // total cloud + eng waste eliminated ($/yr)
  cumulativeMonthlySavingsUsd: number;     // ($/mo)

  // Engineering Capacity Reclaimed
  wastedEngHoursPerMonth: number;
  freedEngHoursPerYear: number;
  blendedHourlyEngRateUsd: number;

  artifacts: FinOpsArtifactBreakdown[];
}

export interface FinOpsOptions {
  blendedHourlyEngRateUsd?: number;
  daysPerMonth?: number;
}

// ==========================================
// Horizon E: Autonomous Sunset Synthesizer
// ==========================================

export interface SynthesizedReplacementAdr {
  id: string; // e.g., "art-adr-015"
  replacementAdrId?: string; // e.g., "ADR-015"
  title: string; // e.g., "ADR-015: Direct Frontier Streaming with Native Vendor Prompt Caching"
  type: ArtifactType; // "ADR"
  targetLocus: string;
  blastRadius: string;
  rawContent: string;
  compiled: CompiledArtifactOutput;
  supersedesArtifactId: string;
  supersedesTitle: string;
  rationale: string;
  patternName: string;
  estimatedAnnualSavingsUsd: number;
  forwardLookingPremisesCount: number;
}

export interface SunsetRetireAndPromoteResult {
  ok: boolean;
  deprecatedArtifact: DecisionArtifactRecord;
  promotedArtifact: DecisionArtifactRecord;
  synthesizedAdr: SynthesizedReplacementAdr;
  teardownApplied: boolean;
  multiFilePatch?: MultiFileTeardownPatch;
  realizedAnnualSavingsUsd: number;
  error?: string;
}

// ==========================================
// Horizon E: Multi-File Caller Blast Radius Scanner
// ==========================================

export interface CallerSymbolReference {
  symbolName: string;
  filePath: string;
  lineNumber: number;
  lineContent: string;
  isImportStatement: boolean;
}

export interface CallerFileDiff {
  filePath: string;
  absolutePath: string;
  matchedSymbols: string[];
  referenceLines: number[];
  unifiedDiff: string;
  originalContent: string;
  replacementContent: string;
}

export interface MultiFileTeardownPatch {
  targetLocus: string;
  primaryFilePath: string;
  primaryUnifiedDiff: string;
  callerFiles: CallerFileDiff[];
  combinedUnifiedDiff: string;
  totalFilesAffected: number;
  totalLinesChanged: number;
  discoveredSymbols: string[];
}




