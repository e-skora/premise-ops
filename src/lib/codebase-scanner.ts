import {
  ArtifactType,
  CompiledArtifactOutput,
  DecisionArtifactRecord,
  DiscoveredCodebasePremise,
  Operator,
  ProbeType,
} from "./types";
import { parseTargetLocus } from "./locus-inspector";
import { resolveWorkspaceRoot } from "./workspace-root";

// Scanned under the workspace root and under the bundled demo repo
const DEMO_REPO_DIR = "examples/demo-repo";
const SCAN_DIRECTORIES = [
  "packages",
  "services",
  "infra",
  "ops",
  `${DEMO_REPO_DIR}/packages`,
  `${DEMO_REPO_DIR}/services`,
  `${DEMO_REPO_DIR}/infra`,
  `${DEMO_REPO_DIR}/ops`,
];
const SCAN_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".yaml",
  ".yml",
  ".tf",
  ".py",
  ".sql",
]);

function getServerFsAndPath(): {
  fs: typeof import("node:fs");
  path: typeof import("node:path");
  workspaceRoot: string;
} | null {
  if (typeof window !== "undefined" || typeof process === "undefined") {
    return null;
  }
  try {
    const getBuiltin = (
      process as unknown as {
        getBuiltinModule?: (id: string) => unknown;
      }
    ).getBuiltinModule;
    if (typeof getBuiltin === "function") {
      const fs = getBuiltin("node:fs") as typeof import("node:fs");
      const path = getBuiltin("node:path") as typeof import("node:path");
      return {
        fs,
        path,
        workspaceRoot: resolveWorkspaceRoot(),
      };
    }
    return null;
  } catch {
    return null;
  }
}

const SYMBOL_TO_OPERATOR: Record<string, Operator> = {
  "<": "LT",
  "<=": "LTE",
  ">": "GT",
  ">=": "GTE",
  "==": "EQ",
  "=": "EQ",
  "!=": "NEQ",
};

/**
 * Walks workspace directories (`packages/`, `services/`, `infra/`, `ops/`, at the
 * root and inside `examples/demo-repo/`)
 * and extracts inline `@premise` and `@premise-locus` assumptions from source files.
 */
export function scanWorkspaceForPremises(
  existingArtifacts: DecisionArtifactRecord[]
): {
  discovered: DiscoveredCodebasePremise[];
  scannedDirectories: string[];
  totalFilesScanned: number;
} {
  const mods = getServerFsAndPath();
  if (!mods) {
    return {
      discovered: [],
      scannedDirectories: SCAN_DIRECTORIES,
      totalFilesScanned: 0,
    };
  }

  const { fs, path, workspaceRoot } = mods;
  const discovered: DiscoveredCodebasePremise[] = [];
  let totalFilesScanned = 0;

  // Build lookup maps for already-monitored artifacts
  const artifactById = new Map<string, DecisionArtifactRecord>();
  const artifactByFilePath = new Map<string, DecisionArtifactRecord>();
  const artifactByVarName = new Map<string, DecisionArtifactRecord>();

  for (const art of existingArtifacts) {
    artifactById.set(art.id, art);
    const parsedLocus = parseTargetLocus(art.targetLocus);
    if (parsedLocus.filePath) {
      artifactByFilePath.set(
        parsedLocus.filePath.replace(/\\/g, "/"),
        art
      );
    }
    for (const p of art.premises) {
      artifactByVarName.set(p.variableName, art);
    }
  }

  const walkDir = (dirAbs: string) => {
    let entries: import("node:fs").Dirent[] = [];
    try {
      entries = fs.readdirSync(dirAbs, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") {
        continue;
      }
      const fullPath = path.join(dirAbs, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (!SCAN_EXTENSIONS.has(ext)) continue;
        totalFilesScanned += 1;
        const relPath = path
          .relative(workspaceRoot, fullPath)
          .replace(/\\/g, "/");
        try {
          const content = fs.readFileSync(fullPath, "utf8");
          const parsedItem = parseFileForInlinePremise(
            relPath,
            content,
            artifactById,
            artifactByFilePath,
            artifactByVarName
          );
          if (parsedItem) {
            discovered.push(parsedItem);
          }
        } catch {
          // ignore unreadable file
        }
      }
    }
  };

  for (const dirName of SCAN_DIRECTORIES) {
    const absDir = path.join(workspaceRoot, dirName);
    if (fs.existsSync(absDir)) {
      walkDir(absDir);
    }
  }

  // Sort untracked items first so actionable discoveries appear at the top
  discovered.sort((a, b) => {
    if (a.alreadyMonitored !== b.alreadyMonitored) {
      return a.alreadyMonitored ? 1 : -1;
    }
    return a.filePath.localeCompare(b.filePath);
  });

  return {
    discovered,
    scannedDirectories: SCAN_DIRECTORIES,
    totalFilesScanned,
  };
}

