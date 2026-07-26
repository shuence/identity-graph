import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GitCompare, ScanSearch, ShieldAlert } from "lucide-react";

const modes = [
  {
    title: "Multi-document graph",
    desc: "Evaluate 4–8 IDs together — Aadhaar, PAN, Voter, bank, school — not isolated pairwise checks.",
    icon: GitCompare,
  },
  {
    title: "Variant vs blocker",
    desc: "Phonetic + Indic normalization: “Mohd” ↔ “Mohammed” is green. DOB 1988 → 1989 is red.",
    icon: ShieldAlert,
  },
  {
    title: "Honesty over hallucination",
    desc: "Wet stamps and obscured text stay UNCERTAIN. We never invent a date to look confident.",
    icon: ScanSearch,
  },
];

export function PlatformShowcase() {
  return (
    <section id="platform" className="border-b border-border py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-4 md:px-8">
        <div className="mb-10 max-w-2xl">
          <Badge variant="secondary" className="mb-4 rounded-full">
            Core innovation
          </Badge>
          <h2 className="font-heading text-3xl font-semibold tracking-tight md:text-4xl">
            From extraction to reconciliation & remediation
          </h2>
          <p className="mt-3 text-muted-foreground">
            B2B tools treat mismatches as fraud. Citizens get a diagnosis, a primary
            document to fix, and proof they can show an officer.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {modes.map((item) => (
            <Card key={item.title} className="border-border bg-card shadow-none">
              <CardHeader>
                <item.icon className="mb-2 size-5 text-primary" />
                <CardTitle className="font-heading text-xl">{item.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {item.desc}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-10 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-status-variant/30 bg-status-variant/10 px-4 py-3 text-sm">
            <span className="font-medium text-status-variant">Green</span>
            <span className="text-muted-foreground"> — Harmless variant</span>
          </div>
          <div className="rounded-xl border border-status-blocker/30 bg-status-blocker/10 px-4 py-3 text-sm">
            <span className="font-medium text-status-blocker">Red</span>
            <span className="text-muted-foreground"> — Critical blocker</span>
          </div>
          <div className="rounded-xl border border-status-uncertain/40 bg-status-uncertain/15 px-4 py-3 text-sm">
            <span className="font-medium text-status-uncertain">Yellow</span>
            <span className="text-muted-foreground"> — Obscured / uncertain</span>
          </div>
        </div>
      </div>
    </section>
  );
}
