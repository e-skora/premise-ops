import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_OPENAI_MODEL,
  compileDecisionArtifact,
  resolveLlmConfig,
} from "../lib/compiler";
import { COMPILER_TEMPLATES } from "../db/seed-data";

const ADR_021 = `# ADR-021: Self-host Postgres instead of RDS
We run our own Postgres on EC2 because RDS would cost more than $1,800 per month at our size.
This only makes sense while our database stays under 2 TB and on-call pages for the DB stay below 3 per month.`;

const LLM_ENV = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "PREMISE_LLM_PROVIDER",
  "PREMISE_LLM_MODEL",
  "PREMISE_PUBLIC_DEMO",
];

const EXTRACTION = {
  title: "ADR-021: Self-host Postgres instead of RDS",
  type: "ADR",
  targetLocus: "",
  blastRadius: "",
  logicCombinator: "ANY",
  premises: [
    {
      claim: "RDS would cost more than $1,800 per month",
      variableName: "rds_monthly_cost_usd",
      unit: "USD / month",
      operator: "GT",
      thresholdValue: "1,800",
      decayWarningMargin: 0.1,
      probeType: "HTTP_JSON_PATH",
    },
  ],
};

let originalFetch: typeof fetch;
let requests: Array<{ url: string; body: any }>;

function mockFetch(respond: (url: string) => Response) {
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const rawBody = init?.body ?? (input instanceof Request ? await input.clone().text() : undefined);
    requests.push({ url, body: typeof rawBody === "string" ? JSON.parse(rawBody) : rawBody });
    return respond(url);
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  originalFetch = globalThis.fetch;
  requests = [];
  for (const key of LLM_ENV) delete process.env[key];
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const key of LLM_ENV) delete process.env[key];
});

describe("Deterministic compiler", () => {
  test("ADR-021 yields three premises with readable names and no values", async () => {
    const res = await compileDecisionArtifact({ rawContent: ADR_021 });
    expect(res.compilerEngine).toBe("deterministic-ast-parser");
    expect(res.notice).toBeUndefined();

    const byName = Object.fromEntries(res.compiled.premises.map((p) => [p.variableName, p]));
    expect(Object.keys(byName).sort()).toEqual([
      "database_size_tb",
      "db_oncall_pages_per_month",
      "rds_monthly_cost_usd",
    ]);
    expect(byName.rds_monthly_cost_usd.operator).toBe("GT");
    expect(byName.rds_monthly_cost_usd.thresholdValue).toBe("1800");
    expect(byName.rds_monthly_cost_usd.unit).toBe("USD / month");
    expect(byName.database_size_tb.operator).toBe("LT");
    expect(byName.database_size_tb.thresholdValue).toBe("2");
    expect(byName.database_size_tb.unit).toBe("TB");
    expect(byName.db_oncall_pages_per_month.operator).toBe("LT");
    expect(byName.db_oncall_pages_per_month.thresholdValue).toBe("3");

    for (const p of res.compiled.premises) {
      expect(p.currentValue).toBe("");
      expect(p.recommendedProbe.status).toBe("UNBOUND");
      expect(p.recommendedProbe.targetUrlOrQuery).toBe("");
    }
  });

  test("a document with no code location gets an empty locus, never an invented path", async () => {
    const res = await compileDecisionArtifact({ rawContent: ADR_021 });
    expect(res.compiled.targetLocus).toBe("");
    expect(res.compiled.blastRadius).toContain("No code location set");
    expect(res.compiled.blastRadius).not.toContain("workaround-layer");
  });

  test("a document with no measurable premise is an error, not a made-up premise", async () => {
    await expect(
      compileDecisionArtifact({ rawContent: "# ADR-1\nWe like Postgres. It is nice." })
    ).rejects.toThrow("No measurable premise found");
  });

  test("templates come back as suggestions with no values", async () => {
    const tpl = COMPILER_TEMPLATES[0];
    const res = await compileDecisionArtifact({ rawContent: tpl.rawContent, templateId: tpl.id });
    for (const p of res.compiled.premises) {
      expect(p.currentValue).toBe("");
      expect(p.recommendedProbe.status).toBe("UNBOUND");
      expect(p.recommendedProbe.targetUrlOrQuery.startsWith("/api/telemetry/live")).toBe(false);
    }
  });
});