function parseFileForInlinePremise(
  relPath: string,
  content: string,
  artifactById: Map<string, DecisionArtifactRecord>,
  artifactByFilePath: Map<string, DecisionArtifactRecord>,
  artifactByVarName: Map<string, DecisionArtifactRecord>
): DiscoveredCodebasePremise | null {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  if (lines.length > 1 && lines[lines.length - 1] === "") {
    lines.pop();
  }

  // Case A: Explicit @premise tag block (e.g. // @premise title: ...)
  const tags: Record<string, string> = {};
  let firstTagLine = 1;
  let hasExplicitPremiseTag = false;

  for (let i = 0; i < Math.min(lines.length, 40); i++) {
    const line = lines[i];
    const tagMatch = line.match(
      /^(?:\s*\/\/|\s*#|\s*\*)\s*@premise\s+([a-zA-Z]+):\s*(.+)$/i
    );
    if (tagMatch) {
      if (!hasExplicitPremiseTag) {
        firstTagLine = i + 1;
        hasExplicitPremiseTag = true;
      }
      tags[tagMatch[1].toLowerCase()] = tagMatch[2].trim();
    }
  }

  if (hasExplicitPremiseTag && tags.title && tags.metric) {
    // Parse metric spec: "pgvector_total_rows < 1500000 rows (current: 1380000, margin: 0.12)"
    const metricSpec = tags.metric;
    const metricMatch = metricSpec.match(
      /^([a-zA-Z0-9_]+)\s*(<=|>=|==|!=|<|>|=)\s*(-?\d+(?:\.\d+)?)\s*([^(]*?)(?:\(([^)]*)\))?$/
    );

    const variableName = metricMatch ? metricMatch[1].trim() : "custom_metric";
    const opSym = metricMatch ? metricMatch[2].trim() : "<";
    const operator: Operator = SYMBOL_TO_OPERATOR[opSym] || "LT";
    const thresholdValue = metricMatch ? metricMatch[3].trim() : "100";
    const unit = metricMatch ? metricMatch[4].trim() : "";
    const metaParens = metricMatch ? metricMatch[5] || "" : "";

    const marginMatch = metaParens.match(/margin:\s*(0?\.\d+)/i);

    // A code comment is not a measurement: no value until a probe reports one
    const currentValue = "";
    const decayWarningMargin = marginMatch ? Number(marginMatch[1]) : 0.12;

    // Parse probe spec: "SQL_METRIC | SELECT ..." or "PROMQL | avg_over_time(...)"
    let probeType: ProbeType = "HTTP_JSON_PATH";
    let targetUrlOrQuery = "";
    if (tags.probe) {
      const parts = tags.probe.split("|").map((s) => s.trim());
      if (parts.length >= 2) {
        const candidateType = parts[0].toUpperCase();
        if (
          candidateType === "SQL_METRIC" ||
          candidateType === "PROMQL" ||
          candidateType === "HTTP_JSON_PATH" ||
          candidateType === "WEBHOOK_INGEST" ||
          candidateType === "WEB_SCRAPE_EXTRACT"
        ) {
          probeType = candidateType as ProbeType;
        } else if (candidateType === "SQL_QUERY") {
          probeType = "SQL_METRIC";
        }
        targetUrlOrQuery = parts.slice(1).join(" | ");
      }
    }

    const rawType = (tags.type || "ADR").toUpperCase();
    const type: ArtifactType =
      rawType === "GITHUB_PR" ||
      rawType === "STRATEGY_MEMO" ||
      rawType === "VENDOR_CONTRACT"
        ? (rawType as ArtifactType)
        : "ADR";

    const lineStart = firstTagLine;
    const lineEnd = Math.min(lines.length, 30);
    const targetLocus = `${relPath}:L${lineStart}-L${lineEnd}`;

    const matchedArt =
      artifactByFilePath.get(relPath) ||
      artifactByVarName.get(variableName) ||
      null;

    return {
      id: `scan-${relPath.replace(/[^a-zA-Z0-9]/g, "-")}`,
      filePath: relPath,
      lineStart,
      lineEnd,
      targetLocus,
      title: tags.title,
      type,
      claim:
        tags.claim ||
        `${variableName} ${opSym} ${thresholdValue}${unit ? ` ${unit}` : ""}`,
      variableName,
      operator,
      thresholdValue,
      currentValue,
      unit,
      decayWarningMargin,
      probeType,
      targetUrlOrQuery,
      blastRadius:
        tags.blastradius ||
        `Decommission obsolete implementation in ${targetLocus}`,
      codeSnippet: lines.slice(lineStart - 1, Math.min(lines.length, 16)).join("\n"),
      alreadyMonitored: Boolean(matchedArt),
      matchedArtifactId: matchedArt ? matchedArt.id : null,
    };
  }

  // Case B: Existing @premise-locus header (e.g. // @premise-locus: art-adr-014)
  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    const locusMatch = lines[i].match(
      /^(?:\s*\/\/|\s*#)\s*@premise-locus:\s*([a-zA-Z0-9_-]+)/i
    );
    if (locusMatch) {
      const locusArtId = locusMatch[1].trim();
      const matchedArt =
        artifactById.get(locusArtId) || artifactByFilePath.get(relPath) || null;

      // Also parse Bound to: & Blast Radius: comments if present
      const boundLine =
        lines.find((l) => /Bound to:/i.test(l)) || "";
      const blastLine =
        lines.find((l) => /Blast Radius:/i.test(l)) || "";

      const boundMatch = boundLine.match(
        /Bound to:\s*([a-zA-Z0-9_]+)\s*(<=|>=|==|!=|<|>)\s*(-?\d+(?:\.\d+)?)\s*([^\sA]*)/i
      );

      const primaryPremise = matchedArt?.premises[0];
      const variableName =
        primaryPremise?.variableName ||
        (boundMatch ? boundMatch[1] : "monitored_metric");
      const operator: Operator =
        primaryPremise?.operator ||
        (boundMatch ? SYMBOL_TO_OPERATOR[boundMatch[2]] || "GT" : "GT");
      const thresholdValue =
        primaryPremise?.thresholdValue ||
        (boundMatch ? boundMatch[3] : "0");
      const unit =
        primaryPremise?.unit || (boundMatch ? boundMatch[4] : "");
      const currentValue = primaryPremise?.currentValue || "";
      const lineEnd = Math.min(lines.length, 30);

      return {
        id: `scan-${relPath.replace(/[^a-zA-Z0-9]/g, "-")}`,
        filePath: relPath,
        lineStart: 1,
        lineEnd,
        targetLocus: matchedArt?.targetLocus || `${relPath}:L1-L${lineEnd}`,
        title: matchedArt?.title || `Codebase Locus (${locusArtId})`,
        type: matchedArt?.type || "ADR",
        claim:
          primaryPremise?.claim ||
          boundLine.replace(/^(?:\s*\/\/|\s*#)\s*Bound to:\s*/i, "").trim(),
        variableName,
        operator,
        thresholdValue,
        currentValue,
        unit,
        decayWarningMargin: primaryPremise?.decayWarningMargin ?? 0.1,
        probeType:
          primaryPremise?.probes[0]?.probeType || "HTTP_JSON_PATH",
        targetUrlOrQuery:
          primaryPremise?.probes[0]?.targetUrlOrQuery || "",
        blastRadius:
          matchedArt?.blastRadius ||
          blastLine.replace(/^(?:\s*\/\/|\s*#)\s*Blast Radius:\s*/i, "").trim(),
        codeSnippet: lines.slice(0, Math.min(lines.length, 14)).join("\n"),
        alreadyMonitored: Boolean(matchedArt),
        matchedArtifactId: matchedArt ? matchedArt.id : null,
      };
    }
  }

  return null;
}

/**
 * Converts a DiscoveredCodebasePremise into a CompiledArtifactOutput + markdown rawContent
 * ready for insertion via insertCompiledArtifact().
 */
export function convertDiscoveredToCompiledOutput(
  item: DiscoveredCodebasePremise
): {
  rawContent: string;
  compiled: CompiledArtifactOutput;
} {
  const rawContent = `# ${item.title}
**Discovered via Codebase Scanner** | **Type:** \`${item.type}\` | **Locus:** \`${item.targetLocus}\`

## Extracted Inline Codebase Premise
- **Claim:** ${item.claim}
- **Metric Guardrail:** \`${item.variableName} ${item.operator} ${item.thresholdValue}${item.unit ? ` ${item.unit}` : ""}\` (Observed: \`${item.currentValue}${item.unit ? ` ${item.unit}` : ""}\`)
- **Live Probe (${item.probeType}):** \`${item.targetUrlOrQuery}\`

## Annotated Source Snippet (\`${item.targetLocus}\`)
\`\`\`
${item.codeSnippet}
\`\`\`

## Blast Radius & Automated Teardown Plan
${item.blastRadius}`;

  const compiled: CompiledArtifactOutput = {
    title: item.title,
    type: item.type,
    targetLocus: item.targetLocus,
    blastRadius: item.blastRadius,
    logicCombinator: "ANY",
    dependsOnIds: [],
    premises: [
      {
        claim: item.claim,
        variableName: item.variableName,
        unit: item.unit,
        operator: item.operator,
        thresholdValue: item.thresholdValue,
        currentValue: item.currentValue,
        decayWarningMargin: item.decayWarningMargin,
        recommendedProbe: {
          probeType: item.probeType,
          targetUrlOrQuery: item.targetUrlOrQuery,
          jsonPath: `$.metrics.${item.variableName}`,
          pollingIntervalSeconds: 60,
        },
      },
    ],
  };

  return { rawContent, compiled };
}
