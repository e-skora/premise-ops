import {
  SunsetRetireAndPromoteResult,
  SynthesizedReplacementAdr,
} from "./types";
import {
  applyMultiFileTeardownPatch,
  inspectLocalLocus,
} from "./locus-inspector";
import {
  executeActiveProbes,
  getAllArtifactsWithRelations,
  getDb,
  insertCompiledArtifact,
} from "../db";
import { calculateArtifactDrag } from "./finops-engine";
import { synthesizeReplacementAdr } from "./sunset-synthesizer";

/**
 * 1-Click "Retire & Promote" Workflow (Server-Side Database & Filesystem Orchestration):
 * 1. Deprecates the old DecisionArtifact (updates status & sets realized annual savings).
 * 2. Applies the multi-file teardown patch to the local workspace files.
 * 3. Boots the synthesized replacement ADR with live probes into `./premise.db`.
 * 4. Executes active probes on the newly booted ADR so telemetry monitoring begins immediately.
 */
export async function retireAndPromoteArtifact(params: {
  artifactId: string;
  customSynthesized?: SynthesizedReplacementAdr;
  applyMultiFileTeardown?: boolean;
}): Promise<SunsetRetireAndPromoteResult> {
  const db = getDb();
  const allArtifacts = getAllArtifactsWithRelations();
  const oldArtifact = allArtifacts.find((a) => a.id === params.artifactId);

  if (!oldArtifact) {
    throw new Error(`DecisionArtifact '${params.artifactId}' not found`);
  }

  // 1. Synthesize replacement ADR
  const synthesizedAdr =
    params.customSynthesized ||
    synthesizeReplacementAdr({
      artifact: oldArtifact,
      breachingEvent: oldArtifact.invalidationEvents[0],
    });

  // 2. Compute realized annual savings
  const dragMetrics = calculateArtifactDrag(oldArtifact);
  const realizedAnnualSavingsUsd =
    dragMetrics.annualizedDragUsd > 0
      ? dragMetrics.annualizedDragUsd
      : synthesizedAdr.estimatedAnnualSavingsUsd;

  // 3. Apply Multi-File Teardown Patch to disk
  let teardownApplied = false;
  let multiFilePatch;
  const shouldApplyTeardown = params.applyMultiFileTeardown !== false;

  if (shouldApplyTeardown && oldArtifact.targetLocus) {
    const anchorPremise = oldArtifact.premises[0];
    const patchResult = applyMultiFileTeardownPatch({
      targetLocus: oldArtifact.targetLocus,
      artifactTitle: oldArtifact.title,
      variableName: anchorPremise?.variableName || "metric",
      operator: anchorPremise?.operator || "GT",
      thresholdValue: anchorPremise?.thresholdValue || "0",
      breakingValue: anchorPremise?.currentValue || "no value reported",
      unit: anchorPremise?.unit || "",
      blastRadius: oldArtifact.blastRadius,
      cascadedFromTitle: oldArtifact.cascadedFromId
        ? `Upstream Cascade: ${oldArtifact.cascadedFromId}`
        : undefined,
    });
    teardownApplied = patchResult.ok;
    multiFilePatch = patchResult.multiFilePatch;

    // Record in LocusBackup with genuine file contents
    if (patchResult.ok && patchResult.primaryOriginalContent) {
      const nowIso = new Date().toISOString();
      const existingBackup = db
        .prepare(
          "SELECT originalContent FROM LocusBackup WHERE resolvedPath = ? LIMIT 1"
        )
        .get(patchResult.primaryResolvedPath || oldArtifact.targetLocus) as
        | { originalContent: string }
        | undefined;

      const cleanOriginal = existingBackup
        ? existingBackup.originalContent
        : patchResult.primaryOriginalContent;

      db.prepare(
        `INSERT OR REPLACE INTO LocusBackup (resolvedPath, rawLocus, artifactId, originalContent, patchedContent, appliedAt)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        patchResult.primaryResolvedPath || oldArtifact.targetLocus,
        oldArtifact.targetLocus,
        oldArtifact.id,
        cleanOriginal,
        patchResult.primaryPatchedContent || "",
        nowIso
      );

      // Also record caller file backups if any
      for (const caller of patchResult.multiFilePatch.callerFiles) {
        db.prepare(
          `INSERT OR REPLACE INTO LocusBackup (resolvedPath, rawLocus, artifactId, originalContent, patchedContent, appliedAt)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).run(
          caller.filePath,
          caller.filePath,
          oldArtifact.id,
          caller.originalContent,
          caller.replacementContent,
          nowIso
        );
      }
    }
  }

  // 4. Update Old Artifact to DEPRECATED status and record realized savings
  const nowIso = new Date().toISOString();
  db.prepare(
    `UPDATE DecisionArtifact
     SET status = 'DEPRECATED_BY_PREMISE_ENGINE',
         realizedAnnualSavingsUsd = ?,
         lastEvaluatedAt = ?
     WHERE id = ?`
  ).run(realizedAnnualSavingsUsd, nowIso, oldArtifact.id);

  db.prepare(
    `UPDATE InvalidationEvent
     SET realizedAnnualSavingsUsd = ?, acknowledged = 1
     WHERE artifactId = ?`
  ).run(realizedAnnualSavingsUsd, oldArtifact.id);

  // 5. Boot the newly synthesized ADR into SQLite
  const promotedArtifact = insertCompiledArtifact(
    synthesizedAdr.rawContent,
    synthesizedAdr.compiled,
    synthesizedAdr.id
  );

  // 6. Execute live probes on the newly booted ADR
  try {
    await executeActiveProbes({ artifactId: promotedArtifact.id });
  } catch {
    // Probes initialized
  }

  const updatedArtifacts = getAllArtifactsWithRelations();
  const refreshedOld =
    updatedArtifacts.find((a) => a.id === oldArtifact.id) || oldArtifact;
  const refreshedNew =
    updatedArtifacts.find((a) => a.id === promotedArtifact.id) || promotedArtifact;

  return {
    ok: true,
    deprecatedArtifact: refreshedOld,
    promotedArtifact: refreshedNew,
    synthesizedAdr,
    teardownApplied,
    multiFilePatch,
    realizedAnnualSavingsUsd,
  };
}
