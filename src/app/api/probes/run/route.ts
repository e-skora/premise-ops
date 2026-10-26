import { NextRequest, NextResponse } from "next/server";
import { executeActiveProbes } from "@/db";
import { withDemoSandbox } from "@/lib/demo-sandbox";

export const dynamic = "force-dynamic";

async function handlePost(req: NextRequest) {
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

async function handleGet() {
  const result = await executeActiveProbes();
  return NextResponse.json({
    ok: true,
    executedAt: new Date().toISOString(),
    ...result,
  });
}

export const POST = withDemoSandbox(handlePost);
export const GET = withDemoSandbox(handleGet);
