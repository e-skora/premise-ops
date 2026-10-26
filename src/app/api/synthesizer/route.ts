import { NextResponse } from "next/server";
import { getAllArtifactsWithRelations } from "@/db";
import { synthesizeReplacementAdr } from "@/lib/sunset-synthesizer";
import { retireAndPromoteArtifact } from "@/lib/sunset-synthesizer-server";
import { buildMultiFileTeardownPatch } from "@/lib/locus-inspector";
import { withDemoSandbox } from "@/lib/demo-sandbox";

export const dynamic = "force-dynamic";

async function handlePost(request: Request) {
  try {
    const body = await request.json();
    const { action, artifactId, applyMultiFileTeardown, customSynthesized } =
      body;

    if (!artifactId) {
      return NextResponse.json(
        { error: "Missing required parameter 'artifactId'" },
        { status: 400 }
      );
    }

    const allArtifacts = getAllArtifactsWithRelations();
    const artifact = allArtifacts.find((a) => a.id === artifactId);
    if (!artifact) {
      return NextResponse.json(
        { error: `DecisionArtifact '${artifactId}' not found` },
        { status: 404 }
      );
    }

    // Preview synthesized replacement ADR and multi-file patch
    if (action === "preview") {
      const synthesizedAdr = synthesizeReplacementAdr({
        artifact,
        breachingEvent: artifact.invalidationEvents[0],
      });

      let multiFilePatch = null;
      if (artifact.targetLocus) {
        const anchorPremise = artifact.premises[0];
        multiFilePatch = buildMultiFileTeardownPatch({
          targetLocus: artifact.targetLocus,
          artifactTitle: artifact.title,
          variableName: anchorPremise?.variableName || "metric",
          operator: anchorPremise?.operator || "GT",
          thresholdValue: anchorPremise?.thresholdValue || "0",
          breakingValue: anchorPremise?.currentValue || "0",
          unit: anchorPremise?.unit || "",
          blastRadius: artifact.blastRadius,
          cascadedFromTitle: artifact.cascadedFromId
            ? `Upstream Cascade: ${artifact.cascadedFromId}`
            : undefined,
        });
      }

      return NextResponse.json({
        ok: true,
        synthesizedAdr,
        multiFilePatch,
      });
    }

    // Execute Retire & Promote Workflow
    const result = await retireAndPromoteArtifact({
      artifactId,
      customSynthesized,
      applyMultiFileTeardown: applyMultiFileTeardown !== false,
    });

    return NextResponse.json({
      ok: true,
      result,
      artifacts: getAllArtifactsWithRelations(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const POST = withDemoSandbox(handlePost);
