import {
  ArtifactType,
  CompiledArtifactOutput,
  DecisionArtifactRecord,
  DiscoveredPremiseItem,
  Operator,
  ProbeType,
  RepoScanResult,
  RepoScanTarget,
} from "./types";
import { parseTargetLocus } from "./locus-inspector";
import { scanWorkspaceForPremises } from "./codebase-scanner";
import { resolveWorkspaceRoot } from "./workspace-root";

export interface PackageKnowledge {
  name: string;
  category:
    | "VECTOR_CACHE"
    | "QUEUE_WORKER"
    | "LLM_PROVIDER"
    | "OCR_VISION"
    | "RATE_LIMITER"
    | "CLOUD_STORAGE";
  prompt: string;
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
}

export const HEAVY_DEPENDENCY_CATALOG: Record<string, PackageKnowledge> = {
  ioredis: {
    name: "ioredis",
    category: "VECTOR_CACHE",
    prompt:
      "Why do you depend on ioredis? What upstream model pricing or inference latency bounds justify maintaining in-memory caching infrastructure?",
    variableName: "upstream_llm_input_cost_usd",
    operator: "GT",
    thresholdValue: "2.00",
    currentValue: "",
    unit: "USD / 1M tokens",
    decayWarningMargin: 0.15,
    blastRadius:
      "Decommission Redis vector cluster & committed-use FinOps contract if upstream tokens drop <= $2.00 / 1M tokens.",
    probeType: "HTTP_JSON_PATH",
    targetUrlOrQuery: "",
    jsonPath: "$.metrics.upstream_llm_input_cost_usd",
  },
  redis: {
    name: "redis",
    category: "VECTOR_CACHE",
    prompt:
      "Why do you depend on redis? What upstream latency or cost SLA justifies hosting dedicated cache microservices?",
    variableName: "upstream_ttft_p95_ms",
    operator: "GT",
    thresholdValue: "650",
    currentValue: "",
    unit: "ms",
    decayWarningMargin: 0.1,
    blastRadius:
      "Decommission Redis cluster and route requests directly to provider once P95 TTFT <= 650ms.",
    probeType: "HTTP_JSON_PATH",
    targetUrlOrQuery: "",
    jsonPath: "$.metrics.upstream_ttft_p95_ms",
  },
  "@pinecone-database/pinecone": {
    name: "@pinecone-database/pinecone",
    category: "VECTOR_CACHE",
    prompt:
      "Why do you depend on Pinecone? What monthly embedding retrieval volume or budget justifies hosted vector index pod fees?",
    variableName: "vector_embedding_cost_monthly_usd",
    operator: "LT",
    thresholdValue: "450.00",
    currentValue: "",
    unit: "USD / mo",
    decayWarningMargin: 0.1,
    blastRadius:
      "Decommission Pinecone pod reservation and revert to local Postgres pgvector if monthly index fees exceed $450/mo.",
    probeType: "SQL_METRIC",
    targetUrlOrQuery:
      "SELECT SUM(value) as val FROM MetricSample WHERE variableName = 'vector_embedding_cost_monthly_usd'",
    jsonPath: "$.value",
  },
  chromadb: {
    name: "chromadb",
    category: "VECTOR_CACHE",
    prompt:
      "Why do you depend on ChromaDB? What embedding search volume justifies running Chroma sidecar clusters?",
    variableName: "vector_query_p95_ms",
    operator: "LT",
    thresholdValue: "120",
    currentValue: "",
    unit: "ms",
    decayWarningMargin: 0.12,
    blastRadius:
      "Replace standalone Chroma server with in-process SQLite vector extension once query volume stabilizes.",
    probeType: "HTTP_JSON_PATH",
    targetUrlOrQuery: "",
    jsonPath: "$.metrics.vector_query_p95_ms",
  },
  bullmq: {
    name: "bullmq",
    category: "QUEUE_WORKER",
    prompt:
      "Why do you depend on BullMQ? What primary webhook or worker failure rate justifies maintaining outbox dead-letter queues?",
    variableName: "primary_webhook_uptime_pct",
    operator: "LT",
    thresholdValue: "99.9",
    currentValue: "",
    unit: "%",
    decayWarningMargin: 0.003,
    blastRadius:
      "Remove 1,850 LOC BullMQ dead-letter worker + secondary relay cluster once primary provider exceeds 99.9% 30-day SLA.",
    probeType: "HTTP_JSON_PATH",
    targetUrlOrQuery: "",
    jsonPath: "$.metrics.primary_webhook_uptime_pct",
  },
  "tesseract.js": {
    name: "tesseract.js",
    category: "OCR_VISION",
    prompt:
      "Why do you depend on Tesseract.js? What frontier multimodal token cost justifies bundling local OCR binaries?",
    variableName: "multimodal_vision_token_cost_usd",
    operator: "GT",
    thresholdValue: "0.015",
    currentValue: "",
    unit: "USD / image",
    decayWarningMargin: 0.15,
    blastRadius:
      "Remove 850 LOC local C++ tesseract worker and invoke upstream multimodal vision directly once cost drops <= $0.015 / image.",
    probeType: "HTTP_JSON_PATH",
    targetUrlOrQuery: "",
    jsonPath: "$.metrics.multimodal_vision_token_cost_usd",
  },
  "rate-limiter-flexible": {
    name: "rate-limiter-flexible",
    category: "RATE_LIMITER",
    prompt:
      "Why maintain custom distributed token-bucket rate limiting? What peak API abusive traffic threshold justifies cross-node Redis locks?",
    variableName: "peak_abusive_requests_per_sec",
    operator: "GT",
    thresholdValue: "800",
    currentValue: "",
    unit: "req/s",
    decayWarningMargin: 0.1,
    blastRadius:
      "Decommission Redis rate limiter cluster and rely on Cloudflare edge rate limiting if abusive traffic drops <= 800 req/s.",
    probeType: "PROMQL",
    targetUrlOrQuery:
      'max_over_time(rate(http_requests_total{status="429"}[5m]))',
    jsonPath: "$.metrics.peak_abusive_requests_per_sec",
  },
  "@anthropic-ai/sdk": {
    name: "@anthropic-ai/sdk",
    category: "LLM_PROVIDER",
    prompt:
      "Why do you direct-wire @anthropic-ai/sdk? What prompt token unit economics justify vendor lock-in over unified router?",
    variableName: "upstream_llm_input_cost_usd",
    operator: "GT",
    thresholdValue: "2.50",
    currentValue: "",
    unit: "USD / 1M tokens",
    decayWarningMargin: 0.1,
    blastRadius:
      "Migrate inference routes to open-source model gateway if upstream pricing breaches SLA.",
    probeType: "HTTP_JSON_PATH",
    targetUrlOrQuery: "",
    jsonPath: "$.metrics.upstream_llm_input_cost_usd",
  },
};

