import Anthropic from "@anthropic-ai/sdk";
import {
  ArtifactType,
  ArtifactTypeEnum,
  CompiledArtifactOutput,
  CompiledArtifactOutputSchema,
  CompiledPremise,
  LogicCombinatorEnum,
  Operator,
  OperatorEnum,
  ProbeType,
  ProbeTypeEnum,
} from "./types";
import { COMPILER_TEMPLATES } from "@/db/seed-data";
import { isPublicDemo } from "./demo-mode";

export type LlmProvider = "anthropic" | "openai";

// Docs: https://platform.claude.com/docs/en/about-claude/models/overview
export const DEFAULT_ANTHROPIC_MODEL = "claude-haiku-5-5";
// Docs: https://developers.openai.com/api/docs/models/gpt-6-luna
export const DEFAULT_OPENAI_MODEL = "gpt-6-luna";

export interface CompileResult {
  compiled: CompiledArtifactOutput;
  compilerEngine: "llm-structured-zod" | "deterministic-ast-parser";
  llmProvider?: LlmProvider;
  llmModel?: string;
  /** Set when an AI extraction was attempted and failed */
  notice?: string;
}

/**
 * Pipeline A: The Premise Compiler
 * Compiles raw ADR / GitHub PR / Strategy Memo / Vendor Contract markdown into
 * structured, Zod-validated DecisionArtifact + Premise + Probe specifications.
 * A compiled premise never carries a value, and its probe is only a suggestion.
 */
export async function compileDecisionArtifact(input: {
  rawContent: string;
  templateId?: string;
  overrideType?: ArtifactType;
  overrideTitle?: string;
  overrideLocus?: string;
}): Promise<CompileResult> {
  const { rawContent, templateId, overrideType, overrideTitle, overrideLocus } =
    input;

  // 1. Check if matches a known template unmodified
  if (templateId) {
    const matchedTemplate = COMPILER_TEMPLATES.find((t) => t.id === templateId);
    if (
      matchedTemplate &&
      rawContent.trim() === matchedTemplate.rawContent.trim()
    ) {
      const validated = CompiledArtifactOutputSchema.parse({
        ...matchedTemplate.precompiled,
        type: overrideType || matchedTemplate.precompiled.type,
        title: overrideTitle || matchedTemplate.precompiled.title,
        targetLocus: overrideLocus || matchedTemplate.precompiled.targetLocus,
      });
      return {
        compiled: asSuggestionsOnly(validated),
        compilerEngine: "deterministic-ast-parser",
      };
    }
  }

  // 2. AI extraction when a provider key is set (never in the public demo)
  let notice: string | undefined;
  const llm = resolveLlmConfig();
  if (llm && "error" in llm) {
    notice = `AI extraction failed: ${llm.error}. Used the basic parser.`;
  } else if (llm) {
    try {
      const extracted =
        llm.provider === "anthropic"
          ? await extractWithAnthropic(rawContent, llm.apiKey, llm.model)
          : await extractWithOpenAi(rawContent, llm.apiKey, llm.model);
      if (!Array.isArray(extracted.premises) || extracted.premises.length === 0) {
        throw new Error("the model found no measurable premise");
      }
      const validated = CompiledArtifactOutputSchema.parse(
        fromLlmExtraction(extracted, { overrideType, overrideTitle, overrideLocus })
      );
      return {
        compiled: asSuggestionsOnly(validated),
        compilerEngine: "llm-structured-zod",
        llmProvider: llm.provider,
        llmModel: llm.model,
      };
    } catch (err) {
      notice = `AI extraction failed: ${describeError(err)}. Used the basic parser.`;
    }
  }

  // 3. Deterministic AST & Quantitative Assertion Parser
  const deterministicResult = parseDocumentDeterministically(rawContent, {
    overrideType,
    overrideTitle,
    overrideLocus,
  });
  if (deterministicResult.premises.length === 0) {
    throw new Error(
      `${notice ? `${notice} ` : ""}No measurable premise found. Add a sentence with a number and a comparison, for example: "This holds while p95 latency stays under 300ms."`
    );
  }

  const validated = CompiledArtifactOutputSchema.parse(deterministicResult);
  return {
    compiled: asSuggestionsOnly(validated),
    compilerEngine: "deterministic-ast-parser",
    ...(notice ? { notice } : {}),
  };
}

