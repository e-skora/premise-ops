import {
  Operator,
  OPERATOR_SYMBOLS,
  LocusInspectionResult,
  CallerSymbolReference,
  CallerFileDiff,
  MultiFileTeardownPatch,
} from "./types";
import { resolveWorkspaceRoot } from "./workspace-root";
import { DEMO_DISABLED_MESSAGE, isPublicDemo } from "./demo-mode";

export interface ParsedLocusSpec {
  rawLocus: string;
  filePath: string;
  startLine: number | null;
  endLine: number | null;
}

/**
 * Parses a targetLocus string like:
 * - "packages/llm-gateway/src/semantic-cache.ts:L1-L34"
 * - "src/services/router.ts:L42-110"
 * - "services/ingest-worker/queue.ts:10-28"
 * - "ops/growth/paid-acquisition-budget.yaml"
 */
export function parseTargetLocus(rawLocus: string): ParsedLocusSpec {
  const trimmed = (rawLocus || "").trim();
  const match = trimmed.match(/^(.*?):L?(\d+)(?:-L?(\d+))?$/i);
  if (!match) {
    return {
      rawLocus: trimmed,
      filePath: trimmed,
      startLine: null,
      endLine: null,
    };
  }

  const filePath = match[1].trim();
  const s = Number.parseInt(match[2], 10);
  const e = match[3] ? Number.parseInt(match[3], 10) : s;
  const startLine = Number.isNaN(s) ? null : Math.max(1, s);
  const endLine =
    Number.isNaN(e) || startLine === null ? startLine : Math.max(startLine, e);

  return {
    rawLocus: trimmed,
    filePath,
    startLine,
    endLine,
  };
}

/**
 * Dynamically accesses Node/Bun fs and path only in server/CLI runtimes
 * using process.getBuiltinModule so client bundles never pull in node:fs.
 */
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
      const url = getBuiltin("node:url") as typeof import("node:url");

      let workspaceRoot = "";
      try {
        workspaceRoot = resolveWorkspaceRoot();
      } catch {
        workspaceRoot = path.resolve(
          path.dirname(url.fileURLToPath(import.meta.url)),
          "../.."
        );
      }

      return { fs, path, workspaceRoot };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Inspects a local file and line range in the repository corresponding to targetLocus.
 */
export function inspectLocalLocus(rawLocus: string): LocusInspectionResult {
  const parsed = parseTargetLocus(rawLocus);
  const serverMods = getServerFsAndPath();

  if (!serverMods || !parsed.filePath) {
    return {
      rawLocus,
      resolvedPath: parsed.filePath || "unknown",
      exists: false,
      startLine: parsed.startLine ?? 1,
      endLine: parsed.endLine ?? 1,
      totalLines: 0,
      lines: [],
      language: inferLanguage(parsed.filePath),
    };
  }

  const { fs, path, workspaceRoot } = serverMods;
  const candidates = [
    parsed.filePath,
    `${parsed.filePath}.yaml`,
    `${parsed.filePath}.yml`,
    `${parsed.filePath}.ts`,
    `${parsed.filePath}.tsx`,
  ];

  let resolvedAbsPath: string | null = null;
  let resolvedRelPath = parsed.filePath;

  for (const candidate of candidates) {
    const abs = path.resolve(workspaceRoot, candidate);
    // Ensure target stays inside the repository workspace
    if (!abs.startsWith(workspaceRoot)) continue;
    try {
      if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
        resolvedAbsPath = abs;
        resolvedRelPath = path.relative(workspaceRoot, abs).replace(/\\/g, "/");
        break;
      }
    } catch {
      // ignore
    }
  }

  if (!resolvedAbsPath) {
    return {
      rawLocus,
      resolvedPath: parsed.filePath,
      exists: false,
      startLine: parsed.startLine ?? 1,
      endLine: parsed.endLine ?? 14,
      totalLines: 0,
      lines: [],
      language: inferLanguage(parsed.filePath),
    };
  }

  try {
    const rawText = fs.readFileSync(resolvedAbsPath, "utf8");
    const allLines = rawText.replace(/\r\n/g, "\n").split("\n");
    if (allLines.length > 1 && allLines[allLines.length - 1] === "") {
      allLines.pop();
    }

    const totalLines = allLines.length;
    const startLine = Math.min(
      Math.max(1, parsed.startLine ?? 1),
      Math.max(1, totalLines)
    );
    const defaultEnd = parsed.endLine ?? Math.min(totalLines, startLine + 29);
    const endLine = Math.min(Math.max(startLine, defaultEnd), totalLines);

    const extractedLines = allLines
      .slice(startLine - 1, endLine)
      .map((content, idx) => ({
        lineNumber: startLine + idx,
        content,
      }));

    const isPatched =
      rawText.includes("[PREMISE KILL-SWITCH APPLIED]") ||
      rawText.includes("[PREMISE INVALIDATED]:");

    return {
      rawLocus,
      resolvedPath: resolvedRelPath,
      exists: true,
      startLine,
      endLine,
      totalLines,
      lines: extractedLines,
      language: inferLanguage(resolvedRelPath),
      isPatched,
    };
  } catch {
    return {
      rawLocus,
      resolvedPath: resolvedRelPath,
      exists: false,
      startLine: parsed.startLine ?? 1,
      endLine: parsed.endLine ?? 1,
      totalLines: 0,
      lines: [],
      language: inferLanguage(resolvedRelPath),
      isPatched: false,
    };
  }
}

