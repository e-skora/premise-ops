import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { dispatchInvalidationAlert, getAllArtifactsWithRelations } from "@/db";
import { DispatchChannelEnum } from "@/lib/types";

const DispatchSchema = z.object({
  eventId: z.string(),
  channel: DispatchChannelEnum,
  targetEndpoint: z.string().optional(),
  repo: z.string().optional(),
  branchName: z.string().optional(),
  baseBranch: z.string().optional(),
  githubToken: z.string().optional(),
  dryRun: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = DispatchSchema.parse(body);

    const result = await dispatchInvalidationAlert({
      eventId: parsed.eventId,
      channel: parsed.channel,
      targetEndpoint: parsed.targetEndpoint,
      repo: parsed.repo,
      branchName: parsed.branchName,
      baseBranch: parsed.baseBranch,
      githubToken: parsed.githubToken,
      dryRun: parsed.dryRun,
    });

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to dispatch outbound alert";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const eventId = searchParams.get("eventId");
    const artifacts = getAllArtifactsWithRelations();
    const allDispatches = artifacts
      .flatMap((a) => a.invalidationEvents)
      .flatMap((e) => e.dispatchLogs || []);

    const filtered = eventId
      ? allDispatches.filter((d) => d.eventId === eventId)
      : allDispatches;

    return NextResponse.json({
      ok: true,
      dispatches: filtered,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load dispatches" },
      { status: 500 }
    );
  }
}
