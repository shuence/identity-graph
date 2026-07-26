import type { IdentityCase } from "@/lib/identity/types";
import { StatusBadge } from "./status-badge";

export function SummaryStrip({ identityCase }: { identityCase: IdentityCase }) {
  const { summary } = identityCase;
  return (
    <div className="grid gap-3 sm:grid-cols-4">
      {(
        [
          ["match", "Exact matches", summary.matches],
          ["variant", "Harmless variants", summary.variants],
          ["blocker", "Critical blockers", summary.blockers],
          ["uncertain", "Obscured / uncertain", summary.uncertain],
        ] as const
      ).map(([status, label, value]) => (
        <div
          key={status}
          className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3"
        >
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="font-heading text-2xl font-semibold">{value}</p>
          </div>
          <StatusBadge status={status} />
        </div>
      ))}
    </div>
  );
}
