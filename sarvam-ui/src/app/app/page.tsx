"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { DeskWizard } from "@/components/desk/desk-wizard";

function DeskHome() {
  const params = useSearchParams();
  const service = params.get("service") || undefined;
  return <DeskWizard initialServiceId={service} />;
}

export default function AppHome() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading desk…</p>}>
      <DeskHome />
    </Suspense>
  );
}
