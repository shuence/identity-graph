"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { createCase, listCases, type DeskCase } from "@/lib/api/auth";

export default function CasesPage() {
  const router = useRouter();
  const [cases, setCases] = useState<DeskCase[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    void listCases()
      .then(setCases)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"))
      .finally(() => setBusy(false));
  }, []);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        variant="desk"
        title="My cases"
        description="Resume work for this operator — history stays on your account."
        actions={
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const c = await createCase({ status: "draft", step: 0 });
                router.push(`/app?case=${c.id}`);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Could not create");
              } finally {
                setBusy(false);
              }
            }}
          >
            New case
          </Button>
        }
      />

      {error ? (
        <p className="text-sm text-status-blocker">{error}</p>
      ) : null}

      {busy && !cases.length ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : null}

      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {cases.map((c) => (
          <Link
            key={c.id}
            href={`/app?case=${c.id}`}
            className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {c.citizen_label || c.service_id || "Untitled case"}
              </p>
              <p className="text-xs text-muted-foreground">
                Step {c.step} · {c.status} ·{" "}
                {new Date(c.updated_at * 1000).toLocaleString()}
              </p>
            </div>
            <span className="text-xs text-primary">Resume</span>
          </Link>
        ))}
        {!busy && cases.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            No saved cases yet. Start on the desk — progress auto-saves.
          </p>
        ) : null}
      </div>
    </div>
  );
}
