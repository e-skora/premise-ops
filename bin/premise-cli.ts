#!/usr/bin/env bun
import { compareBrokenToExpected, decideCheckExit } from "../src/lib/expected-outcome";
import {
  applyLocusPatchAndRecordBackup,
  dispatchInvalidationAlert,
  evaluateAndPersistMetricUpdate,
  executeActiveProbes,
  getAllArtifactsWithRelations,
  getAllInvalidationEvents,
  insertCompiledArtifact,
  resetDatabaseToSeed,
  rollbackAllPatchedLoci,
} from "../src/db";
import {
  computeDriftForecast,
  evaluatePremiseState,
} from "../src/lib/evaluator";
import { inspectLocalLocus } from "../src/lib/locus-inspector";
import {
  convertDiscoveredToCompiledOutput,
  scanWorkspaceForPremises,
} from "../src/lib/codebase-scanner";
import { OPERATOR_SYMBOLS, BacktestOptions, FinOpsLedgerSummary } from "../src/lib/types";
import {
  runBacktestSimulation,
  SCENARIO_PRESETS,
} from "../src/lib/backtest-engine";
import {
  convertInboxItemToCompiledArtifact,
  scanRepositoryTarget,
} from "../src/lib/repo-scanner";
import { calculateFinOpsLedger, formatUsd } from "../src/lib/finops-engine";


const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  emerald: "\x1b[38;5;48m",
  amber: "\x1b[38;5;214m",
  rose: "\x1b[38;5;203m",
  sky: "\x1b[38;5;117m",
  zinc: "\x1b[38;5;245m",
  white: "\x1b[38;5;255m",
  bgRose: "\x1b[48;5;52m",
  bgEmerald: "\x1b[48;5;22m",
  bgAmber: "\x1b[48;5;58m",
};

