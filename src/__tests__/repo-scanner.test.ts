import { describe, expect, test, beforeEach } from "bun:test";
import {
  scanAdrFolder,
  scanDependencyManifests,
  scanRepositoryTarget,
  convertInboxItemToCompiledArtifact,
} from "../lib/repo-scanner";
import {
  getAllArtifactsWithRelations,
  insertCompiledArtifact,
  resetDatabaseToSeed,
  executeActiveProbes,
} from "../db";
import { CompiledArtifactOutputSchema } from "../lib/types";
import { resolveWorkspaceRoot } from "../lib/workspace-root";

describe("GitHub Repository Scanner & Discovered Premises Inbox (Premise Engine v2)", () => {
  beforeEach(() => {
    resetDatabaseToSeed();
  });

  test("scanAdrFolder extracts numeric and state premises from docs/adr/*.md", () => {
    const existing = getAllArtifactsWithRelations();
    const { discovered, adrFilesScanned } = scanAdrFolder(resolveWorkspaceRoot(), existing);

    expect(adrFilesScanned.length).toBeGreaterThanOrEqual(2);
    expect(adrFilesScanned).toContain("examples/demo-repo/docs/adr/ADR-005-pinecone-vector-index.md");
    expect(adrFilesScanned).toContain("examples/demo-repo/docs/adr/ADR-008-tesseract-ocr-pipeline.md");

    // ADR-005 Pinecone checks
    const pineconeItems = discovered.filter((d) =>
      d.sourceFile.includes("ADR-005-pinecone-vector-index.md")
    );
    expect(pineconeItems.length).toBeGreaterThanOrEqual(2);

    const costItem = pineconeItems.find(
      (d) => d.variableName === "vector_embedding_cost_monthly_usd"
    );
    expect(costItem).toBeDefined();
    // The "## Blast Radius & Sunset Criteria" heading's paragraph, not the heading's tail
    expect(costItem?.blastRadius.startsWith(
      "Decommission $450/mo Pinecone pod reservation"
    )).toBe(true);
    expect(costItem?.operator).toBe("LT");
    expect(costItem?.thresholdValue).toBe("450.00");
    expect(costItem?.unit).toContain("USD");
    expect(costItem?.probeType).toBe("HTTP_JSON_PATH");

    const latencyItem = pineconeItems.find(
      (d) => d.variableName === "vector_query_p95_ms"
    );
    expect(latencyItem).toBeDefined();
    expect(latencyItem?.operator).toBe("LT");
    expect(latencyItem?.thresholdValue).toBe("120");
    expect(latencyItem?.unit).toBe("ms");

    // ADR-008 Tesseract checks
    const tesseractItem = discovered.find((d) =>
      d.sourceFile.includes("ADR-008-tesseract-ocr-pipeline.md")
    );
    expect(tesseractItem).toBeDefined();
    expect(tesseractItem?.variableName).toBe("multimodal_vision_token_cost_usd");
    expect(tesseractItem?.operator).toBe("GT");
    expect(tesseractItem?.thresholdValue).toBe("0.015");
  });

  test("scanDependencyManifests flags heavy third-party packages and generates architectural prompts", () => {
    const existing = getAllArtifactsWithRelations();
    const { discovered, manifestsScanned } = scanDependencyManifests(
      resolveWorkspaceRoot(),
      existing
    );

    expect(manifestsScanned.length).toBeGreaterThanOrEqual(2);
    expect(manifestsScanned).toContain("examples/demo-repo/packages/llm-gateway/package.json");
    expect(manifestsScanned).toContain("examples/demo-repo/services/ingest-worker/package.json");

    // Check detected dependencies
    const pkgNames = discovered.map((d) => d.detectedPackage?.name).filter(Boolean);
    expect(pkgNames).toContain("ioredis");
    expect(pkgNames).toContain("bullmq");
    expect(pkgNames).toContain("rate-limiter-flexible");
    expect(pkgNames).toContain("tesseract.js");

    // Verify architectural challenge prompt generation
    const rateLimiter = discovered.find(
      (d) => d.detectedPackage?.name === "rate-limiter-flexible"
    );
    expect(rateLimiter).toBeDefined();
    expect(rateLimiter?.architecturalPrompt).toContain(
      "Why do you depend on rate-limiter-flexible?"
    );
    expect(rateLimiter?.variableName).toBe("peak_abusive_requests_per_sec");
    expect(rateLimiter?.operator).toBe("GT");
    expect(rateLimiter?.probeType).toBe("PROMQL");

    // Verify ioredis matches alreadyMonitored because ADR-014 in seed data monitors redis/upstream_llm_input_cost_usd
    const ioredis = discovered.find((d) => d.detectedPackage?.name === "ioredis");
    expect(ioredis?.alreadyMonitored).toBe(true);
  });

  test("convertInboxItemToCompiledArtifact formats schema-compliant output for SQLite ingestion", () => {
    const existing = getAllArtifactsWithRelations();
    const { discovered } = scanAdrFolder(resolveWorkspaceRoot(), existing);
    const pineconeCost = discovered.find(
      (d) => d.variableName === "vector_embedding_cost_monthly_usd"
    );
    expect(pineconeCost).toBeDefined();

    const { rawContent, compiled } =
      convertInboxItemToCompiledArtifact(pineconeCost!);

    // Validate Zod schema
    const parseResult = CompiledArtifactOutputSchema.safeParse(compiled);
    expect(parseResult.success).toBe(true);

    expect(compiled.title).toContain("Pinecone Vector Index");
    expect(compiled.type).toBe("ADR");
    expect(compiled.targetLocus).toBe(pineconeCost!.targetLocus);
    expect(compiled.premises.length).toBe(1);
    expect(compiled.premises[0].variableName).toBe(
      "vector_embedding_cost_monthly_usd"
    );
    expect(compiled.premises[0].operator).toBe("LT");
    expect(compiled.premises[0].thresholdValue).toBe("450.00");
    expect(compiled.premises[0].recommendedProbe.probeType).toBe("HTTP_JSON_PATH");
    expect(rawContent.length).toBeGreaterThan(50);
  });

  test("scanRepositoryTarget aggregates ADRs, manifests, and inline items with accurate inbox count", () => {
    const existing = getAllArtifactsWithRelations();
    const result = scanRepositoryTarget(
      "github.com/company/core-monorepo",
      existing
    );

    expect(result.target.repoName).toBe("company/core-monorepo");
    expect(result.target.adrCount).toBeGreaterThanOrEqual(2);
    expect(result.target.manifestCount).toBeGreaterThanOrEqual(2);
    expect(result.discovered.length).toBeGreaterThanOrEqual(10);
    expect(result.pendingInboxCount).toBeGreaterThan(0);
    expect(result.catalogCounts.inbox).toBe(result.pendingInboxCount);
    expect(result.catalogCounts.adr).toBeGreaterThanOrEqual(2);
    expect(result.catalogCounts.manifests).toBeGreaterThanOrEqual(4);
  });

  test("1-Click Acceptance: insertCompiledArtifact persists item and hooks up live probe execution", async () => {
    const existing = getAllArtifactsWithRelations();
    const initialCount = existing.length;

    const { discovered } = scanAdrFolder(resolveWorkspaceRoot(), existing);
    const unmonitored = discovered.find((d) => !d.alreadyMonitored);
    expect(unmonitored).toBeDefined();

    // 1-Click Acceptance simulation
    const { rawContent, compiled } =
      convertInboxItemToCompiledArtifact(unmonitored!);
    const inserted = insertCompiledArtifact(rawContent, compiled);

    expect(inserted.id).toBeDefined();
    expect(inserted.title).toBe(compiled.title);

    // Verify probe execution hooks up cleanly
    await executeActiveProbes({ artifactId: inserted.id });

    // Verify database has newly inserted artifact
    const updated = getAllArtifactsWithRelations();
    expect(updated.length).toBe(initialCount + 1);

    const reloaded = updated.find((a) => a.id === inserted.id);
    expect(reloaded).toBeDefined();
    expect(reloaded?.premises.length).toBe(1);
    expect(reloaded?.premises[0].probes.length).toBeGreaterThanOrEqual(1);

    // Verify re-scanning marks the accepted item as alreadyMonitored
    const rescan = scanRepositoryTarget(
      "github.com/company/core-monorepo",
      updated
    );
    const matchedRescan = rescan.discovered.find(
      (d) => d.variableName === unmonitored!.variableName
    );
    expect(matchedRescan?.alreadyMonitored).toBe(true);
  });
});
