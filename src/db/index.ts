import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import type { DatabaseSync } from "node:sqlite";
import {
  ArtifactStatus,
  ArtifactType,
  CompiledArtifactOutput,
  DecisionArtifactRecord,
  DispatchChannel,
  InvalidationEventRecord,
  LogicCombinator,
  MetricSampleRecord,
  Operator,
  OutboundDispatchLogRecord,
  PremiseRecord,
  PremiseStatus,
  ProbeRecord,
  ProbeType,
  ProbeConnectionStatus,
  DispatchStatus,
  GitHubPrResult,
  ConnectorType,
  ConnectorSettingRecord,
  ConnectorMaskedSetting,
  PrometheusConfig,
  DatadogConfig,
  FinOpsLedgerSummary,
  FinOpsOptions,
} from "@/lib/types";
import { calculateFinOpsLedger } from "@/lib/finops-engine";
import {
  computeArtifactStatus,
  evaluatePremiseState,
  extractJsonPath,
  generateRemediationPlan,
} from "@/lib/evaluator";
import {
  applyTeardownPatchToLocalFile,
  inspectLocalLocus,
  writeExactFileContentToLocus,
} from "@/lib/locus-inspector";
import {
  evaluatePromQlExpression,
  executeReadOnlySqlMetricQuery,
} from "@/lib/probe-engines";
import { publishGitHubPullRequest } from "@/lib/github-pr-bot";
import {
  queryPrometheusInstant,
  queryDatadogTimeseries,
} from "@/lib/telemetry-connectors";
import {
  dispatchSlackWebhookAlert,
  dispatchPagerDutyEvent,
  buildSlackBlockKitAlert,
  buildPagerDutyV2Payload,
} from "@/lib/outbound-dispatchers";
import { INITIAL_SEED_ARTIFACTS, SEED_HISTORICAL_SERIES } from "./seed-data";
import { getActiveSandboxDbPath } from "./sandbox-context";
import { isPublicDemo } from "@/lib/demo-mode";
import {
  DEMO_SEED_SOURCE,
  fetchLiveJson,
  isAllowedInPublicDemo,
  isLiveSource,
  isOutsideUrl,
  liveSourceLabel,
  savedSourceLabel,
} from "@/lib/live-feeds";
import { loadSavedFeed, savedFeedDir } from "@/lib/saved-feeds";
import { resolveWorkspaceRoot } from "@/lib/workspace-root";

/**
 * Database file location. PREMISE_DB_PATH wins; the ./premise.db fallback is
 * refused under `bun test` so the suite can never write the live database.
 */
export function resolveDbPath(): string {
  const fromEnv = process.env.PREMISE_DB_PATH;
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === "test") {
    throw new Error(
      "PREMISE_DB_PATH is not set. Tests must use a scratch database (see src/__tests__/setup/isolate-test-env.ts)."
    );
  }
  return path.join(process.cwd(), "premise.db");
}
const runtimeRequire = createRequire(import.meta.url);

declare global {
  // eslint-disable-next-line no-var
  var __premiseDb: DatabaseSync | undefined;
  // eslint-disable-next-line no-var
  var __premiseSandboxDbs: Map<string, DatabaseSync> | undefined;
}

// Open per-visitor sandbox connections, least recently used first
const MAX_OPEN_SANDBOX_DBS = 64;

function createSqliteInstance(filePath: string): DatabaseSync {
  const isBun =
    typeof process !== "undefined" &&
    Boolean((process.versions as Record<string, string | undefined>)?.bun);
  if (isBun) {
    const { Database } = runtimeRequire("bun:sqlite");
    return new Database(filePath) as unknown as DatabaseSync;
  }
  const { DatabaseSync: NodeDatabaseSync } = runtimeRequire("node:sqlite");
  return new NodeDatabaseSync(filePath);
}

/**
 * Demo decisions belong only in a demo database: a public demo sandbox, or a
 * workspace that holds the bundled demo repo (this repo and the live site).
 * A user's own repo starts empty and only holds the decisions it imports.
 */
export function workspaceHasDemoRepo(root: string = resolveWorkspaceRoot()): boolean {
  return fs.existsSync(path.join(root, "examples", "demo-repo"));
}

