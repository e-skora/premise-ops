import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  evaluateAndPersistMetricUpdate,
  getAllInvalidationEvents,
} from "@/db";
import { withDemoSandbox } from "@/lib/demo-sandbox";

export const dynamic = "force-dynamic";

const WebhookMetricSchema = z
  .object({
    variableName: z.string().optional(),
    premiseId: z.string().optional(),
    value: z.union([z.number(), z.string()]),
    source: z.string().optional(),
  })
  .refine((data) => Boolean(data.variableName || data.premiseId), {
    message: "Either variableName or premiseId must be provided",
  });

async function handlePost(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = WebhookMetricSchema.parse(body);

    const result = evaluateAndPersistMetricUpdate({
      variableName: parsed.variableName,
      premiseId: parsed.premiseId,
      value: parsed.value,
      source: parsed.source || "webhook-ingest",
    });

    return NextResponse.json({
      ok: true,
      evaluatedAt: new Date().toISOString(),
      updatedPremises: result.updatedPremises,
      triggeredEvents: result.triggeredEvents,
      invalidationEvents: getAllInvalidationEvents(),
      artifacts: result.artifacts,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Invalid webhook metric payload";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export const POST = withDemoSandbox(handlePost);
