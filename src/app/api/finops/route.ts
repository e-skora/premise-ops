import { NextResponse } from "next/server";
import { getFinOpsLedger } from "@/db";
import { withDemoSandbox } from "@/lib/demo-sandbox";

export const dynamic = "force-dynamic";

async function handleGet(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const hourlyRateParam = searchParams.get("hourlyRate");
    const daysParam = searchParams.get("days");

    const ledger = getFinOpsLedger({
      blendedHourlyEngRateUsd: hourlyRateParam
        ? Number(hourlyRateParam)
        : undefined,
      daysPerMonth: daysParam ? Number(daysParam) : undefined,
    });

    return NextResponse.json(ledger);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const GET = withDemoSandbox(handleGet);