/** Clears any value and turns every probe into an unconnected suggestion. */
function asSuggestionsOnly(compiled: CompiledArtifactOutput): CompiledArtifactOutput {
  return {
    ...compiled,
    premises: compiled.premises.map((p) => ({
      ...p,
      currentValue: "",
      recommendedProbe: {
        ...p.recommendedProbe,
        // The app's own demo feed is not a real source
        targetUrlOrQuery: p.recommendedProbe.targetUrlOrQuery.startsWith("/api/telemetry/live")
          ? ""
          : p.recommendedProbe.targetUrlOrQuery,
        valueMultiplier: p.recommendedProbe.valueMultiplier ?? 1,
        status: "UNBOUND",
      },
    })),
  };
}

function describeError(err: unknown): string {
  if (err instanceof Anthropic.APIError) {
    return `${err.status ?? "network"} ${err.message}`.trim();
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

type LlmConfig =
  | { provider: LlmProvider; apiKey: string; model: string }
  | { error: string };

/**
 * PREMISE_LLM_PROVIDER picks anthropic or openai. When unset, the first key
 * found wins: ANTHROPIC_API_KEY, then OPENAI_API_KEY. PREMISE_LLM_MODEL
 * overrides the model.
 */
export function resolveLlmConfig(): LlmConfig | null {
  if (isPublicDemo()) return null;
  const requested = process.env.PREMISE_LLM_PROVIDER?.trim().toLowerCase();
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
  const openAiKey = process.env.OPENAI_API_KEY?.trim();
  const modelOverride = process.env.PREMISE_LLM_MODEL?.trim();

  let provider: LlmProvider | null = null;
  if (requested) {
    if (requested !== "anthropic" && requested !== "openai") {
      return { error: `PREMISE_LLM_PROVIDER must be "anthropic" or "openai" (got "${requested}")` };
    }
    provider = requested;
  } else if (anthropicKey) {
    provider = "anthropic";
  } else if (openAiKey) {
    provider = "openai";
  }
  if (!provider) return null;

  const apiKey = provider === "anthropic" ? anthropicKey : openAiKey;
  if (!apiKey) {
    return {
      error: `PREMISE_LLM_PROVIDER is ${provider} but ${provider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY"} is not set`,
    };
  }
  return {
    provider,
    apiKey,
    model:
      modelOverride ||
      (provider === "anthropic" ? DEFAULT_ANTHROPIC_MODEL : DEFAULT_OPENAI_MODEL),
  };
}

const EXTRACTION_INSTRUCTIONS = `You are the Premise Compiler. Read an architecture or strategy decision document and extract its load-bearing quantitative premises: the measurable conditions under which the decision stays correct.

Rules:
- Only extract conditions the document states. Never invent numbers.
- operator is the comparison that must hold for the decision to stay correct (e.g. "only while cost is above $2" -> GT 2).
- thresholdValue is the number from the document, without currency symbols or thousands separators.
- variableName is short snake_case naming the measured thing, e.g. rds_monthly_cost_usd.
- targetLocus is the code path the document names, or "" if it names none. Never guess a path.
- blastRadius is what the document says can be removed if a premise breaks, or "" if it says nothing.
- decayWarningMargin is 0.1 unless the document suggests otherwise.`;

interface LlmExtraction {
  title: string;
  type: string;
  targetLocus: string;
  blastRadius: string;
  logicCombinator: string;
  premises: Array<{
    claim: string;
    variableName: string;
    unit: string;
    operator: string;
    thresholdValue: string;
    decayWarningMargin: number;
    probeType: string;
  }>;
}

// Strict-mode friendly: every object closed, every property required
const EXTRACTION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "type", "targetLocus", "blastRadius", "logicCombinator", "premises"],
  properties: {
    title: { type: "string" },
    type: { type: "string", enum: [...ArtifactTypeEnum.options] },
    targetLocus: { type: "string" },
    blastRadius: { type: "string" },
    logicCombinator: { type: "string", enum: [...LogicCombinatorEnum.options] },
    premises: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "claim",
          "variableName",
          "unit",
          "operator",
          "thresholdValue",
          "decayWarningMargin",
          "probeType",
        ],
        properties: {
          claim: { type: "string" },
          variableName: { type: "string" },
          unit: { type: "string" },
          operator: { type: "string", enum: [...OperatorEnum.options] },
          thresholdValue: { type: "string" },
          decayWarningMargin: { type: "number" },
          probeType: { type: "string", enum: [...ProbeTypeEnum.options] },
        },
      },
    },
  },
} as const;