describe("LLM provider selection", () => {
  test("no keys means no AI call and no notice", () => {
    expect(resolveLlmConfig()).toBeNull();
  });

  test("Anthropic wins when both keys exist; models default per provider", () => {
    process.env.ANTHROPIC_API_KEY = "test-anthropic";
    process.env.OPENAI_API_KEY = "test-openai";
    expect(resolveLlmConfig()).toEqual({
      provider: "anthropic",
      apiKey: "test-anthropic",
      model: DEFAULT_ANTHROPIC_MODEL,
    });
    delete process.env.ANTHROPIC_API_KEY;
    expect(resolveLlmConfig()).toEqual({
      provider: "openai",
      apiKey: "test-openai",
      model: DEFAULT_OPENAI_MODEL,
    });
  });

  test("PREMISE_LLM_PROVIDER and PREMISE_LLM_MODEL override; no sk- prefix needed", () => {
    process.env.ANTHROPIC_API_KEY = "test-anthropic";
    process.env.OPENAI_API_KEY = "no-prefix-key";
    process.env.PREMISE_LLM_PROVIDER = "openai";
    process.env.PREMISE_LLM_MODEL = "custom-model";
    expect(resolveLlmConfig()).toEqual({
      provider: "openai",
      apiKey: "no-prefix-key",
      model: "custom-model",
    });
  });

  test("the public demo never calls a model", () => {
    process.env.ANTHROPIC_API_KEY = "test-anthropic";
    process.env.PREMISE_PUBLIC_DEMO = "1";
    expect(resolveLlmConfig()).toBeNull();
  });
});

describe("LLM extraction", () => {
  test("a failed AI call falls back to the basic parser and says so", async () => {
    process.env.ANTHROPIC_API_KEY = "test-anthropic";
    // The test preload's fetch guard refuses the request
    const res = await compileDecisionArtifact({ rawContent: ADR_021 });
    expect(res.compilerEngine).toBe("deterministic-ast-parser");
    expect(res.notice).toStartWith("AI extraction failed: ");
    expect(res.notice).toEndWith("Used the basic parser.");
    expect(res.compiled.premises.length).toBe(3);
  });

  test("a chosen provider with no key is reported, not skipped silently", async () => {
    process.env.PREMISE_LLM_PROVIDER = "openai";
    const res = await compileDecisionArtifact({ rawContent: ADR_021 });
    expect(res.notice).toContain("OPENAI_API_KEY is not set");
    expect(res.notice).toEndWith("Used the basic parser.");
  });

  test("Anthropic Messages API with a JSON schema output format", async () => {
    process.env.ANTHROPIC_API_KEY = "test-anthropic";
    mockFetch(() =>
      Response.json({
        id: "msg_test",
        type: "message",
        role: "assistant",
        model: DEFAULT_ANTHROPIC_MODEL,
        content: [{ type: "text", text: JSON.stringify(EXTRACTION) }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 10 },
      })
    );
    const res = await compileDecisionArtifact({ rawContent: ADR_021 });

    expect(requests[0].url).toBe("https://api.anthropic.com/v1/messages");
    expect(requests[0].body.model).toBe(DEFAULT_ANTHROPIC_MODEL);
    expect(requests[0].body.output_config.format.type).toBe("json_schema");
    expect(requests[0].body.temperature).toBeUndefined();
    expect(res.compilerEngine).toBe("llm-structured-zod");
    expect(res.llmProvider).toBe("anthropic");
    expect(res.compiled.premises[0].thresholdValue).toBe("1800");
    expect(res.compiled.premises[0].currentValue).toBe("");
    expect(res.compiled.premises[0].recommendedProbe.status).toBe("UNBOUND");
    expect(res.compiled.blastRadius).toContain("No code location set");
  });

  test("OpenAI Responses API with a strict JSON schema", async () => {
    process.env.OPENAI_API_KEY = "test-openai";
    mockFetch(() =>
      Response.json({
        status: "completed",
        output: [
          { type: "reasoning", summary: [] },
          {
            type: "message",
            content: [{ type: "output_text", text: JSON.stringify(EXTRACTION) }],
          },
        ],
      })
    );
    const res = await compileDecisionArtifact({ rawContent: ADR_021 });

    expect(requests[0].url).toBe("https://api.openai.com/v1/responses");
    expect(requests[0].body.model).toBe(DEFAULT_OPENAI_MODEL);
    expect(requests[0].body.text.format.type).toBe("json_schema");
    expect(requests[0].body.text.format.strict).toBe(true);
    expect(res.compilerEngine).toBe("llm-structured-zod");
    expect(res.llmProvider).toBe("openai");
    expect(res.compiled.premises[0].variableName).toBe("rds_monthly_cost_usd");
  });

  test("an OpenAI error body is shown in the notice", async () => {
    process.env.OPENAI_API_KEY = "test-openai";
    mockFetch(() =>
      Response.json({ error: { message: "Incorrect API key provided" } }, { status: 401 })
    );
    const res = await compileDecisionArtifact({ rawContent: ADR_021 });
    expect(res.notice).toContain("HTTP 401");
    expect(res.notice).toContain("Incorrect API key provided");
  });
});
