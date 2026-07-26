"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { DeskWizard } from "@/components/desk/desk-wizard";

function DeskHome() {
  const params = useSearchParams();
  const service = params.get("service") || undefined;
  const caseId = params.get("case") || undefined;
  return <DeskWizard initialServiceId={service} initialCaseId={caseId} />;
}

export default function AppHome() {
  return (
    <Suspense
      fallback={
        <div className="desk-panel p-4 text-sm text-muted-foreground">
          Loading desk…
        </div>
      }
    >
      <DeskHome />
    </Suspense>
  );
}
