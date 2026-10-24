import { NextRequest, NextResponse } from "next/server";
import { executeActiveProbes } from "@/db";

export async function POST(req: NextRequest) {
  try {
    let body: { artifactId?: string; premiseId?: string } = {};
    try {
      body = await req.json();
    } catch {
      // Allow empty POST body to run all probes
    }

    const result = await executeActiveProbes({
      artifactId: body.artifactId,
      premiseId: body.premiseId,
    });

    return NextResponse.json({
      ok: true,
      executedAt: new Date().toISOString(),
      ...result,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to execute active probes";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  const result = await executeActiveProbes();
  return NextResponse.json({
    ok: true,
    executedAt: new Date().toISOString(),
    ...result,
  });
}