function inferLanguage(filePath: string): string {
  const lower = (filePath || "").toLowerCase();
  if (lower.endsWith(".ts") || lower.endsWith(".tsx")) return "typescript";
  if (lower.endsWith(".yaml") || lower.endsWith(".yml")) return "yaml";
  if (lower.endsWith(".py")) return "python";
  if (lower.endsWith(".tf")) return "hcl";
  if (lower.endsWith(".json")) return "json";
  return "typescript";
}

/**
 * Generates replacement lines tailored to the actual source lines read from disk
 * so the resulting unified diff is syntactically clean and `git apply`-ready.
 */
function synthesizeReplacementLines(params: {
  inspection: LocusInspectionResult;
  artifactTitle: string;
  variableName: string;
  operatorSymbol: string;
  thresholdValue: string;
  breakingValue: string;
  unitSuffix: string;
  blastRadius: string;
  cascadedFromTitle?: string;
}): string[] {
  const {
    inspection,
    artifactTitle,
    variableName,
    operatorSymbol,
    thresholdValue,
    breakingValue,
    unitSuffix,
    blastRadius,
    cascadedFromTitle,
  } = params;

  const rawLines = inspection.lines.map((l) => l.content);
  const joined = rawLines.join("\n");

  if (inspection.language === "yaml") {
    const out: string[] = [
      `# [PREMISE KILL-SWITCH APPLIED]: ${artifactTitle}`,
      `# Trigger: ${variableName} = ${breakingValue}${unitSuffix} (Required: ${operatorSymbol} ${thresholdValue}${unitSuffix})`,
    ];
    if (cascadedFromTitle) {
      out.push(`# Cascaded From Upstream Invalidation: ${cascadedFromTitle}`);
    }
    for (const line of rawLines) {
      if (line.trim().startsWith("#")) continue;
      if (/status:\s*"ACTIVE/i.test(line)) {
        out.push(
          line.replace(/"ACTIVE[^"]*"/i, '"PAUSED_BY_PREMISE_KILLSWITCH"')
        );
      } else if (/monthly_budget_usd:\s*\d+/i.test(line)) {
        out.push(line.replace(/:\s*\d+/, ": 0"));
      } else if (/monthly_data_budget_gb:\s*\d+/i.test(line)) {
        out.push(line.replace(/:\s*\d+/, ": 0"));
      } else if (/enabled:\s*true/i.test(line)) {
        out.push(line.replace(/true/i, "false"));
      } else if (/route_via_single_az_nat:\s*true/i.test(line)) {
        out.push(line.replace(/true/i, "false"));
      } else if (/auto_renew:\s*true/i.test(line)) {
        out.push(line.replace(/true/i, "false"));
      } else if (/monthly_commit_usd:\s*\d+/i.test(line)) {
        out.push(line.replace(/:\s*\d+/, ": 0"));
      } else {
        out.push(line);
      }
    }
    return out;
  }

  // TypeScript / JavaScript intelligent AST-like signature preservation
  const headerComments = [
    `// [PREMISE KILL-SWITCH APPLIED]: ${artifactTitle}`,
    `// [PREMISE INVALIDATED]: ${variableName} reached ${breakingValue}${unitSuffix} (bound: ${operatorSymbol} ${thresholdValue}${unitSuffix})`,
    ...(cascadedFromTitle
      ? [`// [CASCADE KILL-SWITCH]: Triggered by upstream ${cascadedFromTitle}`]
      : []),
    `// Teardown Applied: ${blastRadius}`,
  ];

  if (
    joined.includes("routeInferenceWithSemanticCache") ||
    joined.includes("semantic-cache") ||
    joined.includes("computePromptEmbedding")
  ) {
    return [
      ...headerComments,
      "",
      "export interface InferenceRequest {",
      "  prompt: string;",
      "  model: string;",
      "  tenantId: string;",
      "}",
      "",
      "export async function routeInferenceWithSemanticCache(req: InferenceRequest) {",
      "  // Semantic Redis cache bypassed & decommissioned; routing directly to frontier model",
      "  return callUpstreamModelDirect(req);",
      "}",
    ];
  }

  if (joined.includes("dispatchWebhookWithFailoverOutbox")) {
    return [
      ...headerComments,
      "",
      "export interface OutboundWebhookPayload {",
      "  eventId: string;",
      "  endpointUrl: string;",
      "  body: Record<string, unknown>;",
      "}",
      "",
      "export async function dispatchWebhookWithFailoverOutbox(",
      "  payload: OutboundWebhookPayload",
      ") {",
      "  // Dual-write outbox & BullMQ secondary failover decommissioned after SLA > 99.9%",
      "  return sendToPrimaryWebhookProvider(payload);",
      "}",
    ];
  }

  // Generic TypeScript/code locus: preserve any exported function/const signatures found in the slice
  const exportedFnMatch = joined.match(
    /export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\(([^)]*)\)/
  );
  if (exportedFnMatch) {
    const fnName = exportedFnMatch[1];
    const fnArgs = exportedFnMatch[2];
    return [
      ...headerComments,
      `export async function ${fnName}(${fnArgs}) {`,
      `  throw new Error("[PREMISE_TEARDOWN]: ${fnName} decommissioned after ${variableName} breached ${operatorSymbol} ${thresholdValue}${unitSuffix}");`,
      `}`,
    ];
  }

  return [
    ...headerComments,
    `export const PREMISE_TEARDOWN_APPLIED = true;`,
  ];
}

