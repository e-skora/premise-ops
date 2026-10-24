import { NextRequest, NextResponse } from "next/server";
import {
  buildRealGitApplyPatch,
  inspectLocalLocus,
} from "@/lib/locus-inspector";
import {
  applyLocusPatchAndRecordBackup,
  getLocusBackupStatus,
  rollbackLocusPatchFromBackup,
} from "@/db";
import { Operator } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const targetLocus =
    searchParams.get("targetLocus") ||
    "packages/llm-gateway/src/semantic-cache.ts:L1-L34";
  const artifactTitle =
    searchParams.get("artifactTitle") || "Decision Artifact";
  const variableName =
    searchParams.get("variableName") || "monitored_metric";
  const operator = (searchParams.get("operator") || "GT") as Operator;
  const thresholdValue = searchParams.get("thresholdValue") || "0";
  const breakingValue = searchParams.get("breakingValue") || "0";
  const unit = searchParams.get("unit") || "";
  const blastRadius =
    searchParams.get("blastRadius") || "Remove obsolete workaround";

  const rawInspection = inspectLocalLocus(targetLocus);
  const backupStatus = getLocusBackupStatus(rawInspection.resolvedPath);
  const inspection = {
    ...rawInspection,
    isPatched: Boolean(rawInspection.isPatched || backupStatus.isPatched),
    patchedAt: backupStatus.patchedAt,
  };

  const { unifiedDiff } = buildRealGitApplyPatch({
    targetLocus,
    artifactTitle,
    variableName,
    operator,
    thresholdValue,
    breakingValue,
    unit,
    blastRadius,
  });

  return NextResponse.json({
    inspection,
    unifiedDiff,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      action: "apply" | "rollback";
      targetLocus: string;
      artifactId?: string;
      artifactTitle?: string;
      variableName?: string;
      operator?: Operator;
      thresholdValue?: string;
      breakingValue?: string;
      unit?: string;
      blastRadius?: string;
      cascadedFromTitle?: string;
    };

    const targetLocus =
      body.targetLocus || "packages/llm-gateway/src/semantic-cache.ts:L1-L30";
    const artifactTitle = body.artifactTitle || "Decision Artifact";
    const variableName = body.variableName || "monitored_metric";
    const operator = (body.operator || "GT") as Operator;
    const thresholdValue = body.thresholdValue || "0";
    const breakingValue = body.breakingValue || "0";
    const unit = body.unit || "";
    const blastRadius = body.blastRadius || "Remove obsolete workaround";

    if (body.action === "rollback") {
      const res = rollbackLocusPatchFromBackup(targetLocus);
      if (!res.ok) {
        return NextResponse.json(
          { error: res.error || "Failed to rollback locus patch" },
          { status: 400 }
        );
      }

      const { unifiedDiff } = buildRealGitApplyPatch({
        targetLocus,
        artifactTitle,
        variableName,
        operator,
        thresholdValue,
        breakingValue,
        unit,
        blastRadius,
      });

      return NextResponse.json({
        ok: true,
        action: "rollback",
        inspection: res.inspection,
        unifiedDiff,
      });
    }

    const res = applyLocusPatchAndRecordBackup({
      targetLocus,
      artifactId: body.artifactId,
      artifactTitle,
      variableName,
      operator,
      thresholdValue,
      breakingValue,
      unit,
      blastRadius,
      cascadedFromTitle: body.cascadedFromTitle,
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: res.error || "Failed to apply teardown patch to locus" },
        { status: 400 }
      );
    }

    const { unifiedDiff } = buildRealGitApplyPatch({
      targetLocus,
      artifactTitle,
      variableName,
      operator,
      thresholdValue,
      breakingValue,
      unit,
      blastRadius,
    });

    return NextResponse.json({
      ok: true,
      action: "apply",
      inspection: res.inspection,
      unifiedDiff,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to mutate locus file";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
