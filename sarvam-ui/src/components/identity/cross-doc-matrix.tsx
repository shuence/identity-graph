"use client";

import {
  FIELD_LABELS,
  type FieldKey,
  type IdentityCase,
  type MatrixCell,
} from "@/lib/identity/types";
import { StatusBadge, statusCellClass } from "./status-badge";
import { cn } from "@/lib/utils";

const FIELDS: FieldKey[] = [
  "full_name",
  "father_name",
  "dob",
  "gender",
  "address",
  "id_number",
];

export function CrossDocMatrix({
  identityCase,
  selected,
  onSelect,
}: {
  identityCase: IdentityCase;
  selected: MatrixCell | null;
  onSelect: (cell: MatrixCell) => void;
}) {
  const { documents, matrix } = identityCase;

  const cellAt = (field: FieldKey, docId: string) =>
    matrix.find((c) => c.field === field && c.docId === docId);

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40">
            <th className="sticky left-0 z-10 bg-muted/40 px-3 py-3 text-left font-medium text-muted-foreground">
              Field
            </th>
            {documents.map((doc) => (
              <th key={doc.id} className="px-3 py-3 text-left font-heading font-semibold">
                {doc.label}
                <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                  {doc.issuer}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {FIELDS.map((field) => (
            <tr key={field} className="border-b border-border last:border-0">
              <td className="sticky left-0 z-10 bg-card px-3 py-2 font-medium">
                {FIELD_LABELS[field]}
              </td>
              {documents.map((doc) => {
                const cell = cellAt(field, doc.id);
                if (!cell) {
                  return (
                    <td key={doc.id} className="px-2 py-2">
                      <div className={statusCellClass("missing")}>—</div>
                    </td>
                  );
                }
                const active =
                  selected?.field === cell.field && selected?.docId === cell.docId;
                return (
                  <td key={doc.id} className="px-2 py-2">
                    <button
                      type="button"
                      className={cn(
                        statusCellClass(cell.status),
                        "w-full",
                        active && "ring-2 ring-primary/40"
                      )}
                      onClick={() => onSelect(cell)}
                    >
                      <span className="line-clamp-2 font-medium text-foreground">
                        {cell.value}
                      </span>
                      <span className="mt-1 block">
                        <StatusBadge status={cell.status} className="text-[10px]" />
                      </span>
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