/**
 * Builds a real `git apply`-compatible unified diff patch from the inspected local file lines.
 */
export function buildRealGitApplyPatch(params: {
  targetLocus: string;
  artifactTitle: string;
  variableName: string;
  operator: Operator;
  thresholdValue: string;
  breakingValue: string;
  unit: string;
  blastRadius: string;
  cascadedFromTitle?: string;
}): {
  inspection: LocusInspectionResult;
  unifiedDiff: string;
} {
  const inspection = inspectLocalLocus(params.targetLocus);
  const opSymbol = OPERATOR_SYMBOLS[params.operator] || params.operator;
  const unitSuffix = params.unit ? ` ${params.unit}` : "";

  if (inspection.exists && inspection.lines.length > 0) {
    const replacementLines = synthesizeReplacementLines({
      inspection,
      artifactTitle: params.artifactTitle,
      variableName: params.variableName,
      operatorSymbol: opSymbol,
      thresholdValue: params.thresholdValue,
      breakingValue: params.breakingValue,
      unitSuffix,
      blastRadius: params.blastRadius,
      cascadedFromTitle: params.cascadedFromTitle,
    });

    const oldStart = inspection.startLine;
    const oldCount = inspection.lines.length;
    const newStart = inspection.startLine;
    const newCount = replacementLines.length;

    const removedBlock = inspection.lines
      .map((l) => `-${l.content}`)
      .join("\n");
    const addedBlock = replacementLines.map((l) => `+${l}`).join("\n");

    const unifiedDiff = [
      `diff --git a/${inspection.resolvedPath} b/${inspection.resolvedPath}`,
      `--- a/${inspection.resolvedPath}`,
      `+++ b/${inspection.resolvedPath}`,
      `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`,
      removedBlock,
      addedBlock,
    ].join("\n");

    return { inspection, unifiedDiff };
  }

  // Fallback synthetic diff when targetLocus points to an external/unmounted repo path
  const cleanPath =
    parseTargetLocus(params.targetLocus).filePath || params.targetLocus;
  const fallbackDiff = [
    `diff --git a/${cleanPath} b/${cleanPath}`,
    `--- a/${cleanPath}`,
    `+++ b/${cleanPath}`,
    `@@ -1,8 +1,5 @@`,
    `-// [PREMISE-GUARD]: Bound to ${params.variableName} ${opSymbol} ${params.thresholdValue}${unitSuffix}`,
    `-// Maintaining custom workaround layer while premise holds true.`,
    `-export async function executeWithCustomWorkaround(payload: unknown) {`,
    `-  const cachedOrRelayed = await customInfrastructureLayer.process(payload);`,
    `-  if (cachedOrRelayed) return cachedOrRelayed;`,
    `-  return upstreamDirectCall(payload);`,
    `-}`,
    `+// [PREMISE INVALIDATED]: ${params.variableName} reached ${params.breakingValue}${unitSuffix} (threshold: ${opSymbol} ${params.thresholdValue}${unitSuffix})`,
    `+// Blast radius removed: ${params.blastRadius}`,
    `+export async function executeDirectBaseline(payload: unknown) {`,
    `+  return upstreamDirectCall(payload);`,
    `+}`,
  ].join("\n");

  return { inspection, unifiedDiff: fallbackDiff };
}

