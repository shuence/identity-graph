"use client";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "./status-badge";
import {
  FIELD_LABELS,
  type FieldKey,
  type IdentityCase,
} from "@/lib/identity/types";
import { Printer } from "lucide-react";

const FIELDS: FieldKey[] = [
  "full_name",
  "father_name",
  "dob",
  "gender",
  "address",
];

export function AuditReport({ identityCase }: { identityCase: IdentityCase }) {
  const { summary, remediation, documents, matrix, subjectLabel } = identityCase;

  return (
    <div id="audit" className="rounded-xl border border-border bg-card p-6 md:p-8 print:border-0 print:p-0">
      <div className="mb-6 flex flex-col gap-4 print:mb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            Verified Identity Audit File
          </p>
          <h2 className="mt-1 font-heading text-2xl font-semibold tracking-tight">
            {subjectLabel}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Generated {new Date(identityCase.createdAt).toLocaleString("en-IN")} · IdentityGraph
            India
          </p>
        </div>
        <Button
          variant="outline"
          className="print:hidden"
          onClick={() => window.print()}
        >
          <Printer data-icon="inline-start" />
          Print / Save PDF
        </Button>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        {(
          [
            ["Matches", summary.matches, "match"],
            ["Variants", summary.variants, "variant"],
            ["Blockers", summary.blockers, "blocker"],
            ["Uncertain", summary.uncertain, "uncertain"],
          ] as const
        ).map(([label, value, status]) => (
          <div key={label} className="rounded-lg border border-border px-3 py-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="font-heading text-2xl font-semibold">{value}</p>
            <StatusBadge status={status} className="mt-1" />
          </div>
        ))}
      </div>

      <Separator className="my-6" />

      <h3 className="mb-3 font-heading text-lg font-semibold">Documents reviewed</h3>
      <ul className="mb-6 flex flex-col gap-2 text-sm">
        {documents.map((doc) => (
          <li key={doc.id} className="flex justify-between gap-4 border-b border-border pb-2">
            <span className="font-medium">{doc.label}</span>
            <span className="text-muted-foreground">
              {doc.issuer} · scanned {doc.scannedAt}
            </span>
          </li>
        ))}
      </ul>

      <h3 className="mb-3 font-heading text-lg font-semibold">Field findings</h3>
      <div className="mb-6 flex flex-col gap-2">
        {FIELDS.flatMap((field) => {
          const cells = matrix.filter(
            (c) => c.field === field && (c.status === "blocker" || c.status === "variant" || c.status === "uncertain")
          );
          if (cells.length === 0) return [];
          return (
            <div key={field} className="rounded-lg border border-border p-3">
              <p className="mb-2 text-sm font-medium">{FIELD_LABELS[field]}</p>
              <ul className="flex flex-col gap-2">
                {cells.map((cell) => {
                  const doc = documents.find((d) => d.id === cell.docId);
                  return (
                    <li key={`${cell.field}-${cell.docId}`} className="flex flex-wrap items-start gap-2 text-sm">
                      <StatusBadge status={cell.status} />
                      <span className="font-medium">{doc?.label}:</span>
                      <span className="text-muted-foreground">
                        “{cell.value}” — {cell.reason}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>

      <div className="rounded-lg border border-primary/20 bg-secondary/50 p-4">
        <p className="text-sm font-medium">Recommended remediation</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Primary document: <strong>{remediation.primaryDocLabel}</strong> via{" "}
          {remediation.portalName}. {remediation.formHint}.
        </p>
      </div>

      <p className="mt-8 text-xs text-muted-foreground">
        This audit explains identity mismatches for banks, loan agents, and CAs. Unreadable
        regions are marked UNCERTAIN — IdentityGraph does not invent values.
      </p>
    </div>
  );
}