// Docs: https://platform.claude.com/docs/en/build-with-claude/structured-outputs
async function extractWithAnthropic(
  rawContent: string,
  apiKey: string,
  model: string
): Promise<LlmExtraction> {
  const client = new Anthropic({ apiKey, timeout: 60_000, maxRetries: 1 });
  const response = await client.messages.create({
    model,
    max_tokens: 16000,
    system: EXTRACTION_INSTRUCTIONS,
    messages: [{ role: "user", content: rawContent }],
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: EXTRACTION_JSON_SCHEMA },
    },
  });
  if (response.stop_reason === "refusal") {
    throw new Error("the model declined the request");
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("the model's answer was cut off (max_tokens)");
  }
  const text = response.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("");
  if (!text) throw new Error("the model returned no text");
  return JSON.parse(text) as LlmExtraction;
}

// Docs: https://developers.openai.com/api/docs/guides/structured-outputs
async function extractWithOpenAi(
  rawContent: string,
  apiKey: string,
  model: string
): Promise<LlmExtraction> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        reasoning: { effort: "low" },
        input: [
          { role: "system", content: EXTRACTION_INSTRUCTIONS },
          { role: "user", content: rawContent },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "premise_extraction",
            strict: true,
            schema: EXTRACTION_JSON_SCHEMA,
          },
        },
      }),
    });
    const data = (await res.json().catch(() => null)) as {
      status?: string;
      error?: { message?: string } | null;
      incomplete_details?: { reason?: string } | null;
      output?: Array<{
        type: string;
        content?: Array<{ type: string; text?: string; refusal?: string }>;
      }>;
    } | null;
    if (!res.ok) {
      throw new Error(`OpenAI returned HTTP ${res.status}${data?.error?.message ? `: ${data.error.message}` : ""}`);
    }
    if (data?.status === "incomplete") {
      throw new Error(`OpenAI answer incomplete (${data.incomplete_details?.reason ?? "unknown reason"})`);
    }
    const content = (data?.output ?? [])
      .filter((item) => item.type === "message")
      .flatMap((item) => item.content ?? []);
    const refusal = content.find((c) => c.type === "refusal");
    if (refusal) throw new Error(`the model declined: ${refusal.refusal ?? ""}`.trim());
    const text = content
      .filter((c) => c.type === "output_text")
      .map((c) => c.text ?? "")
      .join("");
    if (!text) throw new Error("OpenAI returned no text");
    return JSON.parse(text) as LlmExtraction;
  } finally {
    clearTimeout(timer);
  }
}

function fromLlmExtraction(
  extracted: LlmExtraction,
  overrides: { overrideType?: ArtifactType; overrideTitle?: string; overrideLocus?: string }
): unknown {
  return {
    title: overrides.overrideTitle?.trim() || extracted.title,
    type: overrides.overrideType || extracted.type,
    targetLocus: overrides.overrideLocus?.trim() || extracted.targetLocus || "",
    blastRadius:
      extracted.blastRadius ||
      (extracted.targetLocus
        ? `The document does not say what to remove. Code location: ${extracted.targetLocus}.`
        : "The document does not say what to remove. No code location set."),
    logicCombinator: extracted.logicCombinator,
    premises: extracted.premises.map((p) => ({
      claim: p.claim,
      variableName: p.variableName,
      unit: p.unit,
      operator: p.operator,
      thresholdValue: String(p.thresholdValue).replace(/[$,\s]/g, ""),
      currentValue: "",
      decayWarningMargin: Math.min(0.5, Math.max(0.001, Number(p.decayWarningMargin) || 0.1)),
      recommendedProbe: {
        probeType: p.probeType,
        targetUrlOrQuery: "",
        jsonPath: "$.value",
        pollingIntervalSeconds: 300,
        valueMultiplier: 1,
        status: "UNBOUND",
      },
    })),
  };
}