function stripAnsi(input: string = ""): string {
  return String(input ?? "").replace(/\x1b\[[0-9;]*m/g, "");
}

function padCell(
  text: string,
  width: number,
  align: "left" | "right" = "left"
): string {
  const visibleLen = stripAnsi(text).length;
  if (visibleLen > width) {
    const plain = stripAnsi(text);
    return plain.slice(0, Math.max(0, width - 1)) + "…";
  }
  const pad = " ".repeat(width - visibleLen);
  return align === "right" ? pad + text : text + pad;
}

function formatStatusBadge(status: string): string {
  switch (status) {
    case "VALID":
    case "HEALTHY":
    case "MONITORED":
      return `${ANSI.emerald}${ANSI.bold}● ${status}${ANSI.reset}`;
    case "DECAYING":
    case "AT_RISK":
    case "UNTRACKED":
      return `${ANSI.amber}${ANSI.bold}▲ ${status}${ANSI.reset}`;
    case "BROKEN":
    case "INVALIDATED":
      return `${ANSI.rose}${ANSI.bold}✖ ${status}${ANSI.reset}`;
    case "NO_DATA":
    case "UNBOUND":
      return `${ANSI.zinc}${ANSI.bold}○ ${status === "NO_DATA" ? "NO DATA" : status}${ANSI.reset}`;
    default:
      return `${ANSI.zinc}${status}${ANSI.reset}`;
  }
}

function printFinOpsTable(ledger: FinOpsLedgerSummary) {
  console.log("");
  console.log(
    `${ANSI.bold}${ANSI.white}╔══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╗${ANSI.reset}`
  );
  console.log(
    `${ANSI.bold}${ANSI.white}║  ARCHITECTURE BALANCE SHEET // REAL-TIME FINOPS DRAG LEDGER (HORIZON E)                                                      ║${ANSI.reset}`
  );
  console.log(
    `${ANSI.bold}${ANSI.white}╚══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╝${ANSI.reset}`
  );

  console.log(
    `\n  ${ANSI.bold}Active Monthly Drag:${ANSI.reset}     ${ANSI.rose}${ANSI.bold}${formatUsd(
      ledger.totalActiveDragMonthlyUsd
    )}/mo${ANSI.reset} (${formatUsd(
      ledger.totalActiveDragDailyUsd
    )}/day) [Engineering Drag: ${ledger.wastedEngHoursPerMonth} hrs/mo]`
  );
  console.log(
    `  ${ANSI.bold}Realized Annual Savings:${ANSI.reset} ${ANSI.emerald}${ANSI.bold}${formatUsd(
      ledger.cumulativeAnnualSavingsUsd
    )}/yr${ANSI.reset} (Waste Eliminated via Teardowns)`
  );
  console.log(
    `  ${ANSI.bold}Breached Decisions:${ANSI.reset}      ${
      ledger.invalidatedDecisionsCount > 0
        ? `${ANSI.rose}${ledger.invalidatedDecisionsCount} Breached${ANSI.reset}`
        : `${ANSI.emerald}0 Breached${ANSI.reset}`
    } | ${ANSI.amber}${ledger.decayingDecisionsCount} Decaying${ANSI.reset}`
  );

  const cols = {
    artifact: 30,
    status: 14,
    monthly: 14,
    maint: 12,
    drag: 16,
    savings: 16,
    locus: 30,
  };

  const sepLine =
    "─".repeat(cols.artifact + 2) +
    "┼" +
    "─".repeat(cols.status + 2) +
    "┼" +
    "─".repeat(cols.monthly + 2) +
    "┼" +
    "─".repeat(cols.maint + 2) +
    "┼" +
    "─".repeat(cols.drag + 2) +
    "┼" +
    "─".repeat(cols.savings + 2) +
    "┼" +
    "─".repeat(cols.locus + 2);

  console.log(
    `\n ${padCell(`${ANSI.bold}DECISION ARTIFACT${ANSI.reset}`, cols.artifact)} │ ${padCell(
      `${ANSI.bold}STATUS${ANSI.reset}`,
      cols.status
    )} │ ${padCell(`${ANSI.bold}CLOUD SPEND${ANSI.reset}`, cols.monthly, "right")} │ ${padCell(
      `${ANSI.bold}MAINT HRS${ANSI.reset}`,
      cols.maint,
      "right"
    )} │ ${padCell(`${ANSI.bold}DRAG ($/DAY)${ANSI.reset}`, cols.drag, "right")} │ ${padCell(
      `${ANSI.bold}SAVINGS ($/YR)${ANSI.reset}`,
      cols.savings,
      "right"
    )} │ ${padCell(`${ANSI.bold}TARGET LOCUS${ANSI.reset}`, cols.locus)}`
  );
  console.log(`─${sepLine}`);

  for (const item of ledger.artifacts) {
    const statusBadge = formatStatusBadge(item.status);
    const dragText =
      item.dailyDragUsd > 0
        ? `${ANSI.rose}${formatUsd(item.dailyDragUsd)}/d${ANSI.reset}`
        : `${ANSI.dim}$0/d${ANSI.reset}`;
    const savingsText =
      item.realizedAnnualSavingsUsd > 0
        ? `${ANSI.emerald}${formatUsd(item.realizedAnnualSavingsUsd)}/yr${ANSI.reset}`
        : `${ANSI.dim}$0/yr${ANSI.reset}`;

    console.log(
      ` ${padCell(`${ANSI.bold}${item.title}${ANSI.reset}`, cols.artifact)} │ ${padCell(
        statusBadge,
        cols.status
      )} │ ${padCell(
        formatUsd(item.monthlyCloudSpendUsd) + "/mo",
        cols.monthly,
        "right"
      )} │ ${padCell(
        item.maintenanceHoursPerMonth + " hrs",
        cols.maint,
        "right"
      )} │ ${padCell(dragText, cols.drag, "right")} │ ${padCell(
        savingsText,
        cols.savings,
        "right"
      )} │ ${padCell(item.targetLocus || "", cols.locus)}`
    );
  }
}

function printHelp() {
  console.log(`
${ANSI.bold}${ANSI.emerald}PREMISEOPS CLI v3.0${ANSI.reset} — Executable CI/CD Runner & Codebase Scanner for Architectural Decisions

${ANSI.bold}USAGE:${ANSI.reset}
  bun ./bin/premise-cli.ts check [options]
  bun ./bin/premise-cli.ts scan [--repo [target]] [--import] [--json]
  bun ./bin/premise-cli.ts backtest [--scenario <name>] [--steps <n>] [--shock <pct>] [--noise <pct>] [--json]

${ANSI.bold}COMMANDS:${ANSI.reset}
  check                            Run probes, then evaluate all load-bearing premises (ADR-014's OpenRouter price is the one live demo source; other seeded premises use demo data)
  scan                             Scan workspace files, markdown ADRs, and package manifests for architectural assumptions
  backtest, replay                 Run historical drift backtesting & scenario stress-testing across decision portfolio

${ANSI.bold}SCENARIO PRESETS:${ANSI.reset}
  price-war                        Frontier LLM token price war (-60% step drops)
  latency-spike                    Black Friday peak latency surge (+65% P95 TTFT)
  vendor-outage                    Webhook provider SLA recovery (> 99.9% invalidates queue)
  redis-drain                      FinOps vector cache memory depletion (-30% utilization)
  cac-surge                        GTM outbound auction inflation (+35% CAC surge)
  historical                       Replay recorded SQLite MetricSample database series
  custom                           Custom parameterized drift & volatility shock

${ANSI.bold}OPTIONS:${ANSI.reset}
  --scenario <name>                Select backtest scenario preset (default: price-war)
  --steps <n>                      Number of simulation replay steps (default: 20)
  --shock <percent>                Synthetic shock magnitude percentage (e.g., -60, +40)
  --noise <percent>                Volatility jitter noise percentage (default: 3-5%)
  --strict                         Exit with code 1 on DECAYING / AT_RISK warnings as well as BROKEN premises
  --finops                         Display Architecture Balance Sheet & Inefficiency Drag Ledger
  --no-poll                        Skip live probe execution before evaluating assertions
  --expect-broken <ids>            Comma-separated premise ids or variable names known to be BROKEN; check passes only if exactly these are broken
  --artifact <id>                  Filter check or backtest to a single DecisionArtifact ID (e.g., art-adr-014)
  --premise <id>                   Filter backtest to a single Premise ID
  --simulate-breach <varOrPremId>  Inject a synthetic threshold breach for a premise/variable to test CI failure & cascade
  --mutate <variable>=<value>      Mutate a telemetry variable before running assertions (e.g., upstream_llm_input_cost_usd=1.40)
  --apply                          Apply generated teardown patches directly to local workspace files for INVALIDATED decisions
  --rollback                       Restore any patched workspace files from SQLite LocusBackup snapshots
  --create-pr, --pr                Draft a teardown PR for INVALIDATED decisions; opens it on GitHub only when GITHUB_TOKEN is set
  --branch <name>                  Custom branch name for teardown PR (default: premise/teardown-<artifactId>)
  --repo <owner/repo>              Target GitHub repository (default: org/core-monorepo)
  --import                         (With 'scan') Automatically compile & import all untracked codebase premises into ./premise.db
  --reset                          Reset ./premise.db & restore any patched files to initial seed state
  --json                           Emit machine-readable JSON output for CI/CD artifacts
  -h, --help                       Show this help message
`);
}

async function runScanCommand(args: string[]) {
  const isJson = args.includes("--json");
  const shouldImport = args.includes("--import");
  const isRepoScan =
    args.includes("--repo") || args.includes("--inbox") || args.includes("--all");

  const getArgValue = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    if (idx !== -1 && idx + 1 < args.length && !args[idx + 1].startsWith("-")) {
      return args[idx + 1];
    }
    return undefined;
  };

  const targetRepo = getArgValue("--repo") || "github.com/company/core-monorepo";
  const existing = getAllArtifactsWithRelations();
  const importedTitles: string[] = [];

  if (isRepoScan) {
    const repoResult = scanRepositoryTarget(targetRepo, existing);

    if (shouldImport) {
      for (const item of repoResult.discovered) {
        if (!item.alreadyMonitored) {
          const { rawContent, compiled } =
            convertInboxItemToCompiledArtifact(item);
          const inserted = insertCompiledArtifact(rawContent, compiled);
          importedTitles.push(inserted.title);
          try {
            await executeActiveProbes({ artifactId: inserted.id });
          } catch {
            // graceful probe execution
          }
        }
      }
    }

    const finalResult = shouldImport
      ? scanRepositoryTarget(targetRepo, getAllArtifactsWithRelations())
      : repoResult;

    if (isJson) {
      console.log(
        JSON.stringify(
          {
            timestamp: new Date().toISOString(),
            targetRepo,
            importedCount: importedTitles.length,
            importedTitles,
            ...finalResult,
          },
          null,
          2
        )
      );
      process.exit(0);
    }

    console.log("");
    console.log(
      `${ANSI.bold}${ANSI.white}╔══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╗${ANSI.reset}`
    );
    console.log(
      `${ANSI.bold}${ANSI.white}║  PREMISEOPS GITHUB REPOSITORY SCANNER // ADR & DEPENDENCY MANIFEST AUTO-EXTRACTOR                                             ║${ANSI.reset}`
    );
    console.log(
      `${ANSI.bold}${ANSI.white}╚══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╝${ANSI.reset}`
    );

    console.log(
      `\n${ANSI.bold}TARGET REPO:${ANSI.reset} ${ANSI.sky}${targetRepo}${ANSI.reset} (${finalResult.target.adrCount} ADR files, ${finalResult.target.manifestCount} manifests)`
    );

    if (importedTitles.length > 0) {
      console.log(
        `\n${ANSI.emerald}${ANSI.bold}✔ Imported & Spun Up Live Probes for ${importedTitles.length} premise(s) into ./premise.db:${ANSI.reset} ${importedTitles.join(", ")}`
      );
    }

    const cols = {
      state: 14,
      source: 14,
      locus: 46,
      title: 34,
      bound: 24,
      probe: 14,
    };

    const sep =
      "─".repeat(cols.state + 2) +
      "┼" +
      "─".repeat(cols.source + 2) +
      "┼" +
      "─".repeat(cols.locus + 2) +
      "┼" +
      "─".repeat(cols.title + 2) +
      "┼" +
      "─".repeat(cols.bound + 2) +
      "┼" +
      "─".repeat(cols.probe + 2);

    console.log(
      `\n ${padCell(`${ANSI.bold}INBOX STATUS${ANSI.reset}`, cols.state)} │ ${padCell(
        `${ANSI.bold}SOURCE${ANSI.reset}`,
        cols.source
      )} │ ${padCell(
        `${ANSI.bold}SOURCE / LOCUS${ANSI.reset}`,
        cols.locus
      )} │ ${padCell(`${ANSI.bold}DECISION / PACKAGE${ANSI.reset}`, cols.title)} │ ${padCell(
        `${ANSI.bold}EXTRACTED BOUND${ANSI.reset}`,
        cols.bound
      )} │ ${padCell(`${ANSI.bold}PROBE ENGINE${ANSI.reset}`, cols.probe)}`
    );
    console.log(`─${sep}`);

    for (const item of finalResult.discovered) {
      const stateLabel = item.alreadyMonitored ? "MONITORED" : "UNTRACKED";
      const opSym = OPERATOR_SYMBOLS[item.operator] || item.operator;
      const boundStr = `${item.variableName} ${opSym} ${item.thresholdValue}`;
      const sourceBadge =
        item.sourceType === "ADR_FOLDER"
          ? `${ANSI.sky}ADR_DOC${ANSI.reset}`
          : item.sourceType === "DEPENDENCY_MANIFEST"
          ? `${ANSI.amber}MANIFEST${ANSI.reset}`
          : `${ANSI.dim}INLINE${ANSI.reset}`;

      console.log(
        ` ${padCell(formatStatusBadge(stateLabel), cols.state)} │ ${padCell(
          sourceBadge,
          cols.source
        )} │ ${padCell(
          `${ANSI.zinc}${item.sourceFile}${ANSI.reset}`,
          cols.locus
        )} │ ${padCell(item.title, cols.title)} │ ${padCell(
          boundStr,
          cols.bound
        )} │ ${padCell(`${ANSI.emerald}${item.probeType}${ANSI.reset}`, cols.probe)}`
      );
    }
    console.log(`─${sep}`);

    console.log(
      `\n${ANSI.bold}SCAN INBOX SUMMARY:${ANSI.reset} Scanned ${finalResult.target.adrCount} ADRs & ${finalResult.target.manifestCount} Manifests | ` +
        `${finalResult.discovered.length} Findings | ` +
        `${ANSI.emerald}${finalResult.discovered.length - finalResult.pendingInboxCount} Monitored${ANSI.reset} | ` +
        `${ANSI.amber}${finalResult.pendingInboxCount} Untracked In Inbox${ANSI.reset}\n`
    );
    process.exit(0);
  }

  const scanRes = scanWorkspaceForPremises(existing);

  if (shouldImport) {
    for (const item of scanRes.discovered) {
      if (!item.alreadyMonitored) {
        const { rawContent, compiled } = convertDiscoveredToCompiledOutput(item);
        const inserted = insertCompiledArtifact(rawContent, compiled);
        importedTitles.push(inserted.title);
      }
    }
  }

  const finalScan = shouldImport
    ? scanWorkspaceForPremises(getAllArtifactsWithRelations())
    : scanRes;

  if (isJson) {
    console.log(
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          importedCount: importedTitles.length,
          importedTitles,
          ...finalScan,
        },
        null,
        2
      )
    );
    process.exit(0);
  }

  console.log("");
  console.log(
    `${ANSI.bold}${ANSI.white}╔══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╗${ANSI.reset}`
  );
  console.log(
    `${ANSI.bold}${ANSI.white}║  PREMISEOPS CODEBASE ASSUMPTION SCANNER // @premise & @premise-locus DISCOVERY                                               ║${ANSI.reset}`
  );
  console.log(
    `${ANSI.bold}${ANSI.white}╚══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╝${ANSI.reset}`
  );

  if (importedTitles.length > 0) {
    console.log(
      `\n${ANSI.emerald}${ANSI.bold}✔ Imported ${importedTitles.length} untracked codebase assumption(s) into ./premise.db:${ANSI.reset} ${importedTitles.join(", ")}`
    );
  }

  const cols = {
    state: 14,
    locus: 48,
    title: 34,
    bound: 24,
    probe: 14,
  };

  const sep =
    "─".repeat(cols.state + 2) +
    "┼" +
    "─".repeat(cols.locus + 2) +
    "┼" +
    "─".repeat(cols.title + 2) +
    "┼" +
    "─".repeat(cols.bound + 2) +
    "┼" +
    "─".repeat(cols.probe + 2);

  console.log(
    `\n ${padCell(`${ANSI.bold}TRACKING${ANSI.reset}`, cols.state)} │ ${padCell(
      `${ANSI.bold}WORKSPACE LOCUS${ANSI.reset}`,
      cols.locus
    )} │ ${padCell(`${ANSI.bold}DECISION TITLE${ANSI.reset}`, cols.title)} │ ${padCell(
      `${ANSI.bold}EXTRACTED BOUND${ANSI.reset}`,
      cols.bound
    )} │ ${padCell(`${ANSI.bold}PROBE ENGINE${ANSI.reset}`, cols.probe)}`
  );
  console.log(`─${sep}`);

  for (const item of finalScan.discovered) {
    const stateLabel = item.alreadyMonitored ? "MONITORED" : "UNTRACKED";
    const opSym = OPERATOR_SYMBOLS[item.operator] || item.operator;
    const boundStr = `${item.variableName} ${opSym} ${item.thresholdValue}`;
    console.log(
      ` ${padCell(formatStatusBadge(stateLabel), cols.state)} │ ${padCell(
        `${ANSI.sky}${item.targetLocus}${ANSI.reset}`,
        cols.locus
      )} │ ${padCell(item.title, cols.title)} │ ${padCell(
        boundStr,
        cols.bound
      )} │ ${padCell(`${ANSI.emerald}${item.probeType}${ANSI.reset}`, cols.probe)}`
    );
  }
  console.log(`─${sep}`);

  const untrackedCount = finalScan.discovered.filter(
    (d) => !d.alreadyMonitored
  ).length;
  console.log(
    `\n${ANSI.bold}SCAN SUMMARY:${ANSI.reset} Scanned ${finalScan.totalFilesScanned} files across [${finalScan.scannedDirectories.join(", ")}] | ` +
      `${finalScan.discovered.length} Discovered | ` +
      `${ANSI.emerald}${finalScan.discovered.length - untrackedCount} Monitored${ANSI.reset} | ` +
      `${ANSI.amber}${untrackedCount} Untracked${ANSI.reset}\n`
  );
  process.exit(0);
}