/**
 * Applies the synthesized teardown patch directly to the local workspace file on disk
 * and returns both the pre-patch original file content and the post-patch content.
 */
export function applyTeardownPatchToLocalFile(params: {
  targetLocus: string;
  artifactTitle: string;
  variableName: string;
  operator: Operator;
  thresholdValue: string;
  breakingValue: string;
  unit: string;
  blastRadius: string;
  cascadedFromTitle?: string;
}): {
  ok: boolean;
  resolvedPath: string;
  originalContent: string;
  patchedContent: string;
  inspection: LocusInspectionResult;
  error?: string;
} {
  const serverMods = getServerFsAndPath();
  const inspection = inspectLocalLocus(params.targetLocus);

  if (isPublicDemo()) {
    return {
      ok: false,
      resolvedPath: inspection.resolvedPath,
      originalContent: "",
      patchedContent: "",
      inspection,
      error: DEMO_DISABLED_MESSAGE,
    };
  }

  if (!serverMods || !inspection.exists) {
    return {
      ok: false,
      resolvedPath: inspection.resolvedPath,
      originalContent: "",
      patchedContent: "",
      inspection,
      error: `Local file at locus '${params.targetLocus}' does not exist in workspace`,
    };
  }

  const { fs, path, workspaceRoot } = serverMods;
  const absPath = path.resolve(workspaceRoot, inspection.resolvedPath);
  if (!absPath.startsWith(workspaceRoot)) {
    return {
      ok: false,
      resolvedPath: inspection.resolvedPath,
      originalContent: "",
      patchedContent: "",
      inspection,
      error: "Target file resolves outside repository workspace",
    };
  }

  const originalContent = fs.readFileSync(absPath, "utf8");
  const allLines = originalContent.replace(/\r\n/g, "\n").split("\n");
  const hadTrailingNewline = originalContent.endsWith("\n");
  if (allLines.length > 1 && allLines[allLines.length - 1] === "") {
    allLines.pop();
  }

  const opSymbol = OPERATOR_SYMBOLS[params.operator] || params.operator;
  const unitSuffix = params.unit ? ` ${params.unit}` : "";

  const replacementLines = synthesizeReplacementLines({
    inspection,
    artifactTitle: params.artifactTitle,
    variableName: params.variableName,
    operatorSymbol: opSymbol,
    thresholdValue: params.thresholdValue,
    breakingValue: params.breakingValue,
    unitSuffix,
    blastRadius: params.blastRadius,
    cascadedFromTitle: params.cascadedFromTitle,
  });

  const beforeSlice = allLines.slice(0, inspection.startLine - 1);
  const afterSlice = allLines.slice(inspection.endLine);
  const nextLines = [...beforeSlice, ...replacementLines, ...afterSlice];
  const patchedContent =
    nextLines.join("\n") + (hadTrailingNewline ? "\n" : "");

  fs.writeFileSync(absPath, patchedContent, "utf8");

  return {
    ok: true,
    resolvedPath: inspection.resolvedPath,
    originalContent,
    patchedContent,
    inspection: inspectLocalLocus(params.targetLocus),
  };
}

