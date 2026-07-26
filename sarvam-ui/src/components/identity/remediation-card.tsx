import Link from "next/link";
import { ArrowUpRight, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { RemediationAction } from "@/lib/identity/types";

export function RemediationCard({ action }: { action: RemediationAction }) {
  return (
    <Card className="border-primary/25 bg-secondary/40 shadow-none">
      <CardHeader className="gap-2">
        <div className="flex items-center gap-2">
          <Wrench className="size-4 text-primary" />
          <CardTitle className="font-heading text-lg">Priority remediation</CardTitle>
        </div>
        <p className="text-sm text-muted-foreground">
          Fix this document first — it clears the most downstream blockers.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="rounded-full">{action.primaryDocLabel}</Badge>
          <Badge variant="outline" className="rounded-full border-status-blocker/40 text-status-blocker">
            {action.blockerCount} blocker{action.blockerCount === 1 ? "" : "s"}
          </Badge>
        </div>
        <ol className="flex flex-col gap-2 text-sm text-foreground">
          {action.steps.map((step, i) => (
            <li key={step} className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {i + 1}
              </span>
              <span className="pt-0.5 text-muted-foreground">{step}</span>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap gap-2">
          <Button
            render={<a href={action.portalUrl} target="_blank" rel="noreferrer" />}
            nativeButton={false}
          >
            Open {action.portalName}
            <ArrowUpRight data-icon="inline-end" />
          </Button>
          <Button variant="outline" render={<Link href="#audit" />} nativeButton={false}>
            Preview audit file
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
