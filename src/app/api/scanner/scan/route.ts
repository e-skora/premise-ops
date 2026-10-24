import { NextRequest, NextResponse } from "next/server";
import {
  executeActiveProbes,
  getAllArtifactsWithRelations,
  getAllInvalidationEvents,
  insertCompiledArtifact,
} from "@/db";
import {
  convertInboxItemToCompiledArtifact,
  scanRepositoryTarget,
} from "@/lib/repo-scanner";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const target = url.searchParams.get("target") || "github.com/company/core-monorepo";
    const existingArtifacts = getAllArtifactsWithRelations();
    const scanResult = scanRepositoryTarget(target, existingArtifacts);
    return NextResponse.json({ ok: true, ...scanResult });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to scan repository";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      action?: "scan" | "accept" | "acceptAll" | "dismiss";
      repoTarget?: string;
      itemId?: string;
      itemIds?: string[];
    };

    const target = body.repoTarget || "github.com/company/core-monorepo";
    let existingArtifacts = getAllArtifactsWithRelations();
    const scanResult = scanRepositoryTarget(target, existingArtifacts);

    if (body.action === "scan" || !body.action) {
      return NextResponse.json({ ok: true, ...scanResult });
    }

    if (body.action === "accept" && body.itemId) {
      const itemToAccept = scanResult.discovered.find((d) => d.id === body.itemId);
      if (!itemToAccept) {
        return NextResponse.json(
          { error: `Discovered premise item ${body.itemId} not found` },
          { status: 404 }
        );
      }

      const { rawContent, compiled } =
        convertInboxItemToCompiledArtifact(itemToAccept);
      const inserted = insertCompiledArtifact(rawContent, compiled);

      // Immediately execute probe for the new premise
      try {
        await executeActiveProbes({ artifactId: inserted.id });
      } catch {
        // probe network fallback handled gracefully
      }

      existingArtifacts = getAllArtifactsWithRelations();
      const updatedScan = scanRepositoryTarget(target, existingArtifacts);

      return NextResponse.json({
        ok: true,
        acceptedItem: itemToAccept,
        insertedArtifactId: inserted.id,
        artifacts: existingArtifacts,
        invalidationEvents: getAllInvalidationEvents(),
        ...updatedScan,
      });
    }

    if (body.action === "acceptAll") {
      const pendingItems = scanResult.discovered.filter((d) => !d.alreadyMonitored);
      const insertedIds: string[] = [];

      for (const item of pendingItems) {
        const { rawContent, compiled } = convertInboxItemToCompiledArtifact(item);
        const inserted = insertCompiledArtifact(rawContent, compiled);
        insertedIds.push(inserted.id);
      }

      if (insertedIds.length > 0) {
        try {
          await executeActiveProbes();
        } catch {
          // ignore
        }
      }

      existingArtifacts = getAllArtifactsWithRelations();
      const updatedScan = scanRepositoryTarget(target, existingArtifacts);

      return NextResponse.json({
        ok: true,
        acceptedCount: insertedIds.length,
        insertedIds,
        artifacts: existingArtifacts,
        invalidationEvents: getAllInvalidationEvents(),
        ...updatedScan,
      });
    }

    return NextResponse.json({ error: "Unsupported scanner action" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to process scan action";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
