import { NextRequest, NextResponse } from "next/server";
import {
  acknowledgeEvent,
  getAllArtifactsWithRelations,
  getAllInvalidationEvents,
  getLiveTelemetrySnapshot,
  resetDatabaseToSeed,
  updateArtifactCombinator,
  updateArtifactDependencies,
  updatePremiseAndProbeConfig,
} from "@/db";
import { COMPILER_TEMPLATES } from "@/db/seed-data";
import { OperatorEnum, ProbeTypeEnum } from "@/lib/types";
import { withDemoSandbox } from "@/lib/demo-sandbox";

export const dynamic = "force-dynamic";

async function handleGet() {
  return NextResponse.json({
    artifacts: getAllArtifactsWithRelations(),
    invalidationEvents: getAllInvalidationEvents(),
    telemetry: getLiveTelemetrySnapshot(),
    compilerTemplates: COMPILER_TEMPLATES,
  });
}

async function handlePost(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.action === "reset") {
      const artifacts = resetDatabaseToSeed();
      return NextResponse.json({
        ok: true,
        artifacts,
        invalidationEvents: getAllInvalidationEvents(),
        telemetry: getLiveTelemetrySnapshot(),
      });
    }

    if (body.action === "acknowledge" && typeof body.eventId === "string") {
      const invalidationEvents = acknowledgeEvent(body.eventId);
      return NextResponse.json({
        ok: true,
        artifacts: getAllArtifactsWithRelations(),
        invalidationEvents,
      });
    }

    if (
      body.action === "setCombinator" &&
      typeof body.artifactId === "string" &&
      (body.combinator === "ANY" || body.combinator === "ALL")
    ) {
      const artifacts = updateArtifactCombinator(
        body.artifactId,
        body.combinator
      );
      return NextResponse.json({
        ok: true,
        artifacts,
        invalidationEvents: getAllInvalidationEvents(),
      });
    }

    if (
      body.action === "setDependencies" &&
      typeof body.artifactId === "string" &&
      Array.isArray(body.dependsOnIds)
    ) {
      const result = updateArtifactDependencies(
        body.artifactId,
        body.dependsOnIds.filter((x: unknown): x is string => typeof x === "string")
      );
      return NextResponse.json({
        ok: true,
        ...result,
      });
    }

    if (
      body.action === "updatePremiseConfig" &&
      typeof body.premiseId === "string"
    ) {
      const parsedOp = OperatorEnum.safeParse(body.operator);
      if (!parsedOp.success) {
        return NextResponse.json(
          { error: "Invalid operator" },
          { status: 400 }
        );
      }
      const parsedProbeType = body.probeType
        ? ProbeTypeEnum.safeParse(body.probeType)
        : undefined;

      const result = updatePremiseAndProbeConfig({
        premiseId: body.premiseId,
        claim: typeof body.claim === "string" ? body.claim : undefined,
        operator: parsedOp.data,
        thresholdValue: String(body.thresholdValue ?? ""),
        decayWarningMargin: Number(body.decayWarningMargin ?? 0.1),
        probeType: parsedProbeType?.success ? parsedProbeType.data : undefined,
        targetUrlOrQuery:
          typeof body.targetUrlOrQuery === "string"
            ? body.targetUrlOrQuery
            : undefined,
        jsonPath:
          typeof body.jsonPath === "string" ? body.jsonPath : undefined,
        pollingIntervalSeconds:
          typeof body.pollingIntervalSeconds === "number"
            ? body.pollingIntervalSeconds
            : undefined,
      });

      return NextResponse.json({
        ok: true,
        ...result,
      });
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to process state action";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export const GET = withDemoSandbox(handleGet);
export const POST = withDemoSandbox(handlePost);
