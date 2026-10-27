import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { compileDecisionArtifact } from "@/lib/compiler";
import {
  getAllArtifactsWithRelations,
  getAllInvalidationEvents,
  insertCompiledArtifact,
} from "@/db";
import { COMPILER_TEMPLATES } from "@/db/seed-data";
import { ArtifactTypeEnum } from "@/lib/types";
import { withDemoSandbox } from "@/lib/demo-sandbox";

export const dynamic = "force-dynamic";

const CompileRequestSchema = z.object({
  rawContent: z.string().min(5, "Document content is required"),
  templateId: z.string().optional(),
  overrideType: ArtifactTypeEnum.optional(),
  overrideTitle: z.string().optional(),
  overrideLocus: z.string().optional(),
  persist: z.boolean().default(true),
});

async function handleGet() {
  return NextResponse.json({
    templates: COMPILER_TEMPLATES,
  });
}

async function handlePost(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = CompileRequestSchema.parse(body);

    const { compiled, compilerEngine, llmProvider, llmModel, notice } =
      await compileDecisionArtifact({
      rawContent: parsed.rawContent,
      templateId: parsed.templateId,
      overrideType: parsed.overrideType,
      overrideTitle: parsed.overrideTitle,
      overrideLocus: parsed.overrideLocus,
    });

    if (!parsed.persist) {
      return NextResponse.json({
        compiled,
        compilerEngine,
        llmProvider,
        llmModel,
        notice,
        persisted: false,
      });
    }

    const createdArtifact = insertCompiledArtifact(
      parsed.rawContent,
      compiled
    );

    return NextResponse.json({
      compiled,
      compilerEngine,
      llmProvider,
      llmModel,
      notice,
      persisted: true,
      artifact: createdArtifact,
      artifacts: getAllArtifactsWithRelations(),
      invalidationEvents: getAllInvalidationEvents(),
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to compile decision artifact";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export const GET = withDemoSandbox(handleGet);
export const POST = withDemoSandbox(handlePost);
