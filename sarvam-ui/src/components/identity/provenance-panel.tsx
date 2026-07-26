"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "./status-badge";
import {
  FIELD_LABELS,
  type IdentityCase,
  type MatrixCell,
} from "@/lib/identity/types";

export function ProvenancePanel({
  identityCase,
  cell,
}: {
  identityCase: IdentityCase;
  cell: MatrixCell | null;
}) {
  if (!cell) {
    return (
      <Card className="border-border shadow-none">
        <CardHeader>
          <CardTitle className="font-heading text-lg">Source provenance</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Select any matrix cell to jump to its bounding-box on the original scan.
        </CardContent>
      </Card>
    );
  }

  const doc = identityCase.documents.find((d) => d.id === cell.docId);
  const bbox = cell.bbox ?? { x: 20, y: 40, w: 40, h: 8 };

  return (
    <Card className="border-border shadow-none">
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="font-heading text-lg">Source provenance</CardTitle>
          <StatusBadge status={cell.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          {FIELD_LABELS[cell.field]} on {doc?.label ?? "document"}
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="relative aspect-[3/4] max-h-80 overflow-hidden rounded-xl border border-border bg-[linear-gradient(160deg,#e8effc_0%,#fafafa_45%,#f0f0f0_100%)]">
          <div className="absolute inset-x-4 top-4 flex items-center justify-between text-[10px] font-medium uppercase tracking-wider text-indigo-deep/70">
            <span>{doc?.label}</span>
            <span>{doc?.issuer}</span>
          </div>
          <div className="absolute inset-x-6 top-14 h-px bg-border" />
          <div className="absolute inset-x-8 top-20 space-y-2 opacity-40">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-2 rounded bg-foreground/10" style={{ width: `${70 - i * 4}%` }} />
            ))}
          </div>
          {cell.bbox || cell.status !== "missing" ? (
            <div
              className="absolute rounded-md border-2 border-primary bg-primary/15 shadow-[0_0_0_9999px_rgba(15,15,25,0.18)]"
              style={{
                left: `${bbox.x}%`,
                top: `${bbox.y}%`,
                width: `${bbox.w}%`,
                height: `${bbox.h}%`,
              }}
            />
          ) : null}
          <p className="absolute bottom-3 left-3 right-3 rounded-lg bg-card/95 px-3 py-2 text-xs font-medium shadow-sm">
            “{cell.value}”
          </p>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">{cell.reason}</p>
      </CardContent>
    </Card>
  );
}
