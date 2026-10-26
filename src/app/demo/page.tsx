import React from "react";
import { cookies } from "next/headers";
import {
  getAllArtifactsWithRelations,
  getAllInvalidationEvents,
} from "@/db";
import { COMPILER_TEMPLATES } from "@/db/seed-data";
import { PremiseControlPlane } from "@/components/PremiseControlPlane";
import { SANDBOX_COOKIE, isPublicDemo } from "@/lib/demo-mode";
import { runInVisitorSandbox } from "@/lib/demo-sandbox";

export const dynamic = "force-dynamic";

function loadControlPlaneState() {
  return {
    artifacts: JSON.parse(JSON.stringify(getAllArtifactsWithRelations())),
    invalidationEvents: JSON.parse(JSON.stringify(getAllInvalidationEvents())),
  };
}

export default async function DemoPage() {
  const publicDemo = isPublicDemo();
  // Public demo: render this visitor's own sandbox, not the shared database
  const { artifacts, invalidationEvents } = publicDemo
    ? (
        await runInVisitorSandbox(
          cookies().get(SANDBOX_COOKIE)?.value,
          loadControlPlaneState
        )
      ).result
    : loadControlPlaneState();
  const compilerTemplates = JSON.parse(JSON.stringify(COMPILER_TEMPLATES));

  return (
    <PremiseControlPlane
      initialArtifacts={artifacts}
      initialInvalidationEvents={invalidationEvents}
      compilerTemplates={compilerTemplates}
      publicDemo={publicDemo}
    />
  );
}
