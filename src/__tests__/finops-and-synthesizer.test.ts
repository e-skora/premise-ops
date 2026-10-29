import { describe, expect, test, beforeEach, afterAll } from "bun:test";
import {
  evaluateAndPersistMetricUpdate,
  getAllArtifactsWithRelations,
  getAllInvalidationEvents,
  resetDatabaseToSeed,
  rollbackAllPatchedLoci,
} from "../db";
import {
  calculateArtifactDrag,
  calculateFinOpsLedger,
  formatUsd,
} from "../lib/finops-engine";
import {
  discoverCallerBlastRadius,
  buildMultiFileTeardownPatch,
} from "../lib/locus-inspector";
import { synthesizeReplacementAdr } from "../lib/sunset-synthesizer";
import { retireAndPromoteArtifact } from "../lib/sunset-synthesizer-server";
import { CompiledArtifactOutputSchema } from "../lib/types";

describe("Horizon E: Architecture Balance Sheet, Inefficiency Drag Ledger & Autonomous Sunset Synthesizer", () => {
  beforeEach(() => {
    rollbackAllPatchedLoci();
    resetDatabaseToSeed();
  });

  afterAll(() => {
    rollbackAllPatchedLoci();
  });

  describe("FinOps Drag Calculations & Currency Formatting", () => {
    test("formatUsd correctly formats zero, whole numbers, decimals, and negative values", () => {
      expect(formatUsd(0)).toBe("$0");
      expect(formatUsd(600)).toBe("$600");
      expect(formatUsd(1234.56)).toBe("$1,234.56");
      expect(formatUsd(48800)).toBe("$48,800");
      expect(formatUsd(-500)).toBe("-$500");
    });

    test("calculateArtifactDrag accurately computes cloud spend, blended engineering drag, and daily rate", () => {
      const allArts = getAllArtifactsWithRelations();
      const adr014 = allArts.find((a) => a.id === "art-adr-014")!;

      // ADR-014: monthlyCloudSpend = $600, maint = 14 hrs
      // Default rate = $150/hr => Eng drag = 14 * 150 = $2,100
      // Total monthly drag = $600 + $2,100 = $2,700
      // Daily drag = $2,700 / 30 = $90/day
      // Annualized drag = $2,700 * 12 = $32,400/yr
      const breakdown = calculateArtifactDrag(adr014);

      expect(breakdown.artifactId).toBe("art-adr-014");
      expect(breakdown.monthlyCloudSpendUsd).toBe(600);
      expect(breakdown.maintenanceHoursPerMonth).toBe(14);
      expect(breakdown.blendedEngCostMonthlyUsd).toBe(2100);
      expect(breakdown.totalMonthlyDragUsd).toBe(2700);
      expect(breakdown.dailyDragUsd).toBe(90);
      expect(breakdown.annualizedDragUsd).toBe(32400);
      expect(breakdown.targetLocus).toContain("semantic-cache.ts");
    });

    test("calculateFinOpsLedger aggregates total drag and distinguishes decaying vs broken drag", () => {
      const allArts = getAllArtifactsWithRelations();
      const allEvents = getAllInvalidationEvents();

      const ledger = calculateFinOpsLedger(allArts, allEvents);

      expect(ledger.totalTrackedDecisions).toBe(allArts.length);
      expect(ledger.invalidatedDecisionsCount).toBe(0);
      // ADR-014 and GTM-Q3 have premises in DECAYING state in seed data
      expect(ledger.decayingDecisionsCount).toBeGreaterThanOrEqual(1);
      expect(ledger.totalActiveDragMonthlyUsd).toBeGreaterThan(0);
      expect(ledger.totalActiveDragDailyUsd).toBeGreaterThan(0);
      expect(ledger.wastedEngHoursPerMonth).toBeGreaterThan(0);

      // Mutate ADR-014 to BROKEN to test activeInvalidationMonthlyDragUsd
      evaluateAndPersistMetricUpdate({
        variableName: "upstream_llm_input_cost_usd",
        value: 1.10,
        source: "test-finops",
      });

      const updatedArts = getAllArtifactsWithRelations();
      const updatedEvents = getAllInvalidationEvents();
      const updatedLedger = calculateFinOpsLedger(updatedArts, updatedEvents);

      expect(updatedLedger.invalidatedDecisionsCount).toBeGreaterThanOrEqual(1);
      expect(updatedLedger.activeInvalidationMonthlyDragUsd).toBeGreaterThanOrEqual(2700);
    });
  });

  describe("Autonomous Sunset Synthesizer (Replacement ADR Formulations)", () => {
    test("synthesizes ADR-015: Direct Frontier Streaming + Prompt Caching when ADR-014 breaches", () => {
      // Trigger breach on ADR-014
      evaluateAndPersistMetricUpdate({
        variableName: "upstream_llm_input_cost_usd",
        value: 1.25,
        source: "test-synthesizer",
      });

      const allArts = getAllArtifactsWithRelations();
      const adr014 = allArts.find((a) => a.id === "art-adr-014")!;

      const synthesized = synthesizeReplacementAdr(adr014);

      expect(synthesized.replacementAdrId).toBe("ADR-015");
      expect(synthesized.title).toContain("Direct Frontier Streaming");
      expect(synthesized.supersedesArtifactId).toBe("art-adr-014");
      expect(synthesized.compiled.premises.length).toBeGreaterThanOrEqual(2);
      expect(synthesized.estimatedAnnualSavingsUsd).toBeGreaterThan(0);
      expect(synthesized.rawContent).toContain("# ADR-015");

      // Verify schema compliance of compiled
      const parseRes = CompiledArtifactOutputSchema.safeParse(synthesized.compiled);
      expect(parseRes.success).toBe(true);
      if (parseRes.success) {
        expect(parseRes.data.title).toBe(synthesized.title);
        expect(parseRes.data.premises.length).toBeGreaterThanOrEqual(2);
      }
    });

    test("synthesizes ADR-016: Direct Ephemeral Ingestion when PR #892 breaches", () => {
      const allArts = getAllArtifactsWithRelations();
      const pr892 = allArts.find((a) => a.id === "art-pr-892")!;

      const synthesized = synthesizeReplacementAdr(pr892);

      expect(synthesized.replacementAdrId).toBe("ADR-016");
      expect(synthesized.title).toContain("Direct Webhook Dispatch");
      expect(synthesized.compiled.premises.some((p) => p.variableName === "primary_webhook_uptime_pct")).toBe(true);

      const parseRes = CompiledArtifactOutputSchema.safeParse(synthesized.compiled);
      expect(parseRes.success).toBe(true);
    });

    test("synthesizes MEMO-017: Product-Led Growth when GTM-Q3 breaches", () => {
      const allArts = getAllArtifactsWithRelations();
      const gtm = allArts.find((a) => a.id === "art-gtm-q3")!;

      const synthesized = synthesizeReplacementAdr(gtm);

      expect(synthesized.replacementAdrId).toBe("MEMO-017");
      expect(synthesized.title).toContain("Product-Led Growth");
      expect(synthesized.estimatedAnnualSavingsUsd).toBeGreaterThan(50000);

      const parseRes = CompiledArtifactOutputSchema.safeParse(synthesized.compiled);
      expect(parseRes.success).toBe(true);
    });

    test("provides generic cloud-native baseline pattern for untracked or arbitrary decisions", () => {
      const mockArtifact: any = {
        id: "art-custom-001",
        title: "ADR-099: On-Premises ElasticSearch Cluster",
        type: "ADR",
        status: "INVALIDATED",
        targetLocus: "examples/demo-repo/packages/search/elastic.ts:L1-L20",
        rawContent: "Deploy self-hosted elasticsearch cluster",
        monthlyCloudSpendUsd: 1200,
        maintenanceHoursPerMonth: 8,
        premises: [],
        invalidationEvents: [],
      };

      const synthesized = synthesizeReplacementAdr(mockArtifact);

      expect(synthesized.replacementAdrId).toBe("ADR-099-REPLACEMENT");
      expect(synthesized.title).toContain("Cloud-Native Baseline Refactor");
      expect(synthesized.compiled.premises.length).toBeGreaterThan(0);
      expect(synthesized.compiled.targetLocus).toBe(mockArtifact.targetLocus);
    });
  });

  describe("Multi-File Caller Blast Radius & Unified Teardown Diffs", () => {
    test("discoverCallerBlastRadius identifies workspace callers referencing exported symbols", () => {
      const locus = "examples/demo-repo/packages/llm-gateway/src/semantic-cache.ts:L1-L30";
      const blastRadius = discoverCallerBlastRadius(locus);

      expect(blastRadius.symbols).toContain("routeInferenceWithSemanticCache");
      expect(blastRadius.callerFilePaths.length).toBeGreaterThanOrEqual(1);

      const callerPath = blastRadius.callerFilePaths.find((p) =>
        p.includes("gateway-consumer.ts")
      );
      expect(callerPath).toBeDefined();
      const refs = blastRadius.callersByFile.get(callerPath!);
      expect(refs).toBeDefined();
      expect(refs!.some((r) => r.symbolName === "routeInferenceWithSemanticCache")).toBe(true);
      expect(refs![0].lineNumber).toBeGreaterThan(0);
    });

    test("buildMultiFileTeardownPatch creates coordinated multi-file unified diff across root and callers", () => {
      const locus = "examples/demo-repo/packages/llm-gateway/src/semantic-cache.ts:L1-L30";
      const multiPatch = buildMultiFileTeardownPatch({
        targetLocus: locus,
        artifactTitle: "ADR-014: Custom Semantic Caching Microservice",
        variableName: "upstream_llm_input_cost_usd",
        operator: "GT",
        thresholdValue: "2.00",
        breakingValue: "1.18",
        unit: "USD / 1M tokens",
        blastRadius: "Delete 4,200 LOC Redis semantic cache",
      });

      expect(multiPatch.primaryFilePath).toContain("semantic-cache.ts");
      expect(multiPatch.primaryUnifiedDiff).toContain("PREMISE KILL-SWITCH APPLIED");
      expect(multiPatch.callerFiles.length).toBeGreaterThanOrEqual(1);

      const consumerDiff = multiPatch.callerFiles.find((d) =>
        d.filePath.includes("gateway-consumer.ts")
      );
      expect(consumerDiff).toBeDefined();
      expect(consumerDiff?.unifiedDiff).toContain("PREMISE KILL-SWITCH");
      expect(multiPatch.combinedUnifiedDiff).toContain("--- a/examples/demo-repo/packages/llm-gateway/src/semantic-cache.ts");
      expect(multiPatch.combinedUnifiedDiff).toContain("--- a/examples/demo-repo/services/gateway-consumer.ts");
    });
  });

  describe("1-Click Retire & Promote Workflow (Full Lifecycle Integration)", () => {
    test("retireAndPromoteArtifact deprecates breached ADR, persists savings, applies teardown, and boots replacement ADR", async () => {
      // Step 1: Simulate breach on ADR-014
      evaluateAndPersistMetricUpdate({
        variableName: "upstream_llm_input_cost_usd",
        value: 1.18,
        source: "test-retire-promote",
      });

      const beforeArts = getAllArtifactsWithRelations();
      const adr014Before = beforeArts.find((a) => a.id === "art-adr-014")!;
      expect(adr014Before.status).toBe("INVALIDATED");

      // Step 2: Execute Retire & Promote
      const result = await retireAndPromoteArtifact({
        artifactId: "art-adr-014",
        applyMultiFileTeardown: true,
      });

      expect(result.ok).toBe(true);
      expect(result.deprecatedArtifact.id).toBe("art-adr-014");
      expect(result.realizedAnnualSavingsUsd).toBeGreaterThan(0);
      expect(result.promotedArtifact.id).toBe("art-adr-015");
      expect(result.promotedArtifact.title).toContain("Direct Frontier Streaming");
      expect(result.promotedArtifact.premises.length).toBeGreaterThanOrEqual(2);

      // Step 3: Verify SQLite state
      const afterArts = getAllArtifactsWithRelations();
      const adr014After = afterArts.find((a) => a.id === "art-adr-014")!;
      expect(adr014After.status).toBe("DEPRECATED_BY_PREMISE_ENGINE");
      expect(adr014After.realizedAnnualSavingsUsd).toBe(result.realizedAnnualSavingsUsd);

      const adr015InDb = afterArts.find((a) => a.id === "art-adr-015")!;
      expect(adr015InDb).toBeDefined();
      // A brand-new replacement has no measured values yet
      expect(adr015InDb.status).toBe("NO_DATA");
      expect(adr015InDb.premises.length).toBeGreaterThanOrEqual(2);

      // Step 4: Verify FinOps Ledger reflects eliminated waste and savings
      const allEvents = getAllInvalidationEvents();
      const ledger = calculateFinOpsLedger(afterArts, allEvents);
      expect(ledger.cumulativeAnnualSavingsUsd).toBeGreaterThanOrEqual(result.realizedAnnualSavingsUsd);
      expect(ledger.appliedTeardownsCount).toBeGreaterThanOrEqual(1);

      // Step 5: Restore locus backups cleanly
      rollbackAllPatchedLoci();
    });
  });
});
