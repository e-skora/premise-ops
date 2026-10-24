import React from "react";
import {
  getAllArtifactsWithRelations,
  getAllInvalidationEvents,
} from "@/db";
import { COMPILER_TEMPLATES } from "@/db/seed-data";
import { PremiseControlPlane } from "@/components/PremiseControlPlane";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const artifacts = JSON.parse(JSON.stringify(getAllArtifactsWithRelations()));
  const invalidationEvents = JSON.parse(
    JSON.stringify(getAllInvalidationEvents())
  );
  const compilerTemplates = JSON.parse(JSON.stringify(COMPILER_TEMPLATES));

  return (
    <PremiseControlPlane
      initialArtifacts={artifacts}
      initialInvalidationEvents={invalidationEvents}
      compilerTemplates={compilerTemplates}
    />
  );
}