/**
 * Restores exact original file content to a workspace file path and re-inspects the locus.
 */
export function writeExactFileContentToLocus(
  rawLocus: string,
  resolvedPath: string,
  originalContent: string
): {
  ok: boolean;
  inspection: LocusInspectionResult;
  error?: string;
} {
  if (isPublicDemo()) {
    return {
      ok: false,
      inspection: inspectLocalLocus(rawLocus),
      error: DEMO_DISABLED_MESSAGE,
    };
  }
  const serverMods = getServerFsAndPath();
  if (!serverMods) {
    return {
      ok: false,
      inspection: inspectLocalLocus(rawLocus),
      error: "Filesystem unavailable in client environment",
    };
  }

  const { fs, path, workspaceRoot } = serverMods;
  const absPath = path.resolve(workspaceRoot, resolvedPath);
  if (!absPath.startsWith(workspaceRoot)) {
    return {
      ok: false,
      inspection: inspectLocalLocus(rawLocus),
      error: "Target file resolves outside repository workspace",
    };
  }

  fs.writeFileSync(absPath, originalContent, "utf8");
  return {
    ok: true,
    inspection: inspectLocalLocus(rawLocus),
  };
}

// ============================================================================
// Horizon E: Multi-File Caller Blast Radius Scanner & Multi-File Diff Generator
// ============================================================================

/**
 * Extracts exported functions, classes, interfaces, types, and variables
 * from source code text.
 */
export function extractExportedSymbols(content: string): string[] {
  const symbols = new Set<string>();

  // 1. export (async) function foo
  const funcRegex = /export\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)/g;
  let match: RegExpExecArray | null;
  while ((match = funcRegex.exec(content)) !== null) {
    if (match[1]) symbols.add(match[1]);
  }

  // 2. export const/let/var foo
  const varRegex = /export\s+(?:const|let|var)\s+([A-Za-z0-9_$]+)/g;
  while ((match = varRegex.exec(content)) !== null) {
    if (match[1]) symbols.add(match[1]);
  }

  // 3. export class Foo
  const classRegex = /export\s+class\s+([A-Za-z0-9_$]+)/g;
  while ((match = classRegex.exec(content)) !== null) {
    if (match[1]) symbols.add(match[1]);
  }

  // 4. export interface Foo / export type Foo
  const typeRegex = /export\s+(?:interface|type)\s+([A-Za-z0-9_$]+)/g;
  while ((match = typeRegex.exec(content)) !== null) {
    if (match[1]) symbols.add(match[1]);
  }

  // 5. export { foo, bar as baz }
  const namedRegex = /export\s*\{([^}]+)\}/g;
  while ((match = namedRegex.exec(content)) !== null) {
    const clause = match[1];
    for (const token of clause.split(",")) {
      const parts = token.trim().split(/\s+as\s+/);
      const name = parts[parts.length - 1]?.trim();
      if (name && /^[A-Za-z0-9_$]+$/.test(name)) {
        symbols.add(name);
      }
    }
  }

  return Array.from(symbols);
}

/**
 * Recursively walks directory tree collecting candidate source code files.
 */
