import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GitCompare, ScanSearch, ShieldAlert } from "lucide-react";

const modes = [
  {
    title: "All IDs together",
    desc: "Aadhaar, PAN, voter, bank — one check, not pairwise chaos.",
    icon: GitCompare,
  },
  {
    title: "Variant vs blocker",
    desc: "Mohd ↔ Mohammed is fine. Wrong year of birth is not.",
    icon: ShieldAlert,
  },
  {
    title: "No guessing",
    desc: "Unreadable stays uncertain. We never invent a date.",
    icon: ScanSearch,
  },
];

export function PlatformShowcase() {
  return (
    <section id="platform" className="border-b border-border py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-4 md:px-8">
        <div className="mb-10 max-w-xl">
          <Badge variant="secondary" className="mb-4 rounded-full">
            Checks
          </Badge>
          <h2 className="font-heading text-3xl font-semibold tracking-tight md:text-4xl">
            Clear signals, not a novel
          </h2>
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

        <div className="mt-10 flex flex-wrap gap-3 text-sm">
          <span className="rounded-full border border-status-variant/30 bg-status-variant/10 px-3 py-1.5 text-status-variant">
            Match / variant
          </span>
          <span className="rounded-full border border-status-blocker/30 bg-status-blocker/10 px-3 py-1.5 text-status-blocker">
            Blocker
          </span>
          <span className="rounded-full border border-status-uncertain/40 bg-status-uncertain/15 px-3 py-1.5 text-status-uncertain">
            Uncertain
          </span>
        </div>
      </div>
    </section>
  );
}
