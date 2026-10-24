import { NextRequest, NextResponse } from "next/server";
import { getAllArtifactsWithRelations } from "@/db";
import {
  runBacktestSimulation,
  SCENARIO_PRESETS,
} from "@/lib/backtest-engine";
import { BacktestOptions } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    presets: SCENARIO_PRESETS,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<BacktestOptions>;
    const artifacts = getAllArtifactsWithRelations();

    const options: BacktestOptions = {
      scenarioId: body.scenarioId || "price-war",
      artifactId: body.artifactId,
      premiseId: body.premiseId,
      steps: typeof body.steps === "number" ? body.steps : undefined,
      shockMagnitudePct:
        typeof body.shockMagnitudePct === "number"
          ? body.shockMagnitudePct
          : undefined,
      noiseFactorPct:
        typeof body.noiseFactorPct === "number"
          ? body.noiseFactorPct
          : undefined,
      driftVelocity:
        typeof body.driftVelocity === "number"
          ? body.driftVelocity
          : undefined,
    };

    const report = runBacktestSimulation(artifacts, options);

    return NextResponse.json({
      ok: true,
      report,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Backtest simulation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