function walkWorkspaceFiles(
  dir: string,
  fs: typeof import("node:fs"),
  path: typeof import("node:path"),
  fileList: string[] = []
): string[] {
  try {
    if (!fs.existsSync(dir)) return fileList;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        const base = ent.name;
        if (
          base === "node_modules" ||
          base === ".next" ||
          base === ".git" ||
          base === "dist" ||
          base === "__tests__" ||
          base === "src" ||
          base === ".system_generated" ||
          base.startsWith(".")
        ) {
          continue;
        }
        walkWorkspaceFiles(full, fs, path, fileList);
      } else if (ent.isFile()) {
        if (ent.name.includes(".test.") || ent.name.includes(".spec.")) {
          continue;
        }
        const ext = path.extname(ent.name).toLowerCase();
        if (
          ext === ".ts" ||
          ext === ".tsx" ||
          ext === ".js" ||
          ext === ".jsx" ||
          ext === ".mjs" ||
          ext === ".py" ||
          ext === ".yaml" ||
          ext === ".yml"
        ) {
          fileList.push(full);
        }
      }
    }
  } catch {
    // Ignore unreadable dirs
  }
  return fileList;
}

/**
 * Discovers all files in the repository that import or reference
 * the exported symbols from the invalidated target locus.
 */
export function discoverCallerBlastRadius(targetLocus: string): {
  symbols: string[];
  references: CallerSymbolReference[];
  callerFilePaths: string[];
  callersByFile: Map<string, CallerSymbolReference[]>;
} {
  const serverMods = getServerFsAndPath();
  const parsed = parseTargetLocus(targetLocus);
  const inspection = inspectLocalLocus(targetLocus);

  if (!serverMods || !inspection.exists) {
    return {
      symbols: [],
      references: [],
      callerFilePaths: [],
      callersByFile: new Map(),
    };
  }

  const { fs, path, workspaceRoot } = serverMods;
  const absTarget = path.resolve(workspaceRoot, inspection.resolvedPath);
  const targetRel = path
    .relative(workspaceRoot, absTarget)
    .replace(/\\/g, "/");

  let targetContent = "";
  try {
    targetContent = fs.readFileSync(absTarget, "utf8");
  } catch {
    return {
      symbols: [],
      references: [],
      callerFilePaths: [],
      callersByFile: new Map(),
    };
  }

  const symbols = extractExportedSymbols(targetContent);
  const searchRoots = ["packages", "services", "src", "apps", "infra", "ops"];
  const allWorkspaceFiles: string[] = [];

  for (const root of searchRoots) {
    const fullRoot = path.resolve(workspaceRoot, root);
    walkWorkspaceFiles(fullRoot, fs, path, allWorkspaceFiles);
  }

  const references: CallerSymbolReference[] = [];
  const callersByFile = new Map<string, CallerSymbolReference[]>();

  // Determine potential import path tokens for this locus (e.g. "semantic-cache", "@company/llm-gateway")
  const locusBaseName = path.basename(parsed.filePath, path.extname(parsed.filePath));

  for (const candidateAbs of allWorkspaceFiles) {
    if (candidateAbs === absTarget) continue;
    const candidateRel = path
      .relative(workspaceRoot, candidateAbs)
      .replace(/\\/g, "/");

    let fileText = "";
    try {
      fileText = fs.readFileSync(candidateAbs, "utf8");
    } catch {
      continue;
    }

    const lines = fileText.replace(/\r\n/g, "\n").split("\n");
    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx];
      const isImport =
        line.trim().startsWith("import ") ||
        line.trim().startsWith("from ") ||
        line.includes("require(");

      for (const sym of symbols) {
        // Look for exact word boundary match of the symbol
        const wordRegex = new RegExp(`\\b${sym}\\b`);
        if (wordRegex.test(line)) {
          const ref: CallerSymbolReference = {
            symbolName: sym,
            filePath: candidateRel,
            lineNumber: idx + 1,
            lineContent: line,
            isImportStatement: isImport,
          };
          references.push(ref);
          const fileRefs = callersByFile.get(candidateRel) || [];
          fileRefs.push(ref);
          callersByFile.set(candidateRel, fileRefs);
          break;
        }
      }

      // Also check if line imports from this file directly even if individual symbol name wasn't detected
      if (
        isImport &&
        (line.includes(locusBaseName) || line.includes(targetRel))
      ) {
        const alreadyRecorded = (callersByFile.get(candidateRel) || []).some(
          (r) => r.lineNumber === idx + 1
        );
        if (!alreadyRecorded) {
          const ref: CallerSymbolReference = {
            symbolName: locusBaseName,
            filePath: candidateRel,
            lineNumber: idx + 1,
            lineContent: line,
            isImportStatement: true,
          };
          references.push(ref);
          const fileRefs = callersByFile.get(candidateRel) || [];
          fileRefs.push(ref);
          callersByFile.set(candidateRel, fileRefs);
        }
      }
    }
  }

  const callerFilePaths = Array.from(callersByFile.keys());
  return {
    symbols,
    references,
    callerFilePaths,
    callersByFile,
  };
}

