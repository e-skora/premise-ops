import { NextRequest, NextResponse } from "next/server";
import { getLiveTelemetrySnapshot } from "@/db";
import { withDemoSandbox } from "@/lib/demo-sandbox";

export const dynamic = "force-dynamic";

async function handleGet(req: NextRequest) {
  const source =
    req.nextUrl.searchParams.get("source") || "premise-telemetry-bus";
  const metrics = getLiveTelemetrySnapshot();

  return NextResponse.json({
    source,
    status: "LIVE",
    timestamp: new Date().toISOString(),
    metrics,
  });
}

export const GET = withDemoSandbox(handleGet);