function openInitializedDb(filePath: string, seedDemo: boolean): DatabaseSync {
  const db = createSqliteInstance(filePath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  initSchema(db);
  if (seedDemo) seedIfEmpty(db);
  return db;
}

export function getDb(): DatabaseSync {
  const sandboxDbPath = getActiveSandboxDbPath();
  if (sandboxDbPath) {
    return openDatabaseAt(sandboxDbPath);
  }
  if (!global.__premiseDb) {
    global.__premiseDb = openInitializedDb(resolveDbPath(), workspaceHasDemoRepo());
  }
  return global.__premiseDb;
}

/**
 * Opens (or reuses) a schema-initialized database at an explicit path, seeded
 * with the demo decisions unless `seedDemo` is false. Used for public demo
 * sandboxes and their seed template.
 */
export function openDatabaseAt(
  filePath: string,
  options: { seedDemo?: boolean } = {}
): DatabaseSync {
  const cache = (global.__premiseSandboxDbs ??= new Map());
  const cached = cache.get(filePath);
  if (cached) {
    cache.delete(filePath);
    cache.set(filePath, cached);
    return cached;
  }
  const db = openInitializedDb(filePath, options.seedDemo ?? true);
  cache.set(filePath, db);
  while (cache.size > MAX_OPEN_SANDBOX_DBS) {
    const oldestPath = cache.keys().next().value as string;
    closeDatabaseAt(oldestPath);
  }
  return db;
}

export function closeDatabaseAt(filePath: string): void {
  const cache = global.__premiseSandboxDbs;
  const db = cache?.get(filePath);
  if (!cache || !db) return;
  cache.delete(filePath);
  try {
    db.close();
  } catch {
    // Already closed
  }
}

function initSchema(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS DecisionArtifact (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      rawContent TEXT NOT NULL,
      targetLocus TEXT NOT NULL,
      blastRadius TEXT NOT NULL,
      logicCombinator TEXT NOT NULL DEFAULT 'ANY',
      dependsOnIds TEXT NOT NULL DEFAULT '[]',
      cascadedFromId TEXT DEFAULT NULL,
      monthlyCloudSpendUsd REAL NOT NULL DEFAULT 0,
      maintenanceHoursPerMonth REAL NOT NULL DEFAULT 0,
      realizedAnnualSavingsUsd REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'HEALTHY',
      createdAt TEXT NOT NULL,
      lastEvaluatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS Premise (
      id TEXT PRIMARY KEY,
      artifactId TEXT NOT NULL,
      claim TEXT NOT NULL,
      variableName TEXT NOT NULL,
      unit TEXT NOT NULL DEFAULT '',
      operator TEXT NOT NULL,
      thresholdValue TEXT NOT NULL,
      currentValue TEXT NOT NULL,
      decayWarningMargin REAL NOT NULL DEFAULT 0.10,
      status TEXT NOT NULL DEFAULT 'VALID',
      valueSource TEXT DEFAULT NULL,
      valueObservedAt TEXT DEFAULT NULL,
      FOREIGN KEY (artifactId) REFERENCES DecisionArtifact(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS Probe (
      id TEXT PRIMARY KEY,
      premiseId TEXT NOT NULL,
      probeType TEXT NOT NULL,
      targetUrlOrQuery TEXT NOT NULL,
      jsonPath TEXT NOT NULL DEFAULT '$.value',
      pollingIntervalSeconds INTEGER NOT NULL DEFAULT 60,
      valueMultiplier REAL NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      lastRunAt TEXT,
      lastLatencyMs INTEGER,
      lastRawResponse TEXT,
      lastError TEXT,
      FOREIGN KEY (premiseId) REFERENCES Premise(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS InvalidationEvent (
      id TEXT PRIMARY KEY,
      premiseId TEXT NOT NULL,
      artifactId TEXT NOT NULL,
      previousValue TEXT NOT NULL,
      breakingValue TEXT NOT NULL,
      thresholdValue TEXT NOT NULL,
      remediationPlan TEXT NOT NULL,
      realizedAnnualSavingsUsd REAL NOT NULL DEFAULT 0,
      acknowledged INTEGER NOT NULL DEFAULT 0,
      triggeredAt TEXT NOT NULL,
      FOREIGN KEY (premiseId) REFERENCES Premise(id) ON DELETE CASCADE,
      FOREIGN KEY (artifactId) REFERENCES DecisionArtifact(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS TelemetryMetric (
      variableName TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      unit TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'live-telemetry',
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS MetricSample (
      id TEXT PRIMARY KEY,
      premiseId TEXT NOT NULL,
      variableName TEXT NOT NULL,
      value REAL NOT NULL,
      source TEXT NOT NULL DEFAULT 'probe',
      recordedAt TEXT NOT NULL,
      FOREIGN KEY (premiseId) REFERENCES Premise(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS OutboundDispatchLog (
      id TEXT PRIMARY KEY,
      eventId TEXT NOT NULL,
      artifactId TEXT NOT NULL,
      channel TEXT NOT NULL,
      targetEndpoint TEXT NOT NULL,
      summary TEXT NOT NULL,
      payloadPreview TEXT NOT NULL,
      responseStatus INTEGER NOT NULL DEFAULT 201,
      externalUrl TEXT NOT NULL,
      dispatchedAt TEXT NOT NULL,
      deliveryStatus TEXT DEFAULT NULL,
      errorMessage TEXT DEFAULT NULL,
      FOREIGN KEY (eventId) REFERENCES InvalidationEvent(id) ON DELETE CASCADE,
      FOREIGN KEY (artifactId) REFERENCES DecisionArtifact(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS LocusBackup (
      resolvedPath TEXT PRIMARY KEY,
      rawLocus TEXT NOT NULL,
      artifactId TEXT,
      originalContent TEXT NOT NULL,
      patchedContent TEXT NOT NULL,
      appliedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ConnectorSetting (
      id TEXT PRIMARY KEY,
      connectorType TEXT NOT NULL,
      configJson TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
  `);

  // Safe migrations if DecisionArtifact was created before v2.5 columns existed
  try {
    db.exec(
      "ALTER TABLE DecisionArtifact ADD COLUMN logicCombinator TEXT NOT NULL DEFAULT 'ANY';"
    );
  } catch {
    // Column already exists
  }
  try {
    db.exec(
      "ALTER TABLE DecisionArtifact ADD COLUMN dependsOnIds TEXT NOT NULL DEFAULT '[]';"
    );
  } catch {
    // Column already exists
  }
  try {
    db.exec(
      "ALTER TABLE DecisionArtifact ADD COLUMN cascadedFromId TEXT DEFAULT NULL;"
    );
  } catch {
    // Column already exists
  }
  try {
    db.exec(
      "ALTER TABLE DecisionArtifact ADD COLUMN monthlyCloudSpendUsd REAL NOT NULL DEFAULT 0;"
    );
  } catch {
    // Column already exists
  }
  try {
    db.exec(
      "ALTER TABLE DecisionArtifact ADD COLUMN maintenanceHoursPerMonth REAL NOT NULL DEFAULT 0;"
    );
  } catch {
    // Column already exists
  }
  try {
    db.exec(
      "ALTER TABLE DecisionArtifact ADD COLUMN realizedAnnualSavingsUsd REAL NOT NULL DEFAULT 0;"
    );
  } catch {
    // Column already exists
  }
  try {
    db.exec(
      "ALTER TABLE InvalidationEvent ADD COLUMN realizedAnnualSavingsUsd REAL NOT NULL DEFAULT 0;"
    );
  } catch {
    // Column already exists
  }
  for (const statement of [
    "ALTER TABLE Probe ADD COLUMN valueMultiplier REAL NOT NULL DEFAULT 1;",
    "ALTER TABLE Probe ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE';",
    "ALTER TABLE Premise ADD COLUMN valueSource TEXT DEFAULT NULL;",
    "ALTER TABLE Premise ADD COLUMN valueObservedAt TEXT DEFAULT NULL;",
    "ALTER TABLE OutboundDispatchLog ADD COLUMN deliveryStatus TEXT DEFAULT NULL;",
    "ALTER TABLE OutboundDispatchLog ADD COLUMN errorMessage TEXT DEFAULT NULL;",
  ]) {
    try {
      db.exec(statement);
    } catch {
      // Column already exists
    }
  }
}

function parseDependsOnIds(raw?: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

function seedIfEmpty(db: DatabaseSync) {
  const countRow = db
    .prepare("SELECT COUNT(*) as cnt FROM DecisionArtifact")
    .get() as { cnt: number };
  if (!countRow || countRow.cnt === 0) {
    insertSeedData(db);
    return;
  }

  // Upgrade existing DB with new seed artifacts (e.g., art-vendor-redis cascade dependency) & locus line ranges & FinOps drag
  for (const seedArt of INITIAL_SEED_ARTIFACTS) {
    const existing = db
      .prepare("SELECT id, targetLocus FROM DecisionArtifact WHERE id = ?")
      .get(seedArt.id) as { id: string; targetLocus: string } | undefined;
    if (!existing) {
      insertSingleSeedArtifact(db, seedArt);
    } else {
      if (!existing.targetLocus.includes(":L")) {
        db.prepare(
          "UPDATE DecisionArtifact SET targetLocus = ? WHERE id = ?"
        ).run(seedArt.targetLocus, seedArt.id);
      }
      db.prepare(
        "UPDATE DecisionArtifact SET monthlyCloudSpendUsd = ?, maintenanceHoursPerMonth = ? WHERE id = ? AND monthlyCloudSpendUsd = 0"
      ).run(
        seedArt.monthlyCloudSpendUsd || 0,
        seedArt.maintenanceHoursPerMonth || 0,
        seedArt.id
      );
    }
  }

  syncSeedLiveProbes(db);

  // Ensure MetricSample table is populated if upgrading an existing DB
  const sampleCount = db
    .prepare("SELECT COUNT(*) as cnt FROM MetricSample")
    .get() as { cnt: number };
  if (!sampleCount || sampleCount.cnt === 0) {
    seedHistoricalSamplesOnly(db);
  }
}

/**
 * Older databases seeded a demo feed for probes that now read real outside
 * data. Point those probes at the real source and clear the demo value so the
 * premise waits for its first real fetch.
 */
function syncSeedLiveProbes(db: DatabaseSync) {
  for (const art of INITIAL_SEED_ARTIFACTS) {
    for (const p of art.premises) {
      for (const pr of p.probes) {
        if (!isOutsideUrl(pr.targetUrlOrQuery)) continue;
        const existing = db
          .prepare("SELECT targetUrlOrQuery FROM Probe WHERE id = ?")
          .get(pr.id) as { targetUrlOrQuery: string } | undefined;
        if (!existing || existing.targetUrlOrQuery === pr.targetUrlOrQuery) continue;
        db.prepare(
          `UPDATE Probe SET probeType = ?, targetUrlOrQuery = ?, jsonPath = ?, pollingIntervalSeconds = ?,
             valueMultiplier = ?, status = ?, lastRunAt = NULL, lastLatencyMs = NULL, lastRawResponse = NULL, lastError = NULL
           WHERE id = ?`
        ).run(
          pr.probeType,
          pr.targetUrlOrQuery,
          pr.jsonPath,
          pr.pollingIntervalSeconds,
          pr.valueMultiplier ?? 1,
          pr.status ?? "ACTIVE",
          pr.id
        );
        db.prepare(
          `UPDATE Premise SET currentValue = '', status = 'UNBOUND', valueSource = NULL, valueObservedAt = NULL
           WHERE id = ? AND (valueSource IS NULL OR valueSource NOT LIKE 'live:%')`
        ).run(p.id);
      }
    }
  }
}

function seedHistoricalSamplesOnly(db: DatabaseSync) {
  const insertSample = db.prepare(`
    INSERT OR IGNORE INTO MetricSample (id, premiseId, variableName, value, source, recordedAt)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const baseTime = new Date("2026-10-19T06:00:00.000Z").getTime();
  for (const art of INITIAL_SEED_ARTIFACTS) {
    for (const p of art.premises) {
      if (!p.currentValue.trim()) continue;
      const series = SEED_HISTORICAL_SERIES[p.id] || [Number(p.currentValue)];
      series.forEach((val, idx) => {
        const ts = new Date(baseTime + idx * 1800 * 1000).toISOString();
        insertSample.run(
          `smp-${p.id}-${idx}`,
          p.id,
          p.variableName,
          val,
          "historical-telemetry",
          ts
        );
      });
    }
  }
}

function insertSingleSeedArtifact(
  db: DatabaseSync,
  art: DecisionArtifactRecord
) {
  const insertArtifact = db.prepare(`
    INSERT INTO DecisionArtifact (id, title, type, rawContent, targetLocus, blastRadius, logicCombinator, dependsOnIds, cascadedFromId, monthlyCloudSpendUsd, maintenanceHoursPerMonth, realizedAnnualSavingsUsd, status, createdAt, lastEvaluatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertPremise = db.prepare(`
    INSERT INTO Premise (id, artifactId, claim, variableName, unit, operator, thresholdValue, currentValue, decayWarningMargin, status, valueSource, valueObservedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertProbe = db.prepare(`
    INSERT INTO Probe (id, premiseId, probeType, targetUrlOrQuery, jsonPath, pollingIntervalSeconds, valueMultiplier, status, lastRunAt, lastLatencyMs, lastRawResponse, lastError)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const upsertTelemetry = db.prepare(`
    INSERT OR REPLACE INTO TelemetryMetric (variableName, value, unit, source, updatedAt)
    VALUES (?, ?, ?, ?, ?)
  `);

  const combinator: LogicCombinator = art.logicCombinator || "ANY";
  const evaluatedStatuses: PremiseStatus[] = [];
  for (const p of art.premises) {
    const evalRes = evaluatePremiseState(
      p.currentValue,
      p.operator,
      p.thresholdValue,
      p.decayWarningMargin
    );
    evaluatedStatuses.push(evalRes.status);
  }
  const computedArtStatus = computeArtifactStatus(
    evaluatedStatuses,
    combinator
  );

  insertArtifact.run(
    art.id,
    art.title,
    art.type,
    art.rawContent,
    art.targetLocus,
    art.blastRadius,
    combinator,
    JSON.stringify(art.dependsOnIds || []),
    art.cascadedFromId || null,
    art.monthlyCloudSpendUsd || 0,
    art.maintenanceHoursPerMonth || 0,
    art.realizedAnnualSavingsUsd || 0,
    computedArtStatus,
    art.createdAt,
    art.lastEvaluatedAt
  );

  const baseTime = new Date("2026-10-19T06:00:00.000Z").getTime();
  const insertSample = db.prepare(`
    INSERT OR IGNORE INTO MetricSample (id, premiseId, variableName, value, source, recordedAt)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (const p of art.premises) {
    const evalRes = evaluatePremiseState(
      p.currentValue,
      p.operator,
      p.thresholdValue,
      p.decayWarningMargin
    );
    const hasSeedValue = p.currentValue.trim() !== "";
    insertPremise.run(
      p.id,
      art.id,
      p.claim,
      p.variableName,
      p.unit,
      p.operator,
      p.thresholdValue,
      p.currentValue,
      p.decayWarningMargin,
      evalRes.status,
      hasSeedValue ? DEMO_SEED_SOURCE : null,
      hasSeedValue ? art.lastEvaluatedAt : null
    );

    if (!hasSeedValue) {
      // Live premises start empty and wait for their first real fetch
      for (const pr of p.probes) {
        insertProbe.run(
          pr.id,
          p.id,
          pr.probeType,
          pr.targetUrlOrQuery,
          pr.jsonPath,
          pr.pollingIntervalSeconds,
          pr.valueMultiplier ?? 1,
          pr.status ?? "ACTIVE",
          null,
          null,
          null,
          null
        );
      }
      continue;
    }

    upsertTelemetry.run(
      p.variableName,
      p.currentValue,
      p.unit,
      DEMO_SEED_SOURCE,
      art.lastEvaluatedAt
    );

    const series = SEED_HISTORICAL_SERIES[p.id] || [Number(p.currentValue)];
    series.forEach((val, idx) => {
      const ts = new Date(baseTime + idx * 1800 * 1000).toISOString();
      insertSample.run(
        `smp-${p.id}-${idx}`,
        p.id,
        p.variableName,
        val,
        "historical-telemetry",
        ts
      );
    });

    for (const pr of p.probes) {
      insertProbe.run(
        pr.id,
        p.id,
        pr.probeType,
        pr.targetUrlOrQuery,
        pr.jsonPath,
        pr.pollingIntervalSeconds,
        pr.valueMultiplier ?? 1,
        pr.status ?? "ACTIVE",
        pr.lastRunAt,
        pr.lastLatencyMs,
        pr.lastRawResponse,
        pr.lastError
      );
    }
  }
}

function insertSeedData(db: DatabaseSync) {
  for (const art of INITIAL_SEED_ARTIFACTS) {
    insertSingleSeedArtifact(db, art);
  }
  propagateCrossArtifactCascades(db);
}

export function resetDatabaseToSeed(): DecisionArtifactRecord[] {
  const db = getDb();
  // Restore any local files that had teardown patches applied
  try {
    const backups = db
      .prepare("SELECT resolvedPath, rawLocus, originalContent FROM LocusBackup")
      .all() as Array<{
      resolvedPath: string;
      rawLocus: string;
      originalContent: string;
    }>;
    for (const b of backups) {
      writeExactFileContentToLocus(b.rawLocus, b.resolvedPath, b.originalContent);
    }
    db.exec("DELETE FROM LocusBackup;");
  } catch {
    // ignore if LocusBackup empty
  }
  db.exec("DELETE FROM OutboundDispatchLog;");
  db.exec("DELETE FROM MetricSample;");
  db.exec("DELETE FROM InvalidationEvent;");
  db.exec("DELETE FROM Probe;");
  db.exec("DELETE FROM Premise;");
  db.exec("DELETE FROM DecisionArtifact;");
  db.exec("DELETE FROM TelemetryMetric;");
  if (getActiveSandboxDbPath() || workspaceHasDemoRepo()) {
    insertSeedData(db);
  }
  return getAllArtifactsWithRelations();
}

export function getLiveTelemetrySnapshot(): Record<string, number | string> {
  const db = getDb();
  const rows = db
    .prepare("SELECT variableName, value FROM TelemetryMetric")
    .all() as Array<{ variableName: string; value: string }>;

  const metrics: Record<string, number | string> = {};
  for (const r of rows) {
    const num = Number(r.value);
    metrics[r.variableName] = Number.isNaN(num) ? r.value : num;
  }
  return metrics;
}

export function getAllArtifactsWithRelations(): DecisionArtifactRecord[] {
  const db = getDb();

  const artifactRows = db
    .prepare("SELECT * FROM DecisionArtifact ORDER BY createdAt ASC")
    .all() as Array<{
    id: string;
    title: string;
    type: ArtifactType;
    rawContent: string;
    targetLocus: string;
    blastRadius: string;
    logicCombinator?: LogicCombinator;
    dependsOnIds?: string;
    cascadedFromId?: string | null;
    status: ArtifactStatus;
    createdAt: string;
    lastEvaluatedAt: string;
  }>;

  const premiseRows = db.prepare("SELECT * FROM Premise").all() as Array<{
    id: string;
    artifactId: string;
    claim: string;
    variableName: string;
    unit: string;
    operator: Operator;
    thresholdValue: string;
    currentValue: string;
    decayWarningMargin: number;
    status: PremiseStatus;
    valueSource: string | null;
    valueObservedAt: string | null;
  }>;

  const probeRows = db.prepare("SELECT * FROM Probe").all() as Array<{
    id: string;
    premiseId: string;
    probeType: ProbeType;
    targetUrlOrQuery: string;
    jsonPath: string;
    pollingIntervalSeconds: number;
    valueMultiplier: number;
    status: ProbeConnectionStatus;
    lastRunAt: string | null;
    lastLatencyMs: number | null;
    lastRawResponse: string | null;
    lastError: string | null;
  }>;

  const sampleRows = db
    .prepare("SELECT * FROM MetricSample ORDER BY recordedAt ASC")
    .all() as unknown as MetricSampleRecord[];

  const dispatchRows = db
    .prepare("SELECT * FROM OutboundDispatchLog ORDER BY dispatchedAt DESC")
    .all() as unknown as OutboundDispatchLogRecord[];

  const eventRows = db
    .prepare(
      `SELECT e.*, p.claim as premiseClaim, p.variableName as variableName, p.operator as operator, p.unit as unit,
              a.title as artifactTitle, a.targetLocus as targetLocus
       FROM InvalidationEvent e
       JOIN Premise p ON e.premiseId = p.id
       JOIN DecisionArtifact a ON e.artifactId = a.id
       ORDER BY e.triggeredAt DESC`
    )
    .all() as Array<{
    id: string;
    premiseId: string;
    artifactId: string;
    previousValue: string;
    breakingValue: string;
    thresholdValue: string;
    remediationPlan: string;
    acknowledged: number;
    triggeredAt: string;
    premiseClaim: string;
    variableName: string;
    operator: Operator;
    unit: string;
    artifactTitle: string;
    targetLocus: string;
  }>;

  const probesByPremise = new Map<string, ProbeRecord[]>();
  for (const pr of probeRows) {
    const list = probesByPremise.get(pr.premiseId) || [];
    list.push({ ...pr });
    probesByPremise.set(pr.premiseId, list);
  }

  const samplesByPremise = new Map<string, MetricSampleRecord[]>();
  for (const smp of sampleRows) {
    const list = samplesByPremise.get(smp.premiseId) || [];
    list.push(smp);
    samplesByPremise.set(smp.premiseId, list);
  }

  const dispatchesByEvent = new Map<string, OutboundDispatchLogRecord[]>();
  for (const d of dispatchRows) {
    const list = dispatchesByEvent.get(d.eventId) || [];
    list.push(d);
    dispatchesByEvent.set(d.eventId, list);
  }

  const premisesByArtifact = new Map<string, PremiseRecord[]>();
  for (const pm of premiseRows) {
    const list = premisesByArtifact.get(pm.artifactId) || [];
    list.push({
      ...pm,
      probes: probesByPremise.get(pm.id) || [],
      metricSamples: (samplesByPremise.get(pm.id) || []).slice(-20),
    });
    premisesByArtifact.set(pm.artifactId, list);
  }

  const eventsByArtifact = new Map<string, InvalidationEventRecord[]>();
  for (const ev of eventRows) {
    const list = eventsByArtifact.get(ev.artifactId) || [];
    list.push({
      ...ev,
      realizedAnnualSavingsUsd: Number((ev as any).realizedAnnualSavingsUsd || 0),
      acknowledged: Boolean(ev.acknowledged),
      dispatchLogs: dispatchesByEvent.get(ev.id) || [],
    });
    eventsByArtifact.set(ev.artifactId, list);
  }

  const downstreamByArtifact = new Map<string, string[]>();
  for (const art of artifactRows) {
    const deps = parseDependsOnIds(art.dependsOnIds);
    for (const upId of deps) {
      const list = downstreamByArtifact.get(upId) || [];
      if (!list.includes(art.id)) {
        list.push(art.id);
      }
      downstreamByArtifact.set(upId, list);
    }
  }

  return artifactRows.map((art) => ({
    ...art,
    logicCombinator: art.logicCombinator || "ANY",
    dependsOnIds: parseDependsOnIds(art.dependsOnIds),
    downstreamDependentIds: downstreamByArtifact.get(art.id) || [],
    cascadedFromId: art.cascadedFromId || null,
    monthlyCloudSpendUsd: Number((art as any).monthlyCloudSpendUsd || 0),
    maintenanceHoursPerMonth: Number((art as any).maintenanceHoursPerMonth || 0),
    realizedAnnualSavingsUsd: Number((art as any).realizedAnnualSavingsUsd || 0),
    premises: premisesByArtifact.get(art.id) || [],
    invalidationEvents: eventsByArtifact.get(art.id) || [],
  }));
}

export function getAllInvalidationEvents(): InvalidationEventRecord[] {
  const db = getDb();
  const dispatchRows = db
    .prepare("SELECT * FROM OutboundDispatchLog ORDER BY dispatchedAt DESC")
    .all() as unknown as OutboundDispatchLogRecord[];
  const dispatchesByEvent = new Map<string, OutboundDispatchLogRecord[]>();
  for (const d of dispatchRows) {
    const list = dispatchesByEvent.get(d.eventId) || [];
    list.push(d);
    dispatchesByEvent.set(d.eventId, list);
  }

  const rows = db
    .prepare(
      `SELECT e.*, p.claim as premiseClaim, p.variableName as variableName, p.operator as operator, p.unit as unit,
              a.title as artifactTitle, a.targetLocus as targetLocus
       FROM InvalidationEvent e
       JOIN Premise p ON e.premiseId = p.id
       JOIN DecisionArtifact a ON e.artifactId = a.id
       ORDER BY e.triggeredAt DESC`
    )
    .all() as Array<{
    id: string;
    premiseId: string;
    artifactId: string;
    previousValue: string;
    breakingValue: string;
    thresholdValue: string;
    remediationPlan: string;
    acknowledged: number;
    triggeredAt: string;
    premiseClaim: string;
    variableName: string;
    operator: Operator;
    unit: string;
    artifactTitle: string;
    targetLocus: string;
    realizedAnnualSavingsUsd?: number;
  }>;

  return rows.map((r) => ({
    ...r,
    realizedAnnualSavingsUsd: Number((r as any).realizedAnnualSavingsUsd || 0),
    acknowledged: Boolean(r.acknowledged),
    dispatchLogs: dispatchesByEvent.get(r.id) || [],
  }));
}

/**
 * Evaluates and propagates multi-hop cross-artifact invalidation cascades.
 * When an upstream DecisionArtifact is INVALIDATED, any downstream DecisionArtifact
 * that depends on it (via dependsOnIds) is automatically marked INVALIDATED with a
 * cascade InvalidationEvent and a real unified git teardown diff.
 */
export function propagateCrossArtifactCascades(dbInput?: DatabaseSync): void {
  const db = dbInput || getDb();
  const nowIso = new Date().toISOString();

  const artifacts = db
    .prepare("SELECT * FROM DecisionArtifact")
    .all() as Array<{
    id: string;
    title: string;
    type: string;
    targetLocus: string;
    blastRadius: string;
    logicCombinator?: LogicCombinator;
    dependsOnIds?: string;
    cascadedFromId?: string | null;
    status: ArtifactStatus;
  }>;

  const premises = db.prepare("SELECT * FROM Premise").all() as Array<{
    id: string;
    artifactId: string;
    claim: string;
    variableName: string;
    unit: string;
    operator: Operator;
    thresholdValue: string;
    currentValue: string;
    status: PremiseStatus;
  }>;

  const premisesByArt = new Map<string, typeof premises>();
  for (const p of premises) {
    const list = premisesByArt.get(p.artifactId) || [];
    list.push(p);
    premisesByArt.set(p.artifactId, list);
  }

  const artById = new Map(artifacts.map((a) => [a.id, a]));
  const effectiveStatus = new Map<string, ArtifactStatus>();
  const cascadeSourceId = new Map<string, string | null>();

  // Step 1: Intrinsic status from each artifact's own premises + boolean gate
  for (const art of artifacts) {
    if (art.status === "DEPRECATED_BY_PREMISE_ENGINE" || art.status === "RETIRED") {
      effectiveStatus.set(art.id, art.status);
      cascadeSourceId.set(art.id, null);
      continue;
    }
    const artPremises = premisesByArt.get(art.id) || [];
    const intrinsic = computeArtifactStatus(
      artPremises.map((p) => p.status),
      art.logicCombinator || "ANY"
    );
    effectiveStatus.set(art.id, intrinsic);
    cascadeSourceId.set(art.id, null);
  }

  // Step 2: Multi-hop fixed-point propagation along dependsOnIds edges
  for (let hop = 0; hop < artifacts.length; hop++) {
    let anyChanged = false;
    for (const art of artifacts) {
      if (
        effectiveStatus.get(art.id) === "INVALIDATED" ||
        effectiveStatus.get(art.id) === "DEPRECATED_BY_PREMISE_ENGINE" ||
        effectiveStatus.get(art.id) === "RETIRED"
      ) {
        continue;
      }
      const deps = parseDependsOnIds(art.dependsOnIds);
      const invalidatedUpstreamId = deps.find(
        (upId) => effectiveStatus.get(upId) === "INVALIDATED"
      );
      if (invalidatedUpstreamId) {
        effectiveStatus.set(art.id, "INVALIDATED");
        cascadeSourceId.set(art.id, invalidatedUpstreamId);
        anyChanged = true;
      }
    }
    if (!anyChanged) break;
  }

  // Step 3: Persist effective status & cascade InvalidationEvents
  for (const art of artifacts) {
    const nextStatus = effectiveStatus.get(art.id) || "HEALTHY";
    const nextCascadeFrom = cascadeSourceId.get(art.id) || null;
    const cascadeEventId = `inv-cascade-${art.id}`;

    if (art.status !== nextStatus || (art.cascadedFromId || null) !== nextCascadeFrom) {
      db.prepare(
        "UPDATE DecisionArtifact SET status = ?, cascadedFromId = ?, lastEvaluatedAt = ? WHERE id = ?"
      ).run(nextStatus, nextCascadeFrom, nowIso, art.id);
    }

    if (nextCascadeFrom) {
      const upstreamArt = artById.get(nextCascadeFrom);
      const artPremises = premisesByArt.get(art.id) || [];
      const anchorPremise = artPremises[0];
      if (anchorPremise && upstreamArt) {
        const remediationPlan = generateRemediationPlan({
          artifactId: art.id,
          artifactTitle: art.title,
          artifactType: art.type,
          targetLocus: art.targetLocus,
          blastRadius: art.blastRadius,
          premiseClaim: `Upstream dependency [${upstreamArt.title}] invalidated → Multi-hop cascade triggered`,
          variableName: anchorPremise.variableName,
          unit: anchorPremise.unit,
          operator: anchorPremise.operator,
          thresholdValue: anchorPremise.thresholdValue,
          previousValue: anchorPremise.currentValue,
          breakingValue: `CASCADE(${upstreamArt.id})`,
          cascadedFromTitle: upstreamArt.title,
        });

        const existingCascadeEvent = db
          .prepare("SELECT id FROM InvalidationEvent WHERE id = ?")
          .get(cascadeEventId) as { id: string } | undefined;

        if (existingCascadeEvent) {
          db.prepare(
            "UPDATE InvalidationEvent SET remediationPlan = ?, triggeredAt = ?, acknowledged = 0 WHERE id = ?"
          ).run(remediationPlan, nowIso, cascadeEventId);
        } else {
          db.prepare(
            `INSERT INTO InvalidationEvent (id, premiseId, artifactId, previousValue, breakingValue, thresholdValue, remediationPlan, acknowledged, triggeredAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`
          ).run(
            cascadeEventId,
            anchorPremise.id,
            art.id,
            anchorPremise.currentValue,
            `CASCADE(${upstreamArt.id})`,
            anchorPremise.thresholdValue,
            remediationPlan,
            nowIso
          );
        }
      }
    } else {
      // Clear any active cascade event if upstream is no longer invalidated
      db.prepare(
        "DELETE FROM InvalidationEvent WHERE id = ? AND acknowledged = 0"
      ).run(cascadeEventId);
    }
  }
}

/**
 * Updates the boolean logic gate (ANY vs ALL) for a DecisionArtifact
 * and immediately recomputes its aggregate health status + multi-hop cascades.
 */
export function updateArtifactCombinator(
  artifactId: string,
  combinator: LogicCombinator
): DecisionArtifactRecord[] {
  const db = getDb();
  const nowIso = new Date().toISOString();
  const artPremises = db
    .prepare("SELECT status FROM Premise WHERE artifactId = ?")
    .all(artifactId) as Array<{ status: PremiseStatus }>;

  const nextStatus = computeArtifactStatus(
    artPremises.map((p) => p.status),
    combinator
  );

  db.prepare(
    "UPDATE DecisionArtifact SET logicCombinator = ?, status = ?, lastEvaluatedAt = ? WHERE id = ?"
  ).run(combinator, nextStatus, nowIso, artifactId);

  propagateCrossArtifactCascades(db);
  return getAllArtifactsWithRelations();
}

/**
 * Updates upstream cross-artifact dependencies (dependsOnIds) for a DecisionArtifact
 * with cycle prevention, then recomputes multi-hop cascades.
 */
export function updateArtifactDependencies(
  artifactId: string,
  dependsOnIds: string[]
): {
  artifacts: DecisionArtifactRecord[];
  invalidationEvents: InvalidationEventRecord[];
} {
  const db = getDb();
  const allRows = db
    .prepare("SELECT id, dependsOnIds FROM DecisionArtifact")
    .all() as Array<{ id: string; dependsOnIds?: string }>;

  const validIds = new Set(allRows.map((r) => r.id));
  const sanitized = Array.from(
    new Set(
      dependsOnIds.filter((id) => id !== artifactId && validIds.has(id))
    )
  );

  // Prevent cycles: check if artifactId is reachable from any candidate upstream dependency
  const depMap = new Map<string, string[]>();
  for (const r of allRows) {
    depMap.set(r.id, parseDependsOnIds(r.dependsOnIds));
  }
  depMap.set(artifactId, sanitized);

  const createsCycle = (startId: string): boolean => {
    const visited = new Set<string>();
    const stack = [startId];
    while (stack.length > 0) {
      const curr = stack.pop()!;
      if (curr === artifactId && visited.size > 0) return true;
      if (visited.has(curr)) continue;
      visited.add(curr);
      const nextDeps = depMap.get(curr) || [];
      for (const nxt of nextDeps) {
        if (nxt === artifactId) return true;
        stack.push(nxt);
      }
    }
    return false;
  };

  if (createsCycle(artifactId)) {
    throw new Error(
      "Cannot link upstream dependency: circular dependency detected in DecisionArtifact graph."
    );
  }

  db.prepare(
    "UPDATE DecisionArtifact SET dependsOnIds = ?, lastEvaluatedAt = ? WHERE id = ?"
  ).run(JSON.stringify(sanitized), new Date().toISOString(), artifactId);

  propagateCrossArtifactCascades(db);
  return {
    artifacts: getAllArtifactsWithRelations(),
    invalidationEvents: getAllInvalidationEvents(),
  };
}

/**
 * Inline Premise & Probe Configuration Editor:
 * Updates operator, thresholdValue, decayWarningMargin, claim, and Probe targetUrlOrQuery/probeType/jsonPath,
 * then immediately re-evaluates the Premise, parent DecisionArtifact, and multi-hop cascades.
 */
export function updatePremiseAndProbeConfig(params: {
  premiseId: string;
  claim?: string;
  operator: Operator;
  thresholdValue: string;
  decayWarningMargin: number;
  probeType?: ProbeType;
  targetUrlOrQuery?: string;
  jsonPath?: string;
  pollingIntervalSeconds?: number;
  valueMultiplier?: number;
}): {
  artifacts: DecisionArtifactRecord[];
  invalidationEvents: InvalidationEventRecord[];
} {
  const db = getDb();
  const existingPremise = db
    .prepare("SELECT * FROM Premise WHERE id = ?")
    .get(params.premiseId) as
    | {
        id: string;
        artifactId: string;
        claim: string;
        variableName: string;
        currentValue: string;
        valueSource: string | null;
        valueObservedAt: string | null;
      }
    | undefined;

  if (!existingPremise) {
    throw new Error(`Premise ${params.premiseId} not found`);
  }

  const nextClaim =
    params.claim && params.claim.trim()
      ? params.claim.trim()
      : existingPremise.claim;
  const clampedMargin = Math.min(
    0.5,
    Math.max(0.001, Number(params.decayWarningMargin) || 0.1)
  );

  db.prepare(
    `UPDATE Premise
     SET claim = ?, operator = ?, thresholdValue = ?, decayWarningMargin = ?
     WHERE id = ?`
  ).run(
    nextClaim,
    params.operator,
    String(params.thresholdValue).trim(),
    clampedMargin,
    params.premiseId
  );

  if (
    params.targetUrlOrQuery !== undefined ||
    params.probeType !== undefined ||
    params.jsonPath !== undefined ||
    params.pollingIntervalSeconds !== undefined ||
    params.valueMultiplier !== undefined
  ) {
    const existingProbe = db
      .prepare("SELECT * FROM Probe WHERE premiseId = ? LIMIT 1")
      .get(params.premiseId) as
      | {
          id: string;
          probeType: ProbeType;
          targetUrlOrQuery: string;
          jsonPath: string;
          pollingIntervalSeconds: number;
          valueMultiplier: number;
        }
      | undefined;

    if (existingProbe) {
      const nextTarget =
        params.targetUrlOrQuery !== undefined
          ? params.targetUrlOrQuery.trim()
          : existingProbe.targetUrlOrQuery;
      const nextMultiplier =
        params.valueMultiplier !== undefined && Number(params.valueMultiplier) > 0
          ? Number(params.valueMultiplier)
          : existingProbe.valueMultiplier;
      // A probe goes live only once a person gives it a real source
      db.prepare(
        `UPDATE Probe
         SET probeType = ?, targetUrlOrQuery = ?, jsonPath = ?, pollingIntervalSeconds = ?, valueMultiplier = ?, status = ?
         WHERE id = ?`
      ).run(
        params.probeType || existingProbe.probeType,
        nextTarget,
        params.jsonPath?.trim() || existingProbe.jsonPath,
        params.pollingIntervalSeconds || existingProbe.pollingIntervalSeconds,
        nextMultiplier,
        nextTarget ? "ACTIVE" : "UNBOUND",
        existingProbe.id
      );
    }
  }

  // Re-evaluate the premise's existing value under the new operator/threshold/margin.
  // The value and where it came from stay the same.
  evaluateAndPersistMetricUpdate({
    premiseId: params.premiseId,
    value: existingPremise.currentValue,
    source: existingPremise.valueSource || "inline-config-editor",
    observedAt: existingPremise.valueObservedAt || undefined,
  });

  return {
    artifacts: getAllArtifactsWithRelations(),
    invalidationEvents: getAllInvalidationEvents(),
  };
}

/**
 * Core evaluation pipeline for updating a metric by variableName (or premiseId)
 * and executing all state transitions + MetricSample time-series recording + InvalidationEvent generation.
 */
export function evaluateAndPersistMetricUpdate(params: {
  variableName?: string;
  premiseId?: string;
  value: string | number;
  source?: string;
  latencyMs?: number;
  rawPayload?: Record<string, unknown>;
  /** When the value was really observed; defaults to now */
  observedAt?: string;
  /** Set when a probe run produced this value; only that probe's run record is updated */
  fromProbeId?: string;
}): {
  updatedPremises: PremiseRecord[];
  triggeredEvents: InvalidationEventRecord[];
  artifacts: DecisionArtifactRecord[];
} {
  const db = getDb();
  const nowIso = new Date().toISOString();
  const strValue = String(params.value);

  const matchingPremises = (
    params.premiseId
      ? db
          .prepare("SELECT * FROM Premise WHERE id = ?")
          .all(params.premiseId)
      : db
          .prepare("SELECT * FROM Premise WHERE variableName = ?")
          .all(params.variableName ?? "")
  ) as Array<{
    id: string;
    artifactId: string;
    claim: string;
    variableName: string;
    unit: string;
    operator: Operator;
    thresholdValue: string;
    currentValue: string;
    decayWarningMargin: number;
    status: PremiseStatus;
  }>;

  const affectedArtifactIds = new Set<string>();
  const triggeredEvents: InvalidationEventRecord[] = [];

  const hasValue = strValue.trim() !== "";
  for (const prem of matchingPremises) {
    affectedArtifactIds.add(prem.artifactId);

    if (hasValue) {
      db.prepare(
        `INSERT OR REPLACE INTO TelemetryMetric (variableName, value, unit, source, updatedAt)
         VALUES (?, ?, ?, ?, ?)`
      ).run(
        prem.variableName,
        strValue,
        prem.unit,
        params.source || "webhook-ingest",
        nowIso
      );
    }

    const numVal = Number(strValue);
    if (hasValue && !Number.isNaN(numVal)) {
      db.prepare(
        `INSERT INTO MetricSample (id, premiseId, variableName, value, source, recordedAt)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        `smp-${prem.id}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        prem.id,
        prem.variableName,
        numVal,
        params.source || "telemetry",
        nowIso
      );
    }

    const evalRes = evaluatePremiseState(
      strValue,
      prem.operator,
      prem.thresholdValue,
      prem.decayWarningMargin
    );

    const previousValue = prem.currentValue;
    const previousStatus = prem.status;

    db.prepare(
      `UPDATE Premise SET currentValue = ?, status = ?, valueSource = ?, valueObservedAt = ? WHERE id = ?`
    ).run(
      strValue,
      evalRes.status,
      hasValue ? params.source || "webhook-ingest" : null,
      hasValue ? params.observedAt || nowIso : null,
      prem.id
    );

    const latency = params.latencyMs ?? null;
    const rawResponseObj = params.rawPayload ?? {
      source: params.source || "telemetry-stream",
      evaluatedAt: nowIso,
      metrics: {
        [prem.variableName]: Number.isNaN(numVal) ? strValue : numVal,
      },
      evaluation: {
        operator: prem.operator,
        threshold: prem.thresholdValue,
        status: evalRes.status,
        driftPercent: evalRes.driftPercent,
      },
    };

    if (params.fromProbeId) {
      db.prepare(
        `UPDATE Probe
         SET lastRunAt = ?, lastLatencyMs = ?, lastRawResponse = ?, lastError = NULL
         WHERE id = ?`
      ).run(nowIso, latency, JSON.stringify(rawResponseObj, null, 2), params.fromProbeId);
    }

    if (evalRes.status === "BROKEN") {
      const artifactRow = db
        .prepare("SELECT * FROM DecisionArtifact WHERE id = ?")
        .get(prem.artifactId) as {
        id: string;
        title: string;
        type: string;
        targetLocus: string;
        blastRadius: string;
      };

      const downstreamRows = db
        .prepare("SELECT title, dependsOnIds FROM DecisionArtifact")
        .all() as Array<{ title: string; dependsOnIds?: string }>;
      const downstreamTitles = downstreamRows
        .filter((r) => parseDependsOnIds(r.dependsOnIds).includes(artifactRow.id))
        .map((r) => r.title);

      const remediationPlan = generateRemediationPlan({
        artifactId: artifactRow.id,
        artifactTitle: artifactRow.title,
        artifactType: artifactRow.type,
        targetLocus: artifactRow.targetLocus,
        blastRadius: artifactRow.blastRadius,
        premiseClaim: prem.claim,
        variableName: prem.variableName,
        unit: prem.unit,
        operator: prem.operator,
        thresholdValue: prem.thresholdValue,
        previousValue,
        breakingValue: strValue,
        downstreamCascadeTitles: downstreamTitles,
      });

      const existingEvent = db
        .prepare(
          "SELECT * FROM InvalidationEvent WHERE premiseId = ? AND id NOT LIKE 'inv-cascade-%' ORDER BY triggeredAt DESC LIMIT 1"
        )
        .get(prem.id) as { id: string; previousValue: string } | undefined;

      if (existingEvent && previousStatus === "BROKEN") {
        db.prepare(
          `UPDATE InvalidationEvent
           SET breakingValue = ?, thresholdValue = ?, remediationPlan = ?, triggeredAt = ?, acknowledged = 0
           WHERE id = ?`
        ).run(
          strValue,
          prem.thresholdValue,
          remediationPlan,
          nowIso,
          existingEvent.id
        );
      } else {
        const eventId = `inv-${prem.id}-${Date.now()}`;
        db.prepare(
          `INSERT INTO InvalidationEvent (id, premiseId, artifactId, previousValue, breakingValue, thresholdValue, remediationPlan, acknowledged, triggeredAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`
        ).run(
          eventId,
          prem.id,
          prem.artifactId,
          previousValue,
          strValue,
          prem.thresholdValue,
          remediationPlan,
          nowIso
        );
      }
    } else if (previousStatus === "BROKEN") {
      db.prepare(
        "DELETE FROM InvalidationEvent WHERE premiseId = ? AND id NOT LIKE 'inv-cascade-%' AND acknowledged = 0"
      ).run(prem.id);
    }
  }

  for (const artId of affectedArtifactIds) {
    const artRow = db
      .prepare("SELECT logicCombinator, status FROM DecisionArtifact WHERE id = ?")
      .get(artId) as { logicCombinator?: LogicCombinator; status?: string } | undefined;
    if (artRow?.status === "DEPRECATED_BY_PREMISE_ENGINE" || artRow?.status === "RETIRED") {
      continue;
    }
    const combinator: LogicCombinator = artRow?.logicCombinator || "ANY";

    const artPremises = db
      .prepare("SELECT status FROM Premise WHERE artifactId = ?")
      .all(artId) as Array<{ status: PremiseStatus }>;
    const nextArtStatus = computeArtifactStatus(
      artPremises.map((p) => p.status),
      combinator
    );
    db.prepare(
      "UPDATE DecisionArtifact SET status = ?, lastEvaluatedAt = ? WHERE id = ?"
    ).run(nextArtStatus, nowIso, artId);
  }

  // Propagate multi-hop cross-artifact cascades
  propagateCrossArtifactCascades(db);

  const allArtifacts = getAllArtifactsWithRelations();
  const updatedPremises = allArtifacts
    .flatMap((a) => a.premises)
    .filter((p) =>
      params.premiseId
        ? p.id === params.premiseId
        : p.variableName === params.variableName
    );

  for (const art of allArtifacts) {
    if (affectedArtifactIds.has(art.id) || art.cascadedFromId) {
      triggeredEvents.push(...art.invalidationEvents);
    }
  }

  return {
    updatedPremises,
    triggeredEvents,
    artifacts: allArtifacts,
  };
}

/**
 * Runs one HTTP_JSON_PATH probe against a real outside URL. On success the
 * premise gets the real value and its fetch time. On any failure the premise
 * keeps its last real value and the probe records the real error.
 */
async function runOutsideHttpProbe(
  probe: {
    id: string;
    premiseId: string;
    targetUrlOrQuery: string;
    jsonPath: string;
    valueMultiplier: number;
  },
  allowOutbound: boolean
): Promise<void> {
  const db = getDb();
  const url = probe.targetUrlOrQuery.trim();
  const runAt = new Date().toISOString();
  const recordError = (message: string, latencyMs: number | null) => {
    db.prepare(
      "UPDATE Probe SET lastRunAt = ?, lastLatencyMs = ?, lastError = ? WHERE id = ?"
    ).run(runAt, latencyMs, message, probe.id);
  };

  if (!allowOutbound && !isAllowedInPublicDemo(url)) {
    recordError(
      `Blocked in the public demo: outside fetches are off except the OpenRouter models list. Not fetched: ${url}`,
      null
    );
    return;
  }

  // CI reads a saved copy instead of the internet (PREMISE_FEED_FIXTURE_DIR)
  const fixtureDir = savedFeedDir();
  const res = fixtureDir ? loadSavedFeed(url, fixtureDir) : await fetchLiveJson(url);
  if (!res.ok) {
    recordError(res.error, res.latencyMs);
    return;
  }

  const found = extractJsonPath(res.json, probe.jsonPath);
  const num = typeof found === "number" ? found : typeof found === "string" ? Number(found) : NaN;
  if (found === undefined || found === null) {
    recordError(`Field not found: ${probe.jsonPath} in the response from ${url}`, res.latencyMs);
    return;
  }
  if (!Number.isFinite(num)) {
    recordError(
      `Field ${probe.jsonPath} is not a number (got ${JSON.stringify(found).slice(0, 80)})`,
      res.latencyMs
    );
    return;
  }

  const multiplier = Number(probe.valueMultiplier) || 1;
  // toPrecision keeps float noise (e.g. 1.9999999999999998) out of the stored value
  const value = Number((num * multiplier).toPrecision(12));
  evaluateAndPersistMetricUpdate({
    premiseId: probe.premiseId,
    value,
    source: fixtureDir ? savedSourceLabel(url) : liveSourceLabel(url),
    observedAt: res.fetchedAt,
    latencyMs: res.latencyMs,
    fromProbeId: probe.id,
    rawPayload: {
      url,
      fetchedAt: res.fetchedAt,
      servedFromCache: res.fromCache,
      ...(fixtureDir ? { savedCopy: true } : {}),
      jsonPath: probe.jsonPath,
      extracted: found,
      valueMultiplier: multiplier,
      value,
    },
  });
}

/**
 * Executes active Probes against the live telemetry store, read-only SQLite SQL_METRIC engine,
 * PromQL time-series evaluator, or remote HTTP endpoints.
 */
export async function executeActiveProbes(options?: {
  artifactId?: string;
  premiseId?: string;
  applyMicroDrift?: boolean;
}): Promise<{
  probesExecuted: number;
  artifacts: DecisionArtifactRecord[];
  invalidationEvents: InvalidationEventRecord[];
}> {
  const db = getDb();
  const liveSnapshot = getLiveTelemetrySnapshot();
  // Public demo: never call out to Prometheus, Datadog or arbitrary URLs.
  // Probes fall back to this visitor's own telemetry store instead.
  const allowOutbound = !isPublicDemo();

  const allSamples = db
    .prepare(
      "SELECT variableName, value FROM MetricSample ORDER BY recordedAt ASC"
    )
    .all() as Array<{ variableName: string; value: number }>;

  const samplesByMetric: Record<string, number[]> = {};
  for (const s of allSamples) {
    if (!samplesByMetric[s.variableName]) {
      samplesByMetric[s.variableName] = [];
    }
    samplesByMetric[s.variableName].push(Number(s.value));
  }

  const numericLiveValues: Record<string, number> = {};
  for (const [k, v] of Object.entries(liveSnapshot)) {
    const num = Number(v);
    if (!Number.isNaN(num)) {
      numericLiveValues[k] = num;
    }
  }

  // Suggested probes with no real source (status UNBOUND) never run
  let query = `
    SELECT pr.*, pm.variableName, pm.currentValue, pm.thresholdValue, pm.operator, pm.unit, pm.artifactId
    FROM Probe pr
    JOIN Premise pm ON pr.premiseId = pm.id
    WHERE pr.status != 'UNBOUND'
  `;
  const params: string[] = [];
  if (options?.premiseId) {
    query += " AND pr.premiseId = ?";
    params.push(options.premiseId);
  } else if (options?.artifactId) {
    query += " AND pm.artifactId = ?";
    params.push(options.artifactId);
  }

  const probes = db.prepare(query).all(...params) as Array<{
    id: string;
    premiseId: string;
    probeType: ProbeType;
    targetUrlOrQuery: string;
    jsonPath: string;
    pollingIntervalSeconds: number;
    valueMultiplier: number;
    variableName: string;
    currentValue: string;
    thresholdValue: string;
    operator: Operator;
    unit: string;
    artifactId: string;
  }>;

  let probesExecuted = 0;

  for (const probe of probes) {
    const startMs = Date.now();
    let extractedVal: string | number | undefined;
    let rawPayload: Record<string, unknown> | undefined;
    let valueSource: string | undefined;

    if (probe.probeType === "HTTP_JSON_PATH" && isOutsideUrl(probe.targetUrlOrQuery)) {
      await runOutsideHttpProbe(probe, allowOutbound);
      probesExecuted += 1;
      continue;
    }

    if (probe.probeType === "SQL_METRIC" && !options?.applyMicroDrift) {
      const sqlRes = executeReadOnlySqlMetricQuery(
        probe.targetUrlOrQuery,
        db as unknown as {
          prepare: (sql: string) => { all: (...args: unknown[]) => unknown[] };
        },
        probe.variableName
      );
      if (sqlRes.ok && sqlRes.value !== null) {
        extractedVal = sqlRes.value;
        rawPayload = {
          engine: "sqlite-wal-readonly",
          query: sqlRes.query,
          executedQuery: sqlRes.executedQuery,
          rowCount: sqlRes.rowCount,
          rows: sqlRes.rows,
          usedFallbackTable: sqlRes.usedFallbackTable,
          metrics: {
            [probe.variableName]: sqlRes.value,
          },
          value: sqlRes.value,
          evaluatedAt: new Date().toISOString(),
        };
      }
    } else if (probe.probeType === "PROMQL" && !options?.applyMicroDrift) {
      let promLiveSucceeded = false;
      const promSetting = allowOutbound ? getConnectorSetting("PROMETHEUS") : null;
      if (promSetting) {
        try {
          const promConfig = JSON.parse(promSetting.configJson) as PrometheusConfig;
          if (promConfig.baseUrl) {
            const liveRes = await queryPrometheusInstant(
              promConfig,
              probe.targetUrlOrQuery
            );
            if (liveRes.ok && liveRes.value !== null) {
              extractedVal = liveRes.value;
              promLiveSucceeded = true;
              valueSource = liveSourceLabel(promConfig.baseUrl);
              rawPayload = {
                engine: "prometheus-live-http",
                baseUrl: promConfig.baseUrl,
                authType: promConfig.authType,
                query: probe.targetUrlOrQuery,
                resultType: liveRes.resultType,
                labels: liveRes.metricLabels,
                value: liveRes.value,
                latencyMs: liveRes.latencyMs,
                metrics: {
                  [probe.variableName]: liveRes.value,
                },
                rawResponse: liveRes.rawResponse,
                evaluatedAt: new Date().toISOString(),
              };
            }
          }
        } catch {
          // Graceful fallback to local PromQL evaluator
        }
      }

      if (!promLiveSucceeded) {
        const promRes = evaluatePromQlExpression(probe.targetUrlOrQuery, {
          samplesByMetric,
          liveValues: numericLiveValues,
          fallbackMetricName: probe.variableName,
        });
        if (promRes.ok) {
          extractedVal = promRes.value;
          rawPayload = {
            engine: "promql-timeseries-evaluator",
            expression: promRes.expression,
            functionName: promRes.functionName,
            metricName: promRes.metricName,
            labels: promRes.labels,
            rangeWindow: promRes.rangeWindow,
            sampleCount: promRes.sampleCount,
            seriesWindow: promRes.seriesWindow,
            metrics: {
              [probe.variableName]: promRes.value,
            },
            value: promRes.value,
            evaluatedAt: new Date().toISOString(),
          };
        }
      }
    } else if (
      probe.probeType === "DATADOG_METRIC" &&
      !options?.applyMicroDrift
    ) {
      const ddSetting = allowOutbound ? getConnectorSetting("DATADOG") : null;
      if (ddSetting) {
        try {
          const ddConfig = JSON.parse(ddSetting.configJson) as DatadogConfig;
          if (ddConfig.apiKey) {
            const ddRes = await queryDatadogTimeseries(
              ddConfig,
              probe.targetUrlOrQuery
            );
            if (ddRes.ok && ddRes.latestValue !== null) {
              extractedVal = ddRes.latestValue;
              valueSource = liveSourceLabel(`https://api.${ddConfig.site || "datadoghq.com"}`);
              rawPayload = {
                engine: "datadog-metrics-v2-live",
                site: ddConfig.site || "datadoghq.com",
                query: probe.targetUrlOrQuery,
                value: ddRes.latestValue,
                latencyMs: ddRes.latencyMs,
                metricName: ddRes.metricName,
                unit: ddRes.unit,
                metrics: {
                  [probe.variableName]: ddRes.latestValue,
                },
                pointsCount: ddRes.points.length,
                rawResponse: ddRes.rawResponse,
                evaluatedAt: new Date().toISOString(),
              };
            }
          }
        } catch {
          // Fallback to local telemetry store
        }
      }
    }

    // The app's own demo feed: values come from this database, not the outside world
    if (extractedVal === undefined) {
      let currentVal =
        liveSnapshot[probe.variableName] ?? probe.currentValue;
      const numVal = Number(currentVal);

      if (
        options?.applyMicroDrift &&
        String(currentVal).trim() !== "" &&
        !Number.isNaN(numVal)
      ) {
        // Apply realistic micro-telemetry jitter (+/- 0.8%) for SSE live stream visualization
        const delta = numVal * (Math.random() * 0.014 - 0.007);
        const decimals =
          probe.unit === "%" || numVal < 10 ? 2 : numVal < 100 ? 1 : 0;
        currentVal = Number((numVal + delta).toFixed(decimals));
      }

      const finalNum = Number(currentVal);
      const simulatedJson = {
        source: probe.targetUrlOrQuery,
        probeType: probe.probeType,
        polledAt: new Date().toISOString(),
        metrics: {
          [probe.variableName]: Number.isNaN(finalNum) ? currentVal : finalNum,
        },
        value: Number.isNaN(finalNum) ? currentVal : finalNum,
      };
      rawPayload = simulatedJson;
      const viaPath = extractJsonPath(simulatedJson, probe.jsonPath);
      if (typeof viaPath === "number" || typeof viaPath === "string") {
        extractedVal = viaPath;
      } else {
        extractedVal = currentVal;
      }
    }

    if (extractedVal === undefined || String(extractedVal).trim() === "") {
      // Nothing to report (e.g. a premise with no value yet and no source)
      db.prepare("UPDATE Probe SET lastRunAt = ? WHERE id = ?").run(
        new Date().toISOString(),
        probe.id
      );
      probesExecuted += 1;
      continue;
    }

    evaluateAndPersistMetricUpdate({
      premiseId: probe.premiseId,
      value: extractedVal,
      source:
        valueSource ??
        (options?.applyMicroDrift ? "sse-autonomous-daemon" : `probe:${probe.probeType}`),
      latencyMs: Date.now() - startMs,
      rawPayload,
      fromProbeId: probe.id,
    });
    probesExecuted += 1;
  }

  return {
    probesExecuted,
    artifacts: getAllArtifactsWithRelations(),
    invalidationEvents: getAllInvalidationEvents(),
  };
}

/**
 * Persists a newly compiled DecisionArtifact along with its extracted Premises, Probes, and initial MetricSample series.
 */
export function insertCompiledArtifact(
  rawContent: string,
  compiled: CompiledArtifactOutput,
  customId?: string
): DecisionArtifactRecord {
  const db = getDb();
  const nowIso = new Date().toISOString();
  const artifactId =
    customId ||
    (compiled as any).artifact?.id ||
    (compiled as any).id ||
    `art-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const combinator: LogicCombinator = compiled.logicCombinator || "ANY";

  // A newly compiled premise has no value until a probe really reports one
  const artifactStatus = computeArtifactStatus(
    compiled.premises.map(() => "UNBOUND" as PremiseStatus),
    combinator
  );

  db.prepare(
    `INSERT INTO DecisionArtifact (id, title, type, rawContent, targetLocus, blastRadius, logicCombinator, dependsOnIds, cascadedFromId, monthlyCloudSpendUsd, maintenanceHoursPerMonth, realizedAnnualSavingsUsd, status, createdAt, lastEvaluatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 0, ?, ?, ?)`
  ).run(
    artifactId,
    compiled.title,
    compiled.type,
    rawContent,
    compiled.targetLocus,
    compiled.blastRadius,
    combinator,
    JSON.stringify(compiled.dependsOnIds || []),
    compiled.monthlyCloudSpendUsd || 0,
    compiled.maintenanceHoursPerMonth || 0,
    artifactStatus,
    nowIso,
    nowIso
  );

  for (let i = 0; i < compiled.premises.length; i++) {
    const p = compiled.premises[i];
    const premiseId = `prem-${Date.now()}-${i}-${Math.floor(Math.random() * 1000)}`;
    const probeId = `probe-${Date.now()}-${i}-${Math.floor(Math.random() * 1000)}`;

    db.prepare(
      `INSERT INTO Premise (id, artifactId, claim, variableName, unit, operator, thresholdValue, currentValue, decayWarningMargin, status, valueSource, valueObservedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, '', ?, 'UNBOUND', NULL, NULL)`
    ).run(
      premiseId,
      artifactId,
      p.claim,
      p.variableName,
      p.unit,
      p.operator,
      String(p.thresholdValue),
      p.decayWarningMargin
    );

    const target = (p.recommendedProbe.targetUrlOrQuery || "").trim();
    const probeStatus = target ? p.recommendedProbe.status ?? "UNBOUND" : "UNBOUND";
    db.prepare(
      `INSERT INTO Probe (id, premiseId, probeType, targetUrlOrQuery, jsonPath, pollingIntervalSeconds, valueMultiplier, status, lastRunAt, lastLatencyMs, lastRawResponse, lastError)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL)`
    ).run(
      probeId,
      premiseId,
      p.recommendedProbe.probeType,
      target,
      p.recommendedProbe.jsonPath || "$.value",
      p.recommendedProbe.pollingIntervalSeconds,
      p.recommendedProbe.valueMultiplier ?? 1,
      probeStatus
    );
  }

  propagateCrossArtifactCascades(db);
  const all = getAllArtifactsWithRelations();
  return all.find((a) => a.id === artifactId) ?? all[all.length - 1];
}

export function acknowledgeEvent(eventId: string): InvalidationEventRecord[] {
  const db = getDb();
  db.prepare(
    "UPDATE InvalidationEvent SET acknowledged = 1 WHERE id = ?"
  ).run(eventId);
  return getAllInvalidationEvents();
}

/**
 * Track 4: Dispatches an InvalidationEvent to GitHub PR / GitHub Issue / Slack Webhook / PagerDuty
 * and records the audit entry in OutboundDispatchLog.
 */
export async function dispatchInvalidationAlert(params: {
  eventId: string;
  channel: DispatchChannel;
  targetEndpoint?: string;
  repo?: string;
  branchName?: string;
  baseBranch?: string;
  githubToken?: string;
  dryRun?: boolean;
}): Promise<{
  dispatchLog: OutboundDispatchLogRecord;
  invalidationEvents: InvalidationEventRecord[];
  artifacts: DecisionArtifactRecord[];
  prResult?: GitHubPrResult;
}> {
  const db = getDb();
  const events = getAllInvalidationEvents();
  const ev = events.find((e) => e.id === params.eventId);
  if (!ev) {
    throw new Error(`InvalidationEvent ${params.eventId} not found`);
  }
  // Public demo never sends anything for real
  const dryRun = isPublicDemo() ? true : params.dryRun;

  const nowIso = new Date().toISOString();
  const dispatchId = `dsp-${Date.now()}-${Math.floor(Math.random() * 999)}`;

  let targetEndpoint = params.targetEndpoint || "";
  let summary = "";
  // Only set when something real exists at that address
  let externalUrl = "";
  let payloadPreview = "";
  let prResult: GitHubPrResult | undefined;
  // 0 means no outside service answered
  let responseStatus = 0;
  let deliveryStatus: DispatchStatus = "DRY_RUN";
  let errorMessage: string | null = null;

  if (params.channel === "GITHUB_PR") {
    const allArts = getAllArtifactsWithRelations();
    const art = allArts.find((a) => a.id === ev.artifactId) || null;
    prResult = await publishGitHubPullRequest({
      eventId: ev.id,
      event: ev,
      artifact: art,
      repo: params.repo,
      headBranch: params.branchName,
      baseBranch: params.baseBranch,
      githubToken: params.githubToken,
      dryRun,
    });

    targetEndpoint = prResult.targetEndpoint;
    deliveryStatus = prResult.status;
    errorMessage = prResult.error ?? null;
    if (prResult.status === "SENT") {
      summary = `Opened teardown PR #${prResult.prNumber}: ${prResult.title}`;
      externalUrl = prResult.prUrl ?? "";
      responseStatus = 201;
    } else if (prResult.status === "FAILED") {
      summary = `Failed: ${prResult.error}`;
    } else {
      summary = `Dry run: nothing was sent. ${prResult.dryRunReason ?? ""} PR drafted for branch ${prResult.branchName}: ${prResult.title}`.replace(/\s+/g, " ");
    }
    payloadPreview = JSON.stringify(
      {
        status: prResult.status,
        prNumber: prResult.prNumber,
        prUrl: prResult.prUrl,
        branchName: prResult.branchName,
        commitSha: prResult.commitSha,
        ghCliCommand: prResult.ghCliCommand,
        title: prResult.title,
        bodyMarkdown: prResult.bodyMarkdown,
      },
      null,
      2
    );
  } else if (params.channel === "GITHUB_ISSUE") {
    // Issue creation is not wired to GitHub yet: this is always a draft
    targetEndpoint = targetEndpoint || "https://api.github.com/repos/{owner}/{repo}/issues";
    summary = `Dry run: nothing was sent. Issue drafted: [PREMISE INVALIDATED] ${ev.artifactTitle}`;
    payloadPreview = JSON.stringify(
      {
        title: `[PREMISE KILL-SWITCH] ${ev.artifactTitle} (${ev.variableName} = ${ev.breakingValue})`,
        labels: ["premise-broken"],
        body: ev.remediationPlan,
      },
      null,
      2
    );
  } else if (params.channel === "SLACK_WEBHOOK") {
    const slackSetting = getConnectorSetting("SLACK");
    let webhookUrl = params.targetEndpoint || "";
    let defaultChannel = "#arch-decision-drift";
    let botUsername = "Premise Kill-Switch Bot";

    if (slackSetting) {
      try {
        const parsed = JSON.parse(slackSetting.configJson) as {
          webhookUrl?: string;
          defaultChannel?: string;
          botUsername?: string;
        };
        if (!webhookUrl && parsed.webhookUrl) webhookUrl = parsed.webhookUrl;
        if (parsed.defaultChannel) defaultChannel = parsed.defaultChannel;
        if (parsed.botUsername) botUsername = parsed.botUsername;
      } catch {
        // Fallback
      }
    }

    const slackResult = await dispatchSlackWebhookAlert({
      webhookUrl,
      event: ev,
      channel: defaultChannel,
      username: botUsername,
      dryRun,
    });

    targetEndpoint = slackResult.webhookUrl;
    deliveryStatus = slackResult.status;
    errorMessage = slackResult.error ?? null;
    summary =
      slackResult.status === "FAILED" ? `Failed: ${slackResult.error}` : slackResult.summary;
    payloadPreview = JSON.stringify(slackResult.payload, null, 2);
    responseStatus = slackResult.statusCode;
  } else {
    // PAGERDUTY_EVENT
    const pdSetting = getConnectorSetting("PAGERDUTY");
    let routingKey = params.targetEndpoint || "";
    let severity: "critical" | "error" | "warning" | "info" = "critical";
    let customEndpoint = "https://events.pagerduty.com/v2/enqueue";

    if (pdSetting) {
      try {
        const parsed = JSON.parse(pdSetting.configJson) as {
          routingKey?: string;
          severity?: "critical" | "error" | "warning" | "info";
          customEndpoint?: string;
        };
        if (!routingKey && parsed.routingKey) routingKey = parsed.routingKey;
        if (parsed.severity) severity = parsed.severity;
        if (parsed.customEndpoint) customEndpoint = parsed.customEndpoint;
      } catch {
        // Fallback
      }
    }

    const pdResult = await dispatchPagerDutyEvent({
      routingKey,
      event: ev,
      severity,
      customEndpoint,
      dryRun,
    });

    targetEndpoint = pdResult.targetEndpoint;
    deliveryStatus = pdResult.status;
    errorMessage = pdResult.error ?? null;
    summary =
      pdResult.status === "FAILED" ? `Failed: ${pdResult.error}` : pdResult.summary;
    payloadPreview = JSON.stringify(pdResult.payload, null, 2);
    responseStatus = pdResult.statusCode;
  }

  db.prepare(
    `INSERT INTO OutboundDispatchLog (id, eventId, artifactId, channel, targetEndpoint, summary, payloadPreview, responseStatus, externalUrl, dispatchedAt, deliveryStatus, errorMessage)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    dispatchId,
    ev.id,
    ev.artifactId,
    params.channel,
    targetEndpoint,
    summary,
    payloadPreview,
    responseStatus,
    externalUrl,
    nowIso,
    deliveryStatus,
    errorMessage
  );

  const dispatchLog: OutboundDispatchLogRecord = {
    id: dispatchId,
    eventId: ev.id,
    artifactId: ev.artifactId,
    channel: params.channel,
    targetEndpoint,
    summary,
    payloadPreview,
    responseStatus,
    externalUrl,
    dispatchedAt: nowIso,
    deliveryStatus,
    errorMessage,
  };

  return {
    dispatchLog,
    invalidationEvents: getAllInvalidationEvents(),
    artifacts: getAllArtifactsWithRelations(),
    prResult,
  };
}

/**
 * Checks whether a local workspace file has an active teardown patch backup in SQLite.
 */
export function getLocusBackupStatus(resolvedPath: string): {
  isPatched: boolean;
  patchedAt: string | null;
} {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT appliedAt FROM LocusBackup WHERE resolvedPath = ? LIMIT 1"
    )
    .get(resolvedPath) as { appliedAt: string } | undefined;

  return {
    isPatched: Boolean(row),
    patchedAt: row?.appliedAt || null,
  };
}

/**
 * Applies a teardown patch to a local workspace file and saves the original content in LocusBackup
 * so it can be rolled back losslessly with 1 click or via `premise check --rollback`.
 */
export function applyLocusPatchAndRecordBackup(params: {
  targetLocus: string;
  artifactId?: string;
  artifactTitle: string;
  variableName: string;
  operator: Operator;
  thresholdValue: string;
  breakingValue: string;
  unit: string;
  blastRadius: string;
  cascadedFromTitle?: string;
}) {
  const db = getDb();
  const nowIso = new Date().toISOString();

  // Check if a backup already exists for this file so we never overwrite the clean pre-patch originalContent
  const initialInspection = inspectLocalLocus(params.targetLocus);
  const existingBackup = db
    .prepare(
      "SELECT originalContent FROM LocusBackup WHERE resolvedPath = ? LIMIT 1"
    )
    .get(initialInspection.resolvedPath) as
    | { originalContent: string }
    | undefined;

  // If already patched, restore original first before re-applying so line numbers align with original locus
  if (existingBackup) {
    writeExactFileContentToLocus(
      params.targetLocus,
      initialInspection.resolvedPath,
      existingBackup.originalContent
    );
  }

  const res = applyTeardownPatchToLocalFile(params);
  if (!res.ok) {
    return res;
  }

  const cleanOriginal = existingBackup
    ? existingBackup.originalContent
    : res.originalContent;

  db.prepare(
    `INSERT OR REPLACE INTO LocusBackup (resolvedPath, rawLocus, artifactId, originalContent, patchedContent, appliedAt)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    res.resolvedPath,
    params.targetLocus,
    params.artifactId || null,
    cleanOriginal,
    res.patchedContent,
    nowIso
  );

  // Compute and record realized annual savings
  if (params.artifactId) {
    const art = db
      .prepare(
        "SELECT monthlyCloudSpendUsd, maintenanceHoursPerMonth FROM DecisionArtifact WHERE id = ?"
      )
      .get(params.artifactId) as
      | { monthlyCloudSpendUsd: number; maintenanceHoursPerMonth: number }
      | undefined;
    if (art) {
      const annualSpend = Number(art.monthlyCloudSpendUsd || 0) * 12;
      const annualEng =
        Number(art.maintenanceHoursPerMonth || 0) * 12 * 150;
      const totalSavings = annualSpend + annualEng;
      db.prepare(
        "UPDATE DecisionArtifact SET realizedAnnualSavingsUsd = ? WHERE id = ?"
      ).run(totalSavings, params.artifactId);
      db.prepare(
        "UPDATE InvalidationEvent SET realizedAnnualSavingsUsd = ? WHERE artifactId = ?"
      ).run(totalSavings, params.artifactId);
    }
  }

  return {
    ...res,
    inspection: {
      ...res.inspection,
      isPatched: true,
      patchedAt: nowIso,
    },
  };
}

/**
 * Rolls back a patched workspace file to its original content stored in LocusBackup.
 */
export function rollbackLocusPatchFromBackup(targetLocus: string) {
  const db = getDb();
  const currentInspection = inspectLocalLocus(targetLocus);
  const backup = db
    .prepare(
      "SELECT resolvedPath, rawLocus, originalContent FROM LocusBackup WHERE resolvedPath = ? OR rawLocus = ? LIMIT 1"
    )
    .get(currentInspection.resolvedPath, targetLocus) as
    | { resolvedPath: string; rawLocus: string; originalContent: string }
    | undefined;

  if (!backup) {
    return {
      ok: false,
      resolvedPath: currentInspection.resolvedPath,
      inspection: currentInspection,
      error: `No active teardown patch backup found for ${targetLocus}`,
    };
  }

  const restoreRes = writeExactFileContentToLocus(
    targetLocus,
    backup.resolvedPath,
    backup.originalContent
  );

  if (restoreRes.ok) {
    db.prepare("DELETE FROM LocusBackup WHERE resolvedPath = ?").run(
      backup.resolvedPath
    );
  }

  return {
    ok: restoreRes.ok,
    resolvedPath: backup.resolvedPath,
    inspection: {
      ...restoreRes.inspection,
      isPatched: false,
      patchedAt: null,
    },
    error: restoreRes.error,
  };
}

/**
 * Rolls back all patched workspace files tracked in LocusBackup.
 */
export function rollbackAllPatchedLoci(): string[] {
  const db = getDb();
  const backups = db
    .prepare("SELECT resolvedPath, rawLocus, originalContent FROM LocusBackup")
    .all() as Array<{
    resolvedPath: string;
    rawLocus: string;
    originalContent: string;
  }>;

  const restoredPaths: string[] = [];
  for (const b of backups) {
    const res = writeExactFileContentToLocus(
      b.rawLocus,
      b.resolvedPath,
      b.originalContent
    );
    if (res.ok) {
      restoredPaths.push(b.resolvedPath);
    }
  }
  db.exec("DELETE FROM LocusBackup;");
  return restoredPaths;
}

// ============================================================================
// Horizon D: Production Telemetry & Outbound Dispatch Credential Store
// ============================================================================

function maskSecretString(val?: unknown): string {
  if (typeof val !== "string" || !val.trim()) return "";
  const trimmed = val.trim();
  if (trimmed.length <= 6) return "******";
  return `****${trimmed.slice(-4)}`;
}

export function getConnectorSetting(
  connectorType: ConnectorType
): ConnectorSettingRecord | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM ConnectorSetting WHERE id = ? LIMIT 1")
    .get(connectorType) as unknown as ConnectorSettingRecord | undefined;
  return row || null;
}

export function getAllConnectorSettings(): ConnectorSettingRecord[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM ConnectorSetting ORDER BY id ASC")
    .all() as unknown as ConnectorSettingRecord[];
  return rows;
}

export function saveConnectorSetting(
  connectorType: ConnectorType,
  incomingConfig: Record<string, unknown>
): ConnectorSettingRecord {
  const db = getDb();
  const nowIso = new Date().toISOString();
  const existing = getConnectorSetting(connectorType);

  let mergedConfig: Record<string, unknown> = { ...incomingConfig };

  if (existing) {
    try {
      const oldConfig = JSON.parse(existing.configJson) as Record<string, unknown>;
      // Preserve existing secret values if incoming is masked or blank
      for (const [key, oldVal] of Object.entries(oldConfig)) {
        const newVal = incomingConfig[key];
        const isSecretField =
          key.toLowerCase().includes("key") ||
          key.toLowerCase().includes("token") ||
          key.toLowerCase().includes("password") ||
          key.toLowerCase().includes("webhookurl") ||
          key.toLowerCase().includes("routing");

        if (
          isSecretField &&
          (newVal === undefined ||
            newVal === "" ||
            (typeof newVal === "string" && newVal.startsWith("****")))
        ) {
          mergedConfig[key] = oldVal;
        }
      }
    } catch {
      // Use incomingConfig directly
    }
  }

  const jsonStr = JSON.stringify(mergedConfig);

  db.prepare(
    `INSERT OR REPLACE INTO ConnectorSetting (id, connectorType, configJson, updatedAt)
     VALUES (?, ?, ?, ?)`
  ).run(connectorType, connectorType, jsonStr, nowIso);

  return {
    id: connectorType,
    connectorType,
    configJson: jsonStr,
    updatedAt: nowIso,
  };
}

export function deleteConnectorSetting(connectorType: ConnectorType): boolean {
  const db = getDb();
  const res = db
    .prepare("DELETE FROM ConnectorSetting WHERE id = ?")
    .run(connectorType);
  return Number(res.changes) > 0;
}

// Example connector entries shown in the public demo; never configured or used
const DEMO_PLACEHOLDER_CONNECTORS: Record<
  ConnectorType,
  { summary: string; maskedConfig: Record<string, unknown> }
> = {
  PROMETHEUS: {
    summary: "Demo placeholder: thanos-querier.example.internal",
    maskedConfig: {
      baseUrl: "https://thanos-querier.example.internal",
      authType: "bearer",
      bearerToken: "****demo",
      username: "",
      password: "",
      customHeaders: { "THANOS-TENANT-ID": "demo" },
    },
  },
  DATADOG: {
    summary: "Demo placeholder: api.datadoghq.com",
    maskedConfig: { site: "datadoghq.com", apiKey: "****demo", appKey: "****demo" },
  },
  SLACK: {
    summary: "Demo placeholder: #arch-decision-drift",
    maskedConfig: {
      webhookUrl: "****demo",
      defaultChannel: "#arch-decision-drift",
      botUsername: "Premise Kill-Switch Bot",
    },
  },
  PAGERDUTY: {
    summary: "Demo placeholder: routing key",
    maskedConfig: { routingKey: "****demo", severity: "critical" },
  },
};

export function getMaskedConnectorSettings(): ConnectorMaskedSetting[] {
  if (isPublicDemo()) {
    return (Object.keys(DEMO_PLACEHOLDER_CONNECTORS) as ConnectorType[]).map(
      (type) => ({
        id: type,
        connectorType: type,
        isConfigured: false,
        isDemoPlaceholder: true,
        summary: DEMO_PLACEHOLDER_CONNECTORS[type].summary,
        maskedConfig: DEMO_PLACEHOLDER_CONNECTORS[type].maskedConfig,
        updatedAt: "",
      })
    );
  }

  const allSaved = getAllConnectorSettings();
  const savedMap = new Map(allSaved.map((s) => [s.id, s]));

  const supportedTypes: ConnectorType[] = [
    "PROMETHEUS",
    "DATADOG",
    "SLACK",
    "PAGERDUTY",
  ];

  return supportedTypes.map((type) => {
    const record = savedMap.get(type);
    if (!record) {
      return {
        id: type,
        connectorType: type,
        isConfigured: false,
        summary: "Not configured",
        maskedConfig: {},
        updatedAt: "",
      };
    }

    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(record.configJson);
    } catch {
      parsed = {};
    }

    const masked: Record<string, unknown> = {};
    let summary = "Configured";

    if (type === "PROMETHEUS") {
      const baseUrl = (parsed.baseUrl as string) || "http://localhost:9090";
      const authType = (parsed.authType as string) || "none";
      masked.baseUrl = baseUrl;
      masked.authType = authType;
      masked.bearerToken = maskSecretString(parsed.bearerToken);
      masked.username = parsed.username || "";
      masked.password = maskSecretString(parsed.password);
      masked.customHeaders = parsed.customHeaders || {};
      summary = `${baseUrl} (${authType.toUpperCase()})`;
    } else if (type === "DATADOG") {
      const site = (parsed.site as string) || "datadoghq.com";
      masked.site = site;
      masked.apiKey = maskSecretString(parsed.apiKey);
      masked.appKey = maskSecretString(parsed.appKey);
      summary = `api.${site}`;
    } else if (type === "SLACK") {
      const url = (parsed.webhookUrl as string) || "";
      const channel = (parsed.defaultChannel as string) || "#arch-decision-drift";
      masked.webhookUrl = maskSecretString(url);
      masked.defaultChannel = channel;
      masked.botUsername = (parsed.botUsername as string) || "Premise Kill-Switch Bot";
      summary = channel;
    } else if (type === "PAGERDUTY") {
      const routingKey = (parsed.routingKey as string) || "";
      const severity = (parsed.severity as string) || "critical";
      masked.routingKey = maskSecretString(routingKey);
      masked.severity = severity;
      summary = `Routing Key (${severity.toUpperCase()})`;
    }

    return {
      id: type,
      connectorType: type,
      isConfigured: true,
      summary,
      maskedConfig: masked,
      updatedAt: record.updatedAt,
    };
  });
}

/**
 * Returns portfolio-wide FinOps Ledger Drag & Balance Sheet Summary.
 */
export function getFinOpsLedger(
  options?: FinOpsOptions
): FinOpsLedgerSummary {
  const db = getDb();
  const artifacts = getAllArtifactsWithRelations();
  const events = getAllInvalidationEvents();
  const backups = db
    .prepare("SELECT rawLocus, resolvedPath FROM LocusBackup")
    .all() as Array<{ rawLocus: string; resolvedPath: string }>;

  const patchedSet = new Set<string>();
  for (const b of backups) {
    if (b.rawLocus) patchedSet.add(b.rawLocus);
    if (b.resolvedPath) patchedSet.add(b.resolvedPath);
  }

  return calculateFinOpsLedger(artifacts, events, options, patchedSet);
}