/**
 * Synthesizes a unified diff for a caller file referencing the invalidated locus export,
 * removing or bypassing the obsolete workaround.
 */
export function synthesizeCallerDiff(params: {
  callerRelPath: string;
  matchedSymbols: string[];
  referenceLines: CallerSymbolReference[];
  artifactTitle: string;
  variableName: string;
  breakingValue: string;
  thresholdValue: string;
  unit: string;
  blastRadius: string;
}): CallerFileDiff | null {
  const serverMods = getServerFsAndPath();
  if (!serverMods) return null;

  const { fs, path, workspaceRoot } = serverMods;
  const absPath = path.resolve(workspaceRoot, params.callerRelPath);

  let rawContent = "";
  try {
    rawContent = fs.readFileSync(absPath, "utf8");
  } catch {
    return null;
  }

  const originalLines = rawContent.replace(/\r\n/g, "\n").split("\n");
  const replacementLines: string[] = [];
  const refLineNumbers = new Set(params.referenceLines.map((r) => r.lineNumber));

  const unitSuffix = params.unit ? ` ${params.unit}` : "";

  for (let idx = 0; idx < originalLines.length; idx++) {
    const lineNum = idx + 1;
    const line = originalLines[idx];

    if (refLineNumbers.has(lineNum)) {
      const isImport =
        line.trim().startsWith("import ") || line.includes("require(");

      if (isImport) {
        replacementLines.push(
          `// [PREMISE KILL-SWITCH DEPRECATION]: ${params.artifactTitle}`,
          `// Obsolete workaround export bypassed: ${params.matchedSymbols.join(", ")}`,
          `// Telemetry breach: ${params.variableName} reached ${params.breakingValue}${unitSuffix}`
        );
        if (line.includes("routeInferenceWithSemanticCache")) {
          replacementLines.push(
            line.replace(
              /routeInferenceWithSemanticCache/g,
              "callUpstreamModelDirect"
            )
          );
        } else {
          replacementLines.push(`// ${line}`);
        }
      } else if (line.includes("routeInferenceWithSemanticCache")) {
        replacementLines.push(
          `  // [PREMISE KILL-SWITCH]: Bypassed custom semantic vector cache (direct frontier call)`,
          line.replace(
            /routeInferenceWithSemanticCache/g,
            "callUpstreamModelDirect"
          )
        );
      } else if (line.includes("dispatchWebhookWithFailoverOutbox")) {
        replacementLines.push(
          `  // [PREMISE KILL-SWITCH]: Bypassed secondary failover queue (provider SLA >= 99.9%)`,
          line.replace(
            /dispatchWebhookWithFailoverOutbox/g,
            "sendToPrimaryWebhookProvider"
          )
        );
      } else {
        replacementLines.push(
          `  // [PREMISE KILL-SWITCH]: Bypassed obsolete reference to ${params.matchedSymbols.join(", ")}`,
          `  // ${line.trim()}`
        );
      }
    } else {
      replacementLines.push(line);
    }
  }

  const newContent = replacementLines.join("\n");
  const cleanPath = params.callerRelPath.replace(/\\/g, "/");

  // Construct standard git diff hunk
  const diffHunks: string[] = [
    `--- a/${cleanPath}`,
    `+++ b/${cleanPath}`,
    `@@ -1,${Math.min(10, originalLines.length)} +1,${Math.min(14, replacementLines.length)} @@`,
  ];

  for (let i = 0; i < Math.min(originalLines.length, 12); i++) {
    if (refLineNumbers.has(i + 1)) {
      diffHunks.push(`-${originalLines[i]}`);
      const corresponding = replacementLines[i];
      if (corresponding) {
        diffHunks.push(`+${corresponding}`);
      }
    }
  }

  const unifiedDiff = diffHunks.join("\n");

  return {
    filePath: cleanPath,
    absolutePath: absPath,
    matchedSymbols: params.matchedSymbols,
    referenceLines: Array.from(refLineNumbers),
    unifiedDiff,
    originalContent: rawContent,
    replacementContent: newContent,
  };
}