function parseDocumentDeterministically(
  rawContent: string,
  overrides: {
    overrideType?: ArtifactType;
    overrideTitle?: string;
    overrideLocus?: string;
  }
): CompiledArtifactOutput {
  const lines = rawContent
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // 1. Extract Title
  let title = overrides.overrideTitle?.trim() || "";
  if (!title) {
    const headingLine = lines.find((l) => /^#+\s+/.test(l));
    if (headingLine) {
      title = headingLine.replace(/^#+\s+/, "").trim();
    } else {
      const firstLine = lines[0] || "Untitled Decision Artifact";
      title =
        firstLine.length > 72 ? `${firstLine.slice(0, 69)}...` : firstLine;
    }
  }

  // 2. Detect Artifact Type
  let type: ArtifactType = overrides.overrideType || "ADR";
  if (!overrides.overrideType) {
    const upper = rawContent.toUpperCase();
    if (/PR\s*#\d+|PULL REQUEST|GITHUB_PR/.test(upper)) {
      type = "GITHUB_PR";
    } else if (/VENDOR|CONTRACT|SLA|COMMIT|AWS|SNOWFLAKE/.test(upper) && /VENDOR/.test(upper)) {
      type = "VENDOR_CONTRACT";
    } else if (/CAC|GTM|FUNNEL|ACQUISITION|PAYBACK|COHORT|GROWTH/.test(upper)) {
      type = "STRATEGY_MEMO";
    } else {
      type = "ADR";
    }
  }

  // 3. Extract Target Locus
  let targetLocus = overrides.overrideLocus?.trim() || "";
  if (!targetLocus) {
    const locusMatch =
      rawContent.match(
        /(?:Locus|Target|Path|Budget Locus):\**\s*`?([a-zA-Z0-9_./:-]+)`?/i
      ) ||
      rawContent.match(
        /`((?:src|packages|services|infra|ops|apps|lib)\/[a-zA-Z0-9_./:-]+)`/
      );
    // No code location named in the document: leave it empty, never invent a path
    if (locusMatch?.[1]) {
      targetLocus = locusMatch[1];
    }
  }

  // 4. Extract Blast Radius
  let blastRadius = "";
  const blastSectionMatch = rawContent.match(
    /##+\s*(?:Blast Radius|Sunset|Teardown|Maintenance Cost|Obsolete)[^\n]*\n+([\s\S]*?)(?=\n##|$)/i
  );
  if (blastSectionMatch?.[1]) {
    blastRadius = blastSectionMatch[1]
      .replace(/^[-*>\s]+/gm, "")
      .replace(/\n+/g, " ")
      .trim();
  }
  if (!blastRadius) {
    const keywordSentence = rawContent
      .split(/(?<=[.!?])\s+|\n+/)
      .find((s) =>
        /(?:delete|decommission|remove|tear\s*down|maintain|obsolete|LOC|\$\d+\/mo|caching layer|failover|viable)/i.test(
          s
        )
      );
    blastRadius =
      keywordSentence?.trim() ||
      (targetLocus
        ? `The document does not say what to remove. Code location: ${targetLocus}.`
        : "The document does not say what to remove. No code location set.");
  }

  // 5. Extract Quantitative Premises
  const extractedPremises = extractQuantitativePremises(rawContent);

  return {
    title,
    type,
    targetLocus,
    blastRadius,
    logicCombinator: /\bboth\b|\ball\b/i.test(rawContent) ? "ALL" : "ANY",
    premises: extractedPremises,
  };
}

function extractQuantitativePremises(rawContent: string): CompiledPremise[] {
  const results: CompiledPremise[] = [];
  const seenVariables = new Set<string>();

  // Split document into candidate clauses (bullet points, numbered items, sentences, or clauses joined by "and")
  const rawClauses: string[] = [];
  const sentenceLines = rawContent
    .split(/\r?\n/)
    .flatMap((l) => l.split(/(?<=[.!?])\s+(?=[A-Z])/));

  for (const line of sentenceLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("**Status")) {
      continue;
    }
    // Skip blast radius / sunset lines that talk about deleting X LOC or $Y/mo cluster
    if (
      /can be deleted|can be removed|decommission|tear\s*down|must be paused|allocating\s+\$/i.test(
        trimmed
      )
    ) {
      continue;
    }

    // Check if a single sentence has multiple assertions joined by " and " (e.g. "takes >800ms and costs $15/1M tokens")
    const cleanedBullet = trimmed
      .replace(/^(\d+\.|\*|-)\s+/, "")
      .replace(/^\*\*[^*]+:\*\*\s*/, "");

    if (
      /\b(?:and|while)\b/i.test(cleanedBullet) &&
      (cleanedBullet.match(
        /(?:>=|<=|>|<|\bunder\b|\bover\b|\bexceeds\b|\bbelow\b|\babove\b|\bmore\s+than\b|\bless\s+than\b|\bfewer\s+than\b|\bcosts\b|\btakes\b)/gi
      )?.length ?? 0) >= 2
    ) {
      const subParts = cleanedBullet.split(/\s+and\s+/i);
      for (const sp of subParts) {
        const trimmedSp = sp.trim();
        if (/^(?:costs|priced\s+at)\b/i.test(trimmedSp)) {
          rawClauses.push(`Upstream token rate ${trimmedSp}`);
        } else if (/^(?:takes|latency)\b/i.test(trimmedSp)) {
          rawClauses.push(`Upstream API latency ${trimmedSp}`);
        } else {
          rawClauses.push(trimmedSp);
        }
      }
    } else {
      rawClauses.push(cleanedBullet);
    }
  }

  const comparisonRegex =
    /^(?<subject>[^<>=\n]+?)\s*(?<op>>=|<=|!=|==|>|<|\b(?:stays?\s+(?:under|below|above|over)|remains?\s+(?:under|below|above|over)|under|below|less\s+than|fewer\s+than|at\s+most|exceeds|over|above|greater\s+than|more\s+than|at\s+least|takes\s*>|takes\s*<|costs\s*>|costs\s*<|costs|is)\b)\s*(?<currency>\$)?(?<num>\d+(?:,\d{3})*(?:\.\d+)?)\s*(?<unit>%\s*|ms\b|s\b|KB\b|MB\b|GB\b|TB\s*\/\s*month\b|TB\b|\/\s*1M\s*tokens\b|per\s*1M\s*tokens\b|(?:\/|per)\s*month\b|(?:\/|per)\s*mo\b|(?:\/|per)\s*day\b|(?:\/|per)\s*week\b|\/\s*minute\b|\/\s*min\b|\/\s*GB\b|USD\b|req\/s\b)?/i;

  for (const clause of rawClauses) {
    const match = clause.match(comparisonRegex);
    if (!match || !match.groups) continue;

    const rawSubject = match.groups.subject.trim();
    const rawOp = match.groups.op.trim().toLowerCase();
    const hasDollar = Boolean(match.groups.currency);
    const numStr = match.groups.num.replace(/,/g, "");
    const rawUnit = (match.groups.unit || "").trim();

    const thresholdNum = Number(numStr);
    if (Number.isNaN(thresholdNum)) continue;

    // Determine Operator
    let operator: Operator = "GT";
    if (
      rawOp === "<" ||
      rawOp.includes("under") ||
      rawOp.includes("below") ||
      rawOp.includes("less than") ||
      rawOp.includes("fewer than") ||
      rawOp.includes("takes <") ||
      rawOp.includes("costs <")
    ) {
      operator = "LT";
    } else if (rawOp === "<=" || rawOp.includes("at most")) {
      operator = "LTE";
    } else if (rawOp === ">=" || rawOp.includes("at least")) {
      operator = "GTE";
    } else if (
      rawOp === ">" ||
      rawOp.includes("exceeds") ||
      rawOp.includes("over") ||
      rawOp.includes("above") ||
      rawOp.includes("greater than") ||
      rawOp.includes("more than") ||
      rawOp.includes("takes >") ||
      rawOp.includes("costs >") ||
      rawOp === "costs"
    ) {
      operator = "GT";
    } else if (rawOp === "!=") {
      operator = "NEQ";
    } else {
      operator = "GT";
    }

    // Determine Unit ("per month" and "/mo" both become "/ month")
    let unit = rawUnit
      .replace(/^(?:\/|per)\s*mo(?:nth)?$/i, "/ month")
      .replace(/^(?:\/|per)\s*(day|week)$/i, "/ $1");
    if (hasDollar && (!unit || /^\/\s*1M\s*tokens$/i.test(unit) || /^per\s*1M\s*tokens$/i.test(unit))) {
      unit = unit ? `USD ${unit.replace(/^per\s*/i, "/ ")}` : "USD";
    } else if (hasDollar && unit) {
      unit = `USD ${unit}`;
    } else if (!unit && /cac|cost|price|fee/i.test(rawSubject)) {
      unit = "USD";
    } else if (!unit && /latency|ttft|time|turnaround/i.test(rawSubject)) {
      unit = "ms";
    }

    // Normalize Variable Name
    const variableName = deriveVariableName(rawSubject, unit);
    if (seenVariables.has(variableName)) continue;
    seenVariables.add(variableName);

    // Choose Recommended Probe
    const recommendedProbe = buildRecommendedProbe(variableName, unit);

    // Clean claim substring so it matches text in rawContent if possible
    const fullMatchedText = match[0].trim().replace(/^[.,;:\s]+|[.,;:\s]+$/g, "");

    results.push({
      claim: fullMatchedText,
      variableName,
      unit,
      operator,
      thresholdValue: String(thresholdNum),
      // No value until a probe really reports one
      currentValue: "",
      decayWarningMargin: unit === "%" && thresholdNum >= 95 ? 0.003 : 0.1,
      recommendedProbe,
    });
  }

  return results;
}

function deriveVariableName(subject: string, unit: string): string {
  let phrase = subject
    .replace(/(\w)-(\w)/g, "$1$2") // on-call -> oncall
    .replace(/^we\s+maintain.*because\s+/i, "")
    .replace(/^.*viable\s+as\s+long\s+as\s+/i, "");

  // Keep only the clause that holds the measured thing
  const clauseSplit = phrase.split(
    /\b(?:because|while|as\s+long\s+as|so\s+long\s+as|provided\s+that|only\s+if|if|when|unless)\b/i
  );
  phrase = clauseSplit[clauseSplit.length - 1] || phrase;

  // "pages for the DB" -> "DB pages"
  const forMatch = phrase.match(/^(.*?)\s+for\s+(?:the\s+|our\s+)?(.+)$/i);
  if (forMatch) phrase = `${forMatch[2]} ${forMatch[1]}`;

  const cleaned = phrase
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .trim()
    .toLowerCase();

  const stopWords = new Set([
    "the", "a", "an", "of", "for", "in", "on", "to", "across", "our", "we", "us",
    "it", "its", "this", "that", "these", "those", "while", "because", "is", "are",
    "be", "was", "were", "would", "will", "should", "could", "can", "may", "must",
    "stays", "stay", "remains", "remain", "takes", "costs", "keeps", "keep", "at",
    "size", "only", "makes", "sense",
  ]);

  const tokens = cleaned
    .split(/\s+/)
    .filter((w) => w.length > 1 && !stopWords.has(w))
    .slice(-4);

  let base = tokens.join("_") || "monitored_metric";
  const isUsd = unit.includes("USD");
  const perMatch = unit.match(/\/\s*(month|day|week)\b/i);
  const sizeUnit = unit.match(/^(KB|MB|GB|TB)$/i)?.[1]?.toLowerCase();

  if (isUsd && perMatch) {
    // Money per period: rds_cost -> rds_monthly_cost
    const period = { month: "monthly", day: "daily", week: "weekly" }[
      perMatch[1].toLowerCase() as "month" | "day" | "week"
    ];
    base = /(^|_)cost(_|$)/.test(base)
      ? base.replace(/(^|_)cost(_|$)/, `$1${period}_cost$2`)
      : `${base}_${period}_cost`;
  }
  if (isUsd) {
    if (!base.includes("usd") && !base.includes("cac")) base += "_usd";
  } else if (perMatch) {
    base += `_per_${perMatch[1].toLowerCase()}`;
  } else if (sizeUnit) {
    if (!/size|volume|storage|memory|disk/.test(base)) base += "_size";
    base += `_${sizeUnit}`;
  } else if (unit === "ms" && !base.includes("ms") && !base.includes("latency")) {
    base += "_ms";
  } else if (unit === "%" && !base.includes("pct") && !base.includes("rate")) {
    base += "_pct";
  }
  return base;
}

/**
 * Suggests a probe type only. It has no source and stays UNBOUND
 * ("suggested, not connected") until a person sets a real one.
 */
function buildRecommendedProbe(
  variableName: string,
  unit: string
): CompiledPremise["recommendedProbe"] {
  let probeType: ProbeType = "HTTP_JSON_PATH";
  let pollingIntervalSeconds = 60;

  if (/cac|conversion|payback|cohort|churn|revenue/i.test(variableName)) {
    probeType = "WEBHOOK_INGEST";
    pollingIntervalSeconds = 600;
  } else if (/volume|tb|gb|scan|warehouse/i.test(variableName)) {
    probeType = "SQL_METRIC";
    pollingIntervalSeconds = 1800;
  } else if (unit.includes("USD") || /cost|price|fee/i.test(variableName)) {
    pollingIntervalSeconds = 300;
  }

  return {
    probeType,
    targetUrlOrQuery: "",
    jsonPath: "$.value",
    pollingIntervalSeconds,
    valueMultiplier: 1,
    status: "UNBOUND",
  };
}
