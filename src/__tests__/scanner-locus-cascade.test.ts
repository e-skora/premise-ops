import { describe, expect, test } from "bun:test";
import {
  buildRealGitApplyPatch,
  inspectLocalLocus,
  parseTargetLocus,
} from "../lib/locus-inspector";
import {
  convertDiscoveredToCompiledOutput,
  scanWorkspaceForPremises,
} from "../lib/codebase-scanner";
import {
  applyLocusPatchAndRecordBackup,
  evaluateAndPersistMetricUpdate,
  executeActiveProbes,
  getAllArtifactsWithRelations,
  resetDatabaseToSeed,
  rollbackLocusPatchFromBackup,
} from "../db";

describe("Codebase Scanner, Locus Inspector & Multi-Hop Cascade Engine", () => {
  test("parseTargetLocus and inspectLocalLocus read real repository files", () => {
    const parsed = parseTargetLocus(
      "packages/llm-gateway/src/semantic-cache.ts:L1-L30"
    );
    expect(parsed.filePath).toBe("packages/llm-gateway/src/semantic-cache.ts");
    expect(parsed.startLine).toBe(1);
    expect(parsed.endLine).toBe(30);

    const inspection = inspectLocalLocus(
      "packages/llm-gateway/src/semantic-cache.ts:L1-L30"
    );
    expect(inspection.exists).toBe(true);
    expect(inspection.lines.length).toBe(30);

    const { unifiedDiff } = buildRealGitApplyPatch({
      targetLocus: "packages/llm-gateway/src/semantic-cache.ts:L1-L30",
      artifactTitle: "ADR-014: Custom Semantic Caching Microservice",
      variableName: "upstream_llm_input_cost_usd",
      operator: "GT",
      thresholdValue: "2.00",
      breakingValue: "1.30",
      unit: "USD / 1M tokens",
      blastRadius: "Delete 4,200 LOC Redis semantic cache",
    });
    expect(unifiedDiff).toContain(
      "diff --git a/packages/llm-gateway/src/semantic-cache.ts b/packages/llm-gateway/src/semantic-cache.ts"
    );
    expect(unifiedDiff).toContain("@@ -1,30 +1,");
  });

  test("scanWorkspaceForPremises discovers both monitored and untracked @premise annotations", () => {
    resetDatabaseToSeed();
    const existing = getAllArtifactsWithRelations();
    const scanRes = scanWorkspaceForPremises(existing);

    expect(scanRes.totalFilesScanned).toBeGreaterThanOrEqual(6);
    const untracked = scanRes.discovered.filter((d) => !d.alreadyMonitored);
    expect(untracked.length).toBeGreaterThanOrEqual(2);

    const pgVectorItem = untracked.find((d) =>
      d.filePath.includes("pgvector-index.ts")
    );
    expect(pgVectorItem).toBeDefined();
    expect(pgVectorItem?.probeType).toBe("SQL_METRIC");

    const compiled = convertDiscoveredToCompiledOutput(pgVectorItem!);
    expect(compiled.compiled.premises[0].variableName).toBe(
      "pgvector_total_rows"
    );
  });

  test("Multi-hop cascade invalidates downstream VENDOR-04 when ADR-014 breaches, and live patch applier + rollback work losslessly", async () => {
    resetDatabaseToSeed();

    // Execute all probes (HTTP_JSON_PATH, PROMQL, SQL_METRIC)
    const probeRun = await executeActiveProbes();
    expect(probeRun.probesExecuted).toBeGreaterThanOrEqual(5);

    // Breach ADR-014 upstream cost (requires > 2.00, set to 1.25)
    const breachRes = evaluateAndPersistMetricUpdate({
      variableName: "upstream_llm_input_cost_usd",
      value: 1.25,
      source: "unit-test",
    });

    const adr014 = breachRes.artifacts.find((a) => a.id === "art-adr-014");
    const vendorRedis = breachRes.artifacts.find(
      (a) => a.id === "art-vendor-redis"
    );
    expect(adr014?.status).toBe("INVALIDATED");
    expect(vendorRedis?.status).toBe("INVALIDATED");
    expect(vendorRedis?.cascadedFromId).toBe("art-adr-014");

    // Apply live teardown patch to semantic-cache.ts and verify rollback
    const patchRes = applyLocusPatchAndRecordBackup({
      targetLocus: "packages/llm-gateway/src/semantic-cache.ts:L1-L30",
      artifactId: "art-adr-014",
      artifactTitle: "ADR-014: Custom Semantic Caching Microservice",
      variableName: "upstream_llm_input_cost_usd",
      operator: "GT",
      thresholdValue: "2.00",
      breakingValue: "1.25",
      unit: "USD / 1M tokens",
      blastRadius: "Delete semantic cache",
    });
    expect(patchRes.ok).toBe(true);
    expect(patchRes.inspection.isPatched).toBe(true);

    const rollbackRes = rollbackLocusPatchFromBackup(
      "packages/llm-gateway/src/semantic-cache.ts:L1-L30"
    );
    expect(rollbackRes.ok).toBe(true);
    expect(rollbackRes.inspection.isPatched).toBe(false);

    // Leave database in clean seed state after tests
    resetDatabaseToSeed();
  });
});
