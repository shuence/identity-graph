import { Badge } from "@/components/ui/badge";
import type { CellStatus } from "@/lib/identity/types";
import { cn } from "@/lib/utils";

const labels: Record<CellStatus, string> = {
  match: "Match",
  variant: "Harmless variant",
  blocker: "Critical blocker",
  uncertain: "Uncertain",
  missing: "Missing",
};

const styles: Record<CellStatus, string> = {
  match: "border-status-match/30 bg-status-match/10 text-status-match",
  variant: "border-status-variant/30 bg-status-variant/10 text-status-variant",
  blocker: "border-status-blocker/30 bg-status-blocker/10 text-status-blocker",
  uncertain: "border-status-uncertain/40 bg-status-uncertain/15 text-status-uncertain",
  missing: "border-border bg-muted text-muted-foreground",
};

export function StatusBadge({
  status,
  className,
}: {
  status: CellStatus;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", styles[status], className)}
    >
      {labels[status]}
    </Badge>
  );
}

export function statusCellClass(status: CellStatus) {
  return cn(
    "cursor-pointer rounded-lg border px-2 py-2 text-left text-xs transition-all",
    status === "match" && "border-status-match/25 bg-status-match/8 hover:bg-status-match/15",
    status === "variant" &&
      "border-status-variant/30 bg-status-variant/10 hover:bg-status-variant/18",
    status === "blocker" &&
      "border-status-blocker/35 bg-status-blocker/10 hover:bg-status-blocker/18",
    status === "uncertain" &&
      "border-status-uncertain/40 bg-status-uncertain/12 hover:bg-status-uncertain/20",
    status === "missing" && "border-border bg-muted/50 text-muted-foreground"
  );
}
