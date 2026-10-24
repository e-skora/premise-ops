import { NextRequest, NextResponse } from "next/server";
import { getLiveTelemetrySnapshot } from "@/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
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