/**
 * Builds a comprehensive Multi-File Teardown Patch combining the primary
 * target locus diff and all discovered caller files diffs into a unified multi-file patch.
 */
export function buildMultiFileTeardownPatch(params: {
  targetLocus: string;
  artifactTitle: string;
  variableName: string;
  operator: Operator;
  thresholdValue: string;
  breakingValue: string;
  unit: string;
  blastRadius: string;
  cascadedFromTitle?: string;
}): MultiFileTeardownPatch {
  const { inspection, unifiedDiff: primaryUnifiedDiff } =
    buildRealGitApplyPatch(params);

  const callerDiscovery = discoverCallerBlastRadius(params.targetLocus);
  const callerFiles: CallerFileDiff[] = [];

  for (const [callerPath, refs] of callerDiscovery.callersByFile.entries()) {
    const callerSymbols = Array.from(new Set(refs.map((r) => r.symbolName)));
    const callerDiff = synthesizeCallerDiff({
      callerRelPath: callerPath,
      matchedSymbols: callerSymbols,
      referenceLines: refs,
      artifactTitle: params.artifactTitle,
      variableName: params.variableName,
      breakingValue: params.breakingValue,
      thresholdValue: params.thresholdValue,
      unit: params.unit,
      blastRadius: params.blastRadius,
    });
    if (callerDiff) {
      callerFiles.push(callerDiff);
    }
  }

  // Combine diffs in standard multi-file git format
  const combinedDiffParts: string[] = [primaryUnifiedDiff];
  for (const c of callerFiles) {
    combinedDiffParts.push(c.unifiedDiff);
  }
  const combinedUnifiedDiff = combinedDiffParts.join("\n\n");

  let totalLinesChanged = 0;
  for (const line of combinedUnifiedDiff.split("\n")) {
    if (
      (line.startsWith("+") && !line.startsWith("+++")) ||
      (line.startsWith("-") && !line.startsWith("---"))
    ) {
      totalLinesChanged++;
    }
  }

  return {
    targetLocus: params.targetLocus,
    primaryFilePath: inspection.resolvedPath,
    primaryUnifiedDiff,
    callerFiles,
    combinedUnifiedDiff,
    totalFilesAffected: 1 + callerFiles.length,
    totalLinesChanged,
    discoveredSymbols: callerDiscovery.symbols,
  };
}

/**
 * Applies the entire multi-file teardown patch directly to local disk
 * (primary locus + all caller files) and records backups.
 */
export function applyMultiFileTeardownPatch(params: {
  targetLocus: string;
  artifactTitle: string;
  variableName: string;
  operator: Operator;
  thresholdValue: string;
  breakingValue: string;
  unit: string;
  blastRadius: string;
  cascadedFromTitle?: string;
}): {
  ok: boolean;
  multiFilePatch: MultiFileTeardownPatch;
  affectedFiles: string[];
  primaryOriginalContent?: string;
  primaryPatchedContent?: string;
  primaryResolvedPath?: string;
  error?: string;
} {
  const multiFilePatch = buildMultiFileTeardownPatch(params);
  const primaryRes = applyTeardownPatchToLocalFile(params);

  if (!primaryRes.ok) {
    return {
      ok: false,
      multiFilePatch,
      affectedFiles: [],
      error: primaryRes.error,
    };
  }

  const serverMods = getServerFsAndPath();
  const affectedFiles = [primaryRes.resolvedPath];

  if (serverMods) {
    const { fs } = serverMods;
    for (const caller of multiFilePatch.callerFiles) {
      try {
        fs.writeFileSync(caller.absolutePath, caller.replacementContent, "utf8");
        affectedFiles.push(caller.filePath);
      } catch {
        // Ignore individual caller write errors
      }
    }
  }

  return {
    ok: true,
    multiFilePatch,
    affectedFiles,
    primaryOriginalContent: primaryRes.originalContent,
    primaryPatchedContent: primaryRes.patchedContent,
    primaryResolvedPath: primaryRes.resolvedPath,
  };
}