export const MOCK_REPO_PRESETS: RepoScanTarget[] = [
  {
    repoUrlOrPath: "github.com/company/core-monorepo",
    repoName: "company/core-monorepo",
    isLocal: true,
    adrCount: 2,
    manifestCount: 3,
    totalFindings: 5,
  },
  {
    repoUrlOrPath: "github.com/company/llm-gateway",
    repoName: "company/llm-gateway",
    isLocal: false,
    adrCount: 1,
    manifestCount: 1,
    totalFindings: 3,
  },
  {
    repoUrlOrPath: "github.com/company/ingest-worker",
    repoName: "company/ingest-worker",
    isLocal: false,
    adrCount: 1,
    manifestCount: 1,
    totalFindings: 2,
  },
];

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

/**
 * Scans markdown ADR decision records in `docs/adr/*.md`, `decisions/*.md`, etc.
 */
export function scanAdrFolder(
  workspaceRoot: string,
  existingArtifacts: DecisionArtifactRecord[]
): {
  discovered: DiscoveredPremiseItem[];
  adrFilesScanned: string[];
} {
  const mods = getServerFsAndPath();
  if (!mods) return { discovered: [], adrFilesScanned: [] };
  const { fs, path } = mods;

  const adrDirs = [
    path.join(workspaceRoot, "docs", "adr"),
    path.join(workspaceRoot, "decisions"),
    path.join(workspaceRoot, "docs", "decisions"),
    path.join(workspaceRoot, "examples", "demo-repo", "docs", "adr"),
  ];

  const adrFilesScanned: string[] = [];
  const discovered: DiscoveredPremiseItem[] = [];

  const existingTitles = new Set(
    existingArtifacts.map((a) => a.title.toLowerCase())
  );
  const existingVars = new Set(
    existingArtifacts.flatMap((a) => a.premises.map((p) => p.variableName.toLowerCase()))
  );

  for (const dir of adrDirs) {
    if (!fs.existsSync(dir)) continue;

    let entries: import("node:fs").Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".md")) {
        const fullPath = path.join(dir, entry.name);
        const relPath = path.relative(workspaceRoot, fullPath).replace(/\\/g, "/");
        adrFilesScanned.push(relPath);

        try {
          const content = fs.readFileSync(fullPath, "utf8");
          const items = parseAdrContent(content, relPath, existingTitles, existingVars);
          discovered.push(...items);
        } catch {
          // ignore unreadable file
        }
      }
    }
  }

  return { discovered, adrFilesScanned };
}