async function runBacktestCommand(args: string[]) {
  const isJson = args.includes("--json");

  const getArgValue = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    if (idx !== -1 && idx + 1 < args.length) {
      return args[idx + 1];
    }
    return undefined;
  };

  const scenarioId = getArgValue("--scenario") || "price-war";
  const artifactFilter = getArgValue("--artifact");
  const premiseFilter = getArgValue("--premise");
  const rawSteps = getArgValue("--steps");
  const rawShock = getArgValue("--shock");
  const rawNoise = getArgValue("--noise");

  const options: BacktestOptions = {
    scenarioId,
    artifactId: artifactFilter,
    premiseId: premiseFilter,
    steps: rawSteps ? parseInt(rawSteps, 10) : undefined,
    shockMagnitudePct: rawShock ? parseFloat(rawShock) : undefined,
    noiseFactorPct: rawNoise ? parseFloat(rawNoise) : undefined,
  };

  const artifacts = getAllArtifactsWithRelations();
  const report = runBacktestSimulation(artifacts, options);

  if (isJson) {
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.summary.invalidatedArtifacts > 0 ? 1 : 0);
  }

  console.log("");
  console.log(
    `${ANSI.bold}${ANSI.white}╔══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╗${ANSI.reset}`
  );
  console.log(
    `${ANSI.bold}${ANSI.white}║  PREMISEOPS TIME-MACHINE // HISTORICAL DRIFT BACKTESTER & SCENARIO REPLAY ENGINE                                             ║${ANSI.reset}`
  );
  console.log(
    `${ANSI.bold}${ANSI.white}╚══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╝${ANSI.reset}`
  );

  console.log(
    `\n${ANSI.bold}SCENARIO:${ANSI.reset} ${ANSI.emerald}${ANSI.bold}${report.scenario.name}${ANSI.reset} [${ANSI.sky}${report.scenario.category}${ANSI.reset}]`
  );
  console.log(
    `• ${ANSI.bold}Configuration:${ANSI.reset} ${report.totalSteps} Steps | ` +
      `Shock: ${options.shockMagnitudePct ?? report.scenario.defaultShockPct}% | ` +
      `Noise: ${options.noiseFactorPct ?? report.scenario.defaultNoisePct}% | ` +
      `Virtual Interval: 1h / step`
  );
  console.log(`• ${ANSI.dim}${report.scenario.description}${ANSI.reset}`);

  const cols = {
    decision: 28,
    variable: 26,
    trajectory: 20,
    bound: 16,
    resilience: 14,
    survival: 12,
    breach: 18,
  };

  const sep =
    "─".repeat(cols.decision + 2) +
    "┼" +
    "─".repeat(cols.variable + 2) +
    "┼" +
    "─".repeat(cols.trajectory + 2) +
    "┼" +
    "─".repeat(cols.bound + 2) +
    "┼" +
    "─".repeat(cols.resilience + 2) +
    "┼" +
    "─".repeat(cols.survival + 2) +
    "┼" +
    "─".repeat(cols.breach + 2);

  console.log(
    `\n ${padCell(`${ANSI.bold}DECISION ARTIFACT${ANSI.reset}`, cols.decision)} │ ${padCell(
      `${ANSI.bold}MONITORED VARIABLE${ANSI.reset}`,
      cols.variable
    )} │ ${padCell(
      `${ANSI.bold}START ──▶ END${ANSI.reset}`,
      cols.trajectory
    )} │ ${padCell(
      `${ANSI.bold}REQ. BOUND${ANSI.reset}`,
      cols.bound
    )} │ ${padCell(
      `${ANSI.bold}RESILIENCE${ANSI.reset}`,
      cols.resilience
    )} │ ${padCell(
      `${ANSI.bold}SURVIVAL${ANSI.reset}`,
      cols.survival,
      "right"
    )} │ ${padCell(`${ANSI.bold}BREACH TICK${ANSI.reset}`, cols.breach)}`
  );
  console.log(`─${sep}`);

  for (const art of report.artifacts) {
    for (let i = 0; i < art.premises.length; i++) {
      const p = art.premises[i];
      const opSym = OPERATOR_SYMBOLS[p.operator] || p.operator;
      const unitShort = p.unit ? ` ${p.unit}` : "";

      const startVal = p.steps[0]?.simulatedValue ?? p.initialValue;
      const endVal =
        p.steps[p.steps.length - 1]?.simulatedValue ?? p.initialValue;
      const trajectoryStr =
        startVal === null || endVal === null
          ? "no data yet"
          : `${startVal} ─▶ ${endVal}${unitShort}`;
      const boundStr = `${opSym} ${p.thresholdValue}${unitShort}`;

      const resColor =
        p.resilienceScore >= 80
          ? ANSI.emerald
          : p.resilienceScore >= 50
          ? ANSI.amber
          : ANSI.rose;

      const breachStr = !p.hasData
        ? `${ANSI.dim}NO DATA${ANSI.reset}`
        : p.breachStep !== null
          ? `${ANSI.rose}Step ${p.breachStep} (${p.breachValue}${unitShort})${ANSI.reset}`
          : `${ANSI.emerald}SURVIVED${ANSI.reset}`;

      const artLabel =
        i === 0
          ? art.title.slice(0, cols.decision)
          : `${ANSI.dim}  └─ (${art.logicCombinator} gate)${ANSI.reset}`;

      console.log(
        ` ${padCell(artLabel, cols.decision)} │ ${padCell(
          `${ANSI.sky}${p.variableName}${ANSI.reset}`,
          cols.variable
        )} │ ${padCell(trajectoryStr, cols.trajectory)} │ ${padCell(
          boundStr,
          cols.bound
        )} │ ${padCell(
          p.hasData
            ? `${resColor}${ANSI.bold}${p.resilienceScore}/100 (${p.resilienceRating.slice(
                0,
                4
              )})${ANSI.reset}`
            : `${ANSI.dim}not scored${ANSI.reset}`,
          cols.resilience
        )} │ ${padCell(
          p.hasData ? `${p.survivalRatePct}%` : "n/a",
          cols.survival,
          "right"
        )} │ ${padCell(breachStr, cols.breach)}`
      );
    }
    console.log(`─${sep}`);
  }

  // Trajectory timeline visualizer
  console.log(
    `\n${ANSI.bold}VIRTUAL TIMELINE TRANSITIONS & COLLAPSE ARTIFACTS:${ANSI.reset}`
  );
  for (const art of report.artifacts) {
    for (const p of art.premises) {
      const parts: string[] = [];
      const firstDecay = p.steps.findIndex((s) => s.status === "DECAYING");
      const firstBroken = p.steps.findIndex((s) => s.status === "BROKEN");

      if (firstBroken !== -1) {
        if (firstDecay !== -1 && firstDecay < firstBroken) {
          if (firstDecay > 0) {
            parts.push(
              `${ANSI.emerald}[S0..${firstDecay - 1}: VALID]${ANSI.reset}`
            );
          }
          parts.push(
            `${ANSI.amber}[S${firstDecay}..${firstBroken - 1}: DECAYING]${
              ANSI.reset
            }`
          );
          parts.push(
            `${ANSI.rose}[S${firstBroken}..${p.steps.length - 1}: BROKEN ✖]${
              ANSI.reset
            }`
          );
        } else {
          if (firstBroken > 0) {
            parts.push(
              `${ANSI.emerald}[S0..${firstBroken - 1}: VALID]${ANSI.reset}`
            );
          }
          parts.push(
            `${ANSI.rose}[S${firstBroken}..${p.steps.length - 1}: BROKEN ✖]${
              ANSI.reset
            }`
          );
        }
      } else if (firstDecay !== -1) {
        if (firstDecay > 0) {
          parts.push(
            `${ANSI.emerald}[S0..${firstDecay - 1}: VALID]${ANSI.reset}`
          );
        }
        parts.push(
          `${ANSI.amber}[S${firstDecay}..${p.steps.length - 1}: DECAYING ▲]${
            ANSI.reset
          }`
        );
      } else if (!p.hasData) {
        parts.push(`${ANSI.dim}[no data to replay yet]${ANSI.reset}`);
      } else {

        parts.push(
          `${ANSI.emerald}[S0..${p.steps.length - 1}: 100% HEALTHY ✔]${
            ANSI.reset
          }`
        );
      }

      console.log(
        `  • ${padCell(art.title.slice(0, 24), 24)} ${ANSI.sky}(${
          p.variableName
        })${ANSI.reset}: ${parts.join(" ──▶ ")}`
      );
    }
  }

  // Multi-hop Cascade Replay Impact
  const cascadedArts = report.artifacts.filter((a) => Boolean(a.cascadedFromId));
  if (cascadedArts.length > 0) {
    console.log(
      `\n${ANSI.rose}${ANSI.bold}⚡ MULTI-HOP CASCADE BLAST RADIUS IMPACT:${ANSI.reset}`
    );
    for (const art of cascadedArts) {
      console.log(
        `  • Step ${art.firstInvalidatedStep}: Upstream decision breach [${art.cascadedFromId}] cascaded to invalidate downstream [${art.title}] (${art.targetLocus})`
      );
    }
  }

  // Threshold Optimization Advisor
  console.log(
    `\n${ANSI.bold}RECOMMENDED THRESHOLD SAFETY BOUND ADJUSTMENTS:${ANSI.reset}`
  );
  for (const art of report.artifacts) {
    for (const p of art.premises) {
      if (!p.hasData) {
        console.log(
          `  • ${ANSI.bold}${p.variableName}${ANSI.reset}: ${ANSI.dim}no data to replay yet, no advice${ANSI.reset}`
        );
      } else if (p.recommendedThreshold !== p.thresholdValue) {
        console.log(
          `  • ${ANSI.bold}${p.variableName}${ANSI.reset}: ${ANSI.amber}${p.recommendedThresholdAdjustment}${ANSI.reset} (was: ${OPERATOR_SYMBOLS[p.operator]} ${p.thresholdValue})`
        );
      } else {
        console.log(
          `  • ${ANSI.bold}${p.variableName}${ANSI.reset}: ${ANSI.emerald}Current bound ${OPERATOR_SYMBOLS[p.operator]} ${p.thresholdValue} holds resiliently under this scenario${ANSI.reset}`
        );
      }
    }
  }

  // Summary Banner
  console.log("");
  console.log(
    `${ANSI.bold}SUMMARY:${ANSI.reset} ${report.summary.totalArtifacts} Decisions | ` +
      `${report.summary.totalPremises} Premises | ` +
      `Avg Resilience: ${
        report.summary.portfolioRating === "HIGH"
          ? `${ANSI.emerald}${report.summary.averageResilienceScore}/100 (HIGH)${ANSI.reset}`
          : report.summary.portfolioRating === "MODERATE"
          ? `${ANSI.amber}${report.summary.averageResilienceScore}/100 (MODERATE)${ANSI.reset}`
          : `${ANSI.rose}${report.summary.averageResilienceScore}/100 (BRITTLE)${ANSI.reset}`
      } | ` +
      `${ANSI.emerald}${report.summary.survivedArtifacts} Survived${ANSI.reset} | ` +
      `${report.summary.invalidatedArtifacts > 0 ? ANSI.rose : ANSI.zinc}${
        report.summary.invalidatedArtifacts
      } Invalidated (${report.summary.cascadedArtifacts} Cascaded)${ANSI.reset}`
  );

  const exitCode = report.summary.invalidatedArtifacts > 0 ? 1 : 0;
  if (exitCode === 0) {
    console.log(
      `\n${ANSI.bgEmerald}${ANSI.bold}${ANSI.white} ✔ BACKTEST PASSED: PORTFOLIO ARCHITECTURE RESILIENT UNDER SCENARIO (EXIT 0) ${ANSI.reset}\n`
    );
  } else {
    console.log(
      `\n${ANSI.bgRose}${ANSI.bold}${ANSI.white} ✖ BACKTEST FAILED: ${report.summary.invalidatedArtifacts} DECISION(S) INVALIDATED UNDER STRESS (EXIT 1) ${ANSI.reset}\n`
    );
  }

  process.exit(exitCode);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  if (args[0] === "scan") {
    await runScanCommand(args.slice(1));
    return;
  }

  if (args[0] === "backtest" || args[0] === "replay") {
    await runBacktestCommand(args.slice(1));
    return;
  }


  const isStrict = args.includes("--strict");
  const noPoll = args.includes("--no-poll");
  const isJson = args.includes("--json");
  const shouldReset = args.includes("--reset");
  const shouldApply = args.includes("--apply");
  const shouldRollback = args.includes("--rollback");
  const shouldCreatePr = args.includes("--create-pr") || args.includes("--pr");
  const showFinOps = args.includes("--finops") || args[0] === "finops";

  const getArgValue = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    if (idx !== -1 && idx + 1 < args.length) {
      return args[idx + 1];
    }
    return undefined;
  };

  const artifactFilter = getArgValue("--artifact");
  const simulateBreachTarget = getArgValue("--simulate-breach");
  const mutateExpr = getArgValue("--mutate");
  const customBranch = getArgValue("--branch");
  const targetRepo = getArgValue("--repo");
  const expectBrokenArg = getArgValue("--expect-broken");
  const expectedBroken = expectBrokenArg
    ? expectBrokenArg.split(",").map((e) => e.trim()).filter(Boolean)
    : null;

  if (shouldRollback) {
    const restored = rollbackAllPatchedLoci();
    if (!isJson) {
      console.log(
        `${ANSI.sky}↺ Rolled back ${restored.length} patched workspace file(s) from SQLite LocusBackup: [${restored.join(", ")}]${ANSI.reset}`
      );
    }
  }

  if (shouldReset) {
    resetDatabaseToSeed();
    if (!isJson) {
      console.log(
        `${ANSI.sky}↺ Reset ./premise.db & restored any patched loci to initial seed state.${ANSI.reset}`
      );
    }
  }

  if (!noPoll) {
    await executeActiveProbes(
      artifactFilter ? { artifactId: artifactFilter } : undefined
    );
  }

  if (mutateExpr && mutateExpr.includes("=")) {
    const [varName, rawVal] = mutateExpr.split("=");
    const numVal = Number(rawVal);
    evaluateAndPersistMetricUpdate({
      variableName: varName.trim(),
      value: Number.isNaN(numVal) ? rawVal.trim() : numVal,
      source: "premise-cli-mutate",
    });
  }

  if (simulateBreachTarget) {
    const allArts = getAllArtifactsWithRelations();
    const allPrems = allArts.flatMap((a) => a.premises);
    const target = allPrems.find(
      (p) =>
        p.id === simulateBreachTarget ||
        p.variableName === simulateBreachTarget ||
        p.artifactId === simulateBreachTarget
    );
    if (target) {
      const thr = Number(target.thresholdValue);
      let breakingVal = thr;
      if (target.operator === "GT" || target.operator === "GTE") {
        breakingVal = Number((thr * 0.65).toFixed(2));
      } else if (target.operator === "LT" || target.operator === "LTE") {
        breakingVal =
          target.unit === "%" && thr >= 95
            ? 99.96
            : Number((thr * 1.2).toFixed(2));
      } else {
        breakingVal = thr + 10;
      }
      evaluateAndPersistMetricUpdate({
        premiseId: target.id,
        variableName: target.variableName,
        value: breakingVal,
        source: "premise-cli-breach-simulation",
      });
      if (!isJson) {
        console.log(
          `${ANSI.rose}${ANSI.bold}⚡ Injected synthetic breach:${ANSI.reset} ${target.variableName} → ${breakingVal} ${target.unit} (bound: ${OPERATOR_SYMBOLS[target.operator]} ${target.thresholdValue} ${target.unit})`
        );
      }
    }
  }

  let artifacts = getAllArtifactsWithRelations();
  if (artifactFilter) {
    artifacts = artifacts.filter((a) => a.id === artifactFilter);
  }
  const allEvents = getAllInvalidationEvents();

  const allPremises = artifacts.flatMap((a) => a.premises);
  const brokenPremises = allPremises.filter((p) => p.status === "BROKEN");
  const decayingPremises = allPremises.filter((p) => p.status === "DECAYING");
  const invalidatedArtifacts = artifacts.filter(
    (a) => a.status === "INVALIDATED"
  );
  const cascadedArtifacts = artifacts.filter((a) => Boolean(a.cascadedFromId));
  const noDataArtifacts = artifacts.filter((a) => a.status === "NO_DATA");

  // Optional live teardown patch application (--apply)
  const appliedLoci: string[] = [];
  if (shouldApply && invalidatedArtifacts.length > 0) {
    for (const art of invalidatedArtifacts) {
      const primaryPrem =
        art.premises.find((p) => p.status === "BROKEN") || art.premises[0];
      if (!primaryPrem) continue;
      const upstreamArt = art.cascadedFromId
        ? artifacts.find((a) => a.id === art.cascadedFromId)
        : undefined;
      const patchRes = applyLocusPatchAndRecordBackup({
        targetLocus: art.targetLocus,
        artifactId: art.id,
        artifactTitle: art.title,
        variableName: primaryPrem.variableName,
        operator: primaryPrem.operator,
        thresholdValue: primaryPrem.thresholdValue,
        breakingValue: art.cascadedFromId
          ? `CASCADE(${art.cascadedFromId})`
          : primaryPrem.currentValue,
        unit: primaryPrem.unit,
        blastRadius: art.blastRadius,
        cascadedFromTitle: upstreamArt?.title,
      });
      if (patchRes.ok) {
        appliedLoci.push(patchRes.resolvedPath);
      }
    }
  }

  // With --expect-broken, the known broken premises are the expected outcome:
  // only a different set of broken premises fails the check
  const expectation = expectedBroken
    ? compareBrokenToExpected(brokenPremises, expectedBroken)
    : null;
  const exitCode = decideCheckExit({
    brokenCount: brokenPremises.length,
    invalidatedCount: invalidatedArtifacts.length,
    decayingCount: decayingPremises.length,
    noDataCount: noDataArtifacts.length,
    strict: isStrict,
    expectation,
  });

  const finOpsLedger = calculateFinOpsLedger(artifacts, allEvents);

  if (isJson) {
    console.log(
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          ok: exitCode === 0,
          exitCode,
          strictMode: isStrict,
          expectedBroken: expectation
            ? { expected: expectedBroken, ...expectation }
            : null,
          appliedLoci,
          finOps: finOpsLedger,
          summary: {
            totalDecisions: artifacts.length,
            totalPremises: allPremises.length,
            validPremises: allPremises.filter((p) => p.status === "VALID")
              .length,
            decayingPremises: decayingPremises.length,
            brokenPremises: brokenPremises.length,
            invalidatedDecisions: invalidatedArtifacts.length,
            noDataDecisions: noDataArtifacts.length,
            cascadedInvalidations: cascadedArtifacts.length,
          },
          artifacts: artifacts.map((a) => ({
            id: a.id,
            title: a.title,
            type: a.type,
            status: a.status,
            logicCombinator: a.logicCombinator || "ANY",
            targetLocus: a.targetLocus,
            dependsOnIds: a.dependsOnIds || [],
            downstreamDependentIds: a.downstreamDependentIds || [],
            cascadedFromId: a.cascadedFromId || null,
            locusInspection: inspectLocalLocus(a.targetLocus),
            premises: a.premises.map((p) => ({
              id: p.id,
              variableName: p.variableName,
              currentValue: p.currentValue,
              operator: p.operator,
              thresholdValue: p.thresholdValue,
              unit: p.unit,
              status: p.status,
              probeType: p.probes[0]?.probeType || "HTTP_JSON_PATH",
            })),
          })),
          invalidationEvents: allEvents,
        },
        null,
        2
      )
    );
    process.exit(exitCode);
  }

  // Render High-Density ANSI Table
  console.log("");
  console.log(
    `${ANSI.bold}${ANSI.white}╔══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╗${ANSI.reset}`
  );
  console.log(
    `${ANSI.bold}${ANSI.white}║  PREMISEOPS CI/CD ASSERTION RUNNER v3.0 // ARCHITECTURAL & STRATEGIC DECISION GARBAGE COLLECTOR                              ║${ANSI.reset}`
  );
  console.log(
    `${ANSI.bold}${ANSI.white}╚══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╝${ANSI.reset}`
  );

  const cols = {
    decision: 32,
    variable: 28,
    current: 16,
    bound: 18,
    drift: 9,
    tti: 16,
    status: 12,
  };

  const sepLine =
    "─".repeat(cols.decision + 2) +
    "┼" +
    "─".repeat(cols.variable + 2) +
    "┼" +
    "─".repeat(cols.current + 2) +
    "┼" +
    "─".repeat(cols.bound + 2) +
    "┼" +
    "─".repeat(cols.drift + 2) +
    "┼" +
    "─".repeat(cols.tti + 2) +
    "┼" +
    "─".repeat(cols.status + 2);

  console.log(
    `\n ${padCell(`${ANSI.bold}DECISION ARTIFACT${ANSI.reset}`, cols.decision)} │ ${padCell(
      `${ANSI.bold}MONITORED VARIABLE${ANSI.reset}`,
      cols.variable
    )} │ ${padCell(`${ANSI.bold}LIVE VALUE${ANSI.reset}`, cols.current)} │ ${padCell(
      `${ANSI.bold}REQUIRED BOUND${ANSI.reset}`,
      cols.bound
    )} │ ${padCell(`${ANSI.bold}DRIFT %${ANSI.reset}`, cols.drift)} │ ${padCell(
      `${ANSI.bold}TTI FORECAST${ANSI.reset}`,
      cols.tti
    )} │ ${padCell(`${ANSI.bold}STATUS${ANSI.reset}`, cols.status)}`
  );
  console.log(`─${sepLine}`);

  for (const art of artifacts) {
    for (let i = 0; i < art.premises.length; i++) {
      const p = art.premises[i];
      const evalRes = evaluatePremiseState(
        p.currentValue,
        p.operator,
        p.thresholdValue,
        p.decayWarningMargin
      );
      const forecast = computeDriftForecast(
        p.metricSamples,
        p.operator,
        p.thresholdValue,
        p.currentValue,
        p.status
      );
      const opSym = OPERATOR_SYMBOLS[p.operator] || p.operator;
      const unitShort = p.unit ? ` ${p.unit}` : "";

      const artLabel =
        i === 0
          ? `${art.title.slice(0, cols.decision)}`
          : `${ANSI.dim}  └─ (${art.logicCombinator || "ANY"} gate)${ANSI.reset}`;

      const ttiShort =
        p.status === "BROKEN"
          ? `${ANSI.rose}BREACHED${ANSI.reset}`
          : forecast.samplesToBreach !== null
          ? `${ANSI.amber}${forecast.etaLabel.replace(" at current drift", "")}${ANSI.reset}`
          : `${ANSI.zinc}STABLE${ANSI.reset}`;

      const driftColor =
        evalRes.driftPercent >= 100
          ? ANSI.rose
          : evalRes.driftPercent >= 72
          ? ANSI.amber
          : ANSI.emerald;

      console.log(
        ` ${padCell(artLabel, cols.decision)} │ ${padCell(
          `${ANSI.sky}${p.variableName}${ANSI.reset}`,
          cols.variable
        )} │ ${padCell(
          `${p.currentValue}${unitShort}`,
          cols.current
        )} │ ${padCell(
          `${opSym} ${p.thresholdValue}${unitShort}`,
          cols.bound
        )} │ ${padCell(
          `${driftColor}${evalRes.driftPercent}%${ANSI.reset}`,
          cols.drift,
          "right"
        )} │ ${padCell(ttiShort, cols.tti)} │ ${padCell(
          formatStatusBadge(p.status),
          cols.status
        )}`
      );
    }
    console.log(`─${sepLine}`);
  }

  // Cross-Artifact Multi-Hop Cascade & Locus Verification Summary
  console.log(
    `\n${ANSI.bold}DECISION ARTIFACT HEALTH & MULTI-HOP CASCADE GRAPH:${ANSI.reset}`
  );
  for (const art of artifacts) {
    const locusInfo = inspectLocalLocus(art.targetLocus);
    const patchedTag = locusInfo.isPatched ? " [PATCHED ON DISK]" : "";
    const locusBadge = locusInfo.exists
      ? `${ANSI.emerald}[LOCAL FILE: ${locusInfo.resolvedPath}:L${locusInfo.startLine}-L${locusInfo.endLine} (${locusInfo.lines.length}L)${patchedTag}]${ANSI.reset}`
      : `${ANSI.amber}[UNMOUNTED LOCUS: ${art.targetLocus}]${ANSI.reset}`;

    const cascadeSuffix = art.cascadedFromId
      ? ` ${ANSI.rose}${ANSI.bold}⚡ CASCADED FROM UPSTREAM [${art.cascadedFromId}]${ANSI.reset}`
      : (art.downstreamDependentIds?.length || 0) > 0
      ? ` ${ANSI.sky}→ Cascades to ${art.downstreamDependentIds!.length} downstream decision(s): [${art.downstreamDependentIds!.join(", ")}]${ANSI.reset}`
      : "";

    console.log(
      `  • ${padCell(formatStatusBadge(art.status), 16)} ${ANSI.bold}${art.title}${ANSI.reset} ${locusBadge}${cascadeSuffix}`
    );
  }

  if (showFinOps) {
    printFinOpsTable(finOpsLedger);
  }

  if (appliedLoci.length > 0) {
    console.log(
      `\n${ANSI.emerald}${ANSI.bold}✔ LIVE TEARDOWN PATCHES APPLIED TO DISK:${ANSI.reset} [${appliedLoci.join(", ")}] (Run with --rollback or --reset to restore)`
    );
  }

  console.log("");
  console.log(
    `${ANSI.bold}SUMMARY:${ANSI.reset} ${artifacts.length} Decisions | ${allPremises.length} Premises | ` +
      `${ANSI.emerald}${allPremises.filter((p) => p.status === "VALID").length} VALID${ANSI.reset} | ` +
      `${ANSI.amber}${decayingPremises.length} DECAYING${ANSI.reset} | ` +
      `${ANSI.rose}${brokenPremises.length} BROKEN${ANSI.reset} | ` +
      `${ANSI.rose}${invalidatedArtifacts.length} INVALIDATED (${cascadedArtifacts.length} CASCADED)${ANSI.reset} | ` +
      `${ANSI.amber}Drag: ${formatUsd(finOpsLedger.totalActiveDragMonthlyUsd)}/mo${ANSI.reset} | ` +
      `${ANSI.emerald}Savings: ${formatUsd(finOpsLedger.cumulativeAnnualSavingsUsd)}/yr${ANSI.reset}`
  );

  if (invalidatedArtifacts.length > 0) {
    console.log(
      `\n${ANSI.bgRose}${ANSI.bold}${ANSI.white} 🚨 KILL-SWITCH TRIGGERED: ${invalidatedArtifacts.length} DECISION ARTIFACT(S) INVALIDATED — TEARDOWN REQUIRED ${ANSI.reset}`
    );
    for (const art of invalidatedArtifacts) {
      const ev = art.invalidationEvents[0];
      console.log(
        `\n${ANSI.rose}${ANSI.bold}━━━ TEARDOWN SPECIFICATION: ${art.title} (${art.targetLocus}) ━━━${ANSI.reset}`
      );
      if (ev) {
        console.log(ev.remediationPlan);

        if (shouldCreatePr) {
          const dispatchRes = await dispatchInvalidationAlert({
            eventId: ev.id,
            channel: "GITHUB_PR",
            repo: targetRepo,
            branchName: customBranch,
            dryRun: !process.env.GITHUB_TOKEN,
          });

          const pr = dispatchRes.prResult;
          if (pr) {
            console.log(
              `\n${ANSI.emerald}${ANSI.bold}╔══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╗${ANSI.reset}`
            );
            console.log(
              `${ANSI.emerald}${ANSI.bold}║  GITHUB PR BOT // ${pr.status === "SENT" ? "PULL REQUEST OPENED" : pr.status === "FAILED" ? "FAILED" : "DRY RUN: NOTHING WAS SENT"}`.padEnd(133) + `║${ANSI.reset}`
            );
            console.log(
              `${ANSI.emerald}${ANSI.bold}╚══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╝${ANSI.reset}`
            );
            console.log(
              pr.status === "SENT"
                ? `  • ${ANSI.bold}Pull Request:${ANSI.reset}  ${ANSI.emerald}${pr.prUrl}${ANSI.reset} (opened)`
                : pr.status === "FAILED"
                  ? `  • ${ANSI.bold}Pull Request:${ANSI.reset}  ${ANSI.rose}Failed: ${pr.error}${ANSI.reset}`
                  : `  • ${ANSI.bold}Pull Request:${ANSI.reset}  Dry run: nothing was sent. ${pr.dryRunReason ?? ""}`
            );
            console.log(
              `  • ${ANSI.bold}Git Branch:${ANSI.reset}    ${ANSI.sky}${pr.branchName}${ANSI.reset}${pr.commitSha ? ` (Commit: ${pr.commitSha})` : ""}`
            );
            console.log(
              `  • ${ANSI.bold}Compare URL:${ANSI.reset}   ${ANSI.dim}${pr.compareUrl}${ANSI.reset}${pr.status === "SENT" ? "" : " (works once the branch is pushed)"}`
            );
            console.log(
              `  • ${ANSI.bold}CLI Command:${ANSI.reset}   ${ANSI.amber}${pr.ghCliCommand}${ANSI.reset}`
            );
            console.log(
              `  • ${ANSI.bold}Audit Log:${ANSI.reset}     Saved dispatch [${dispatchRes.dispatchLog.id}] to ./premise.db`
            );
          }
        }
      }
    }
  } else if (isStrict && decayingPremises.length > 0) {
    console.log(
      `\n${ANSI.bgAmber}${ANSI.bold}${ANSI.white} ⚠️  STRICT MODE FAILURE: ${decayingPremises.length} PREMISE(S) IN DECAY WARNING BAND ${ANSI.reset}`
    );
  } else if (noDataArtifacts.length > 0) {
    // Printed below; never claim everything holds when something was not checked
  } else {
    console.log(
      `\n${ANSI.bgEmerald}${ANSI.bold}${ANSI.white} ✔ ALL LOAD-BEARING ARCHITECTURAL & STRATEGIC PREMISES HOLDING TRUE (EXIT 0) ${ANSI.reset}\n`
    );
  }

  if (noDataArtifacts.length > 0) {
    console.log(
      `\n${ANSI.rose}${ANSI.bold}✖ NO DATA: ${noDataArtifacts.length} decision(s) have no value yet, so they were not checked. Exit 1.${ANSI.reset}`
    );
    for (const art of noDataArtifacts) {
      for (const p of art.premises) {
        const probe = p.probes[0];
        const reason = !probe || probe.status === "UNBOUND" || !probe.targetUrlOrQuery
          ? "no probe connected"
          : probe.lastError || "the probe returned no value";
        console.log(`  • ${art.title}: ${p.variableName} (${reason})`);
      }
    }
    console.log("");
  }

  if (expectation) {
    const brokenList = brokenPremises
      .map((p) => `${p.variableName} = ${p.currentValue} ${p.unit}`.trim())
      .join(", ");
    if (expectation.ok) {
      console.log(
        `${ANSI.emerald}${ANSI.bold}✔ EXPECTED OUTCOME: exactly the expected premise(s) are BROKEN [${expectedBroken!.join(", ")}] (${brokenList}). Exit 0.${ANSI.reset}\n`
      );
    } else {
      if (expectation.missing.length > 0) {
        console.log(
          `${ANSI.rose}${ANSI.bold}✖ EXPECTED BROKEN BUT NOT BROKEN: ${expectation.missing.join(", ")}${ANSI.reset}`
        );
      }
      if (expectation.unexpected.length > 0) {
        console.log(
          `${ANSI.rose}${ANSI.bold}✖ UNEXPECTED BROKEN PREMISE(S): ${expectation.unexpected.join(", ")}${ANSI.reset}`
        );
      }
      console.log("");
    }
  }

  process.exit(exitCode);
}

main().catch((err) => {
  console.error(`${ANSI.rose}Fatal PremiseOps CLI Error:${ANSI.reset}`, err);
  process.exit(1);
});
