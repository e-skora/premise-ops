import { NextRequest, NextResponse } from "next/server";
import {
  getAllArtifactsWithRelations,
  getAllInvalidationEvents,
  insertCompiledArtifact,
} from "@/db";
import {
  convertDiscoveredToCompiledOutput,
  scanWorkspaceForPremises,
} from "@/lib/codebase-scanner";

export const dynamic = "force-dynamic";

export async function GET() {
  const existingArtifacts = getAllArtifactsWithRelations();
  const scanResult = scanWorkspaceForPremises(existingArtifacts);
  return NextResponse.json(scanResult);
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      id?: string;
      ids?: string[];
      importAllUntracked?: boolean;
    };

    const existingArtifacts = getAllArtifactsWithRelations();
    const { discovered } = scanWorkspaceForPremises(existingArtifacts);

    const targets = body.importAllUntracked
      ? discovered.filter((d) => !d.alreadyMonitored)
      : discovered.filter(
          (d) =>
            !d.alreadyMonitored &&
            (d.id === body.id || (body.ids && body.ids.includes(d.id)))
        );

    const importedArtifacts = [];
    for (const item of targets) {
      const { rawContent, compiled } = convertDiscoveredToCompiledOutput(item);
      const inserted = insertCompiledArtifact(rawContent, compiled);
      importedArtifacts.push(inserted);
    }

    const updatedArtifacts = getAllArtifactsWithRelations();
    const updatedScan = scanWorkspaceForPremises(updatedArtifacts);

    return NextResponse.json({
      ok: true,
      importedCount: importedArtifacts.length,
      importedArtifacts,
      artifacts: updatedArtifacts,
      invalidationEvents: getAllInvalidationEvents(),
      ...updatedScan,
    });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Failed to import codebase premises";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