/**
 * Parses markdown ADR text and extracts load-bearing quantitative premises.
 */
function parseAdrContent(
  content: string,
  relPath: string,
  existingTitles: Set<string>,
  existingVars: Set<string>
): DiscoveredPremiseItem[] {
  const lines = content.split("\n");
  let title = "Architecture Decision Record";
  let targetLocus = `${relPath}:L1-L30`;
  let blastRadius = "Sunset supporting architecture if premise breaks.";

  for (const line of lines) {
    if (line.startsWith("# ")) {
      title = line.replace(/^#\s+/, "").trim();
    }
    const locusMatch = line.match(/\*\*Locus:\*\*\s*`?([^`\*\n]+)`?/i);
    if (locusMatch) {
      targetLocus = locusMatch[1].trim();
    }
    const blastMatch = line.match(/(?:Blast Radius|Sunset Criteria)[:\s*]+([^\n]+)/i);
    if (blastMatch) {
      blastRadius = blastMatch[1].replace(/^\*+/, "").replace(/\*+$/, "").trim();
    }
  }

  // Look for numeric premises in the ADR body
  // Pattern: variable_name (<|<=|>|>=|==|!=) threshold [unit]
  const premiseRegex =
    /([a-zA-Z0-9_]{3,})\s*(<=|>=|<|>|==|!=)\s*([0-9.]+)\s*([A-Za-z0-9_/%$ ]*)/g;

  const items: DiscoveredPremiseItem[] = [];
  let match: RegExpExecArray | null;

  while ((match = premiseRegex.exec(content)) !== null) {
    const varName = match[1].toLowerCase().trim();
    const opRaw = match[2];
    const threshold = match[3];
    let unit = (match[4] || "").trim();
    unit = unit
      .replace(/\s+(under|across|when|before|after|with|by|at|for|if).*$/i, "")
      .trim()
      .slice(0, 20);

    const operatorMap: Record<string, Operator> = {
      "<": "LT",
      "<=": "LTE",
      ">": "GT",
      ">=": "GTE",
      "==": "EQ",
      "!=": "NEQ",
    };
    const operator = operatorMap[opRaw] || "GT";

    const alreadyMonitored =
      existingTitles.has(title.toLowerCase()) ||
      existingVars.has(varName);

    const item: DiscoveredPremiseItem = {
      id: `adr-${relPath.replace(/[^a-zA-Z0-9]/g, "-")}-${varName}`,
      sourceType: "ADR_FOLDER",
      sourceFile: relPath,
      targetLocus,
      title,
      artifactType: "ADR",
      claim: `${title}: ${varName} ${opRaw} ${threshold} ${unit}`.trim(),
      variableName: varName,
      operator,
      thresholdValue: threshold,
      // No value until a probe reports one
      currentValue: "",
      unit,
      decayWarningMargin: 0.1,
      blastRadius,
      probeType: "HTTP_JSON_PATH",
      targetUrlOrQuery: "",
      jsonPath: `$.metrics.${varName}`,
      rawMarkdownSnippet: content.slice(0, 300),
      alreadyMonitored,
      matchedArtifactId: alreadyMonitored ? "existing" : null,
    };

    items.push(item);
  }

  // An ADR with no measurable condition yields nothing: never an invented premise
  return items;
}

/**
 * Scans dependency manifests (`package.json`, etc.) to find expensive/heavy packages.
 */
export function scanDependencyManifests(
  workspaceRoot: string,
  existingArtifacts: DecisionArtifactRecord[]
): {
  discovered: DiscoveredPremiseItem[];
  manifestsScanned: string[];
} {
  const mods = getServerFsAndPath();
  if (!mods) return { discovered: [], manifestsScanned: [] };
  const { fs, path } = mods;

  const manifestsScanned: string[] = [];
  const discovered: DiscoveredPremiseItem[] = [];

  const existingVars = new Set(
    existingArtifacts.flatMap((a) => a.premises.map((p) => p.variableName.toLowerCase()))
  );

  const checkManifest = (manifestPathAbs: string) => {
    const relPath = path.relative(workspaceRoot, manifestPathAbs).replace(/\\/g, "/");
    manifestsScanned.push(relPath);

    try {
      const raw = fs.readFileSync(manifestPathAbs, "utf8");
      const pkg = JSON.parse(raw);
      const allDeps = {
        ...(pkg.dependencies || {}),
        ...(pkg.devDependencies || {}),
      };

      for (const [depName, version] of Object.entries(allDeps)) {
        const knowledge = HEAVY_DEPENDENCY_CATALOG[depName];
        if (knowledge) {
          const dirOfManifest = path.dirname(relPath);
          const locusFile =
            pkg.main || (fs.existsSync(path.join(path.dirname(manifestPathAbs), "src")) ? "src/index.ts" : "index.ts");
          const targetLocus = `${dirOfManifest === "." ? "" : `${dirOfManifest}/`}${locusFile}:L1-L30`;

          const alreadyMonitored = existingVars.has(knowledge.variableName.toLowerCase());

          const item: DiscoveredPremiseItem = {
            id: `pkg-${depName.replace(/[^a-zA-Z0-9]/g, "-")}-${dirOfManifest.replace(/[^a-zA-Z0-9]/g, "-")}`,
            sourceType: "DEPENDENCY_MANIFEST",
            sourceFile: relPath,
            targetLocus,
            title: `Package Dependency: ${depName} (${knowledge.category})`,
            artifactType: "ADR",
            claim: `${knowledge.variableName} ${OPERATOR_SYMBOLS_LOCAL[knowledge.operator]} ${knowledge.thresholdValue} ${knowledge.unit}`,
            variableName: knowledge.variableName,
            operator: knowledge.operator,
            thresholdValue: knowledge.thresholdValue,
            currentValue: knowledge.currentValue,
            unit: knowledge.unit,
            decayWarningMargin: knowledge.decayWarningMargin,
            blastRadius: knowledge.blastRadius,
            probeType: knowledge.probeType,
            targetUrlOrQuery: knowledge.targetUrlOrQuery,
            jsonPath: knowledge.jsonPath,
            architecturalPrompt: knowledge.prompt.startsWith("Why do you depend on")
              ? knowledge.prompt
              : `Why do you depend on ${depName}? ${knowledge.prompt}`,
            detectedPackage: {
              name: depName,
              version: String(version),
              manifestPath: relPath,
              category: knowledge.category,
            },
            alreadyMonitored,
            matchedArtifactId: alreadyMonitored ? "monitored" : null,
          };

          discovered.push(item);
        }
      }
    } catch {
      // ignore invalid json
    }
  };

  const walkDirs = (dirAbs: string) => {
    let entries: import("node:fs").Dirent[] = [];
    try {
      entries = fs.readdirSync(dirAbs, { withFileTypes: true });
    } catch {
      return;
    }

    for (const e of entries) {
      if (
        e.name === "node_modules" ||
        e.name === ".next" ||
        e.name === ".git" ||
        e.name === "dist"
      ) {
        continue;
      }
      const full = path.join(dirAbs, e.name);
      if (e.isDirectory()) {
        walkDirs(full);
      } else if (e.isFile() && e.name === "package.json") {
        checkManifest(full);
      }
    }
  };

  walkDirs(workspaceRoot);
  return { discovered, manifestsScanned };
}

const OPERATOR_SYMBOLS_LOCAL: Record<Operator, string> = {
  LT: "<",
  LTE: "<=",
  GT: ">",
  GTE: ">=",
  EQ: "==",
  NEQ: "!=",
};

/**
 * Unified Repository Scanner: scans ADR files, Dependency Manifests, and Inline @premise annotations.
 */
export function scanRepositoryTarget(
  targetPathOrUrl: string,
  existingArtifacts: DecisionArtifactRecord[]
): RepoScanResult {
  const mods = getServerFsAndPath();
  const root = mods ? mods.workspaceRoot : resolveWorkspaceRoot();

  const adrResult = scanAdrFolder(root, existingArtifacts);
  const manifestResult = scanDependencyManifests(root, existingArtifacts);
  const inlineScan = scanWorkspaceForPremises(existingArtifacts);

  // Convert inline discovered items into DiscoveredPremiseItem shape
  const inlineItems: DiscoveredPremiseItem[] = inlineScan.discovered.map((d) => ({
    id: `inline-${d.id}`,
    sourceType: "INLINE_CODE",
    sourceFile: d.filePath,
    targetLocus: d.targetLocus,
    title: d.title,
    artifactType: d.type,
    claim: d.claim,
    variableName: d.variableName,
    operator: d.operator,
    thresholdValue: d.thresholdValue,
    currentValue: d.currentValue,
    unit: d.unit,
    decayWarningMargin: d.decayWarningMargin,
    blastRadius: d.blastRadius,
    probeType: d.probeType,
    targetUrlOrQuery: d.targetUrlOrQuery,
    alreadyMonitored: d.alreadyMonitored,
    matchedArtifactId: d.matchedArtifactId,
  }));

  const allDiscovered = [
    ...adrResult.discovered,
    ...manifestResult.discovered,
    ...inlineItems,
  ];

  // Deduplicate by variableName + sourceFile
  const seenKey = new Set<string>();
  const deduplicated: DiscoveredPremiseItem[] = [];

  for (const item of allDiscovered) {
    const key = `${item.sourceType}-${item.variableName}-${item.sourceFile}`;
    if (!seenKey.has(key)) {
      seenKey.add(key);
      deduplicated.push(item);
    }
  }

  const pendingCount = deduplicated.filter((d) => !d.alreadyMonitored).length;

  const catalogCounts = {
    inbox: pendingCount,
    adr: deduplicated.filter((d) => d.sourceType === "ADR_FOLDER").length,
    manifests: deduplicated.filter((d) => d.sourceType === "DEPENDENCY_MANIFEST")
      .length,
    inline: deduplicated.filter((d) => d.sourceType === "INLINE_CODE").length,
    all: deduplicated.length,
  };

  return {
    target: {
      repoUrlOrPath: targetPathOrUrl || "github.com/company/core-monorepo",
      repoName: targetPathOrUrl.includes("/")
        ? targetPathOrUrl.replace(/^github\.com\//, "")
        : "local/monorepo",
      isLocal: true,
      adrCount: adrResult.adrFilesScanned.length,
      manifestCount: manifestResult.manifestsScanned.length,
      totalFindings: deduplicated.length,
    },
    scannedAt: new Date().toISOString(),
    adrFilesScanned: adrResult.adrFilesScanned,
    manifestsScanned: manifestResult.manifestsScanned,
    discovered: deduplicated,
    pendingInboxCount: pendingCount,
    catalogCounts,
  };
}

/**
 * Converts a DiscoveredPremiseItem directly into a CompiledArtifactOutput ready for SQLite insertion.
 */
export function convertInboxItemToCompiledArtifact(
  item: DiscoveredPremiseItem
): {
  rawContent: string;
  compiled: CompiledArtifactOutput;
} {
  const rawContent = `# ${item.title}
**Discovered From:** \`${item.sourceFile}\` (${item.sourceType})
**Locus:** \`${item.targetLocus}\`

## Context & Architectural Thesis
${item.architecturalPrompt || item.claim}

## Load-Bearing Premises
1. **${item.claim}:** ${item.variableName} ${OPERATOR_SYMBOLS_LOCAL[item.operator]} ${item.thresholdValue} ${item.unit}

## Blast Radius & Sunset Criteria
${item.blastRadius}`;

  const compiled: CompiledArtifactOutput = {
    title: item.title,
    type: item.artifactType,
    targetLocus: item.targetLocus,
    blastRadius: item.blastRadius,
    logicCombinator: "ANY",
    dependsOnIds: [],
    premises: [
      {
        claim: item.claim,
        variableName: item.variableName,
        operator: item.operator,
        thresholdValue: item.thresholdValue,
        currentValue: item.currentValue,
        unit: item.unit,
        decayWarningMargin: item.decayWarningMargin,
        recommendedProbe: {
          probeType: item.probeType,
          targetUrlOrQuery: item.targetUrlOrQuery,
          jsonPath: item.jsonPath || "$.value",
          pollingIntervalSeconds: 60,
        },
      },
    ],
  };

  return { rawContent, compiled };
}
