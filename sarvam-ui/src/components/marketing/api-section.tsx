import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, LayoutGrid, Route } from "lucide-react";

const outputs = [
  {
    title: "Cross-document matrix",
    desc: "Color-coded field × document view with click-through provenance.",
    icon: LayoutGrid,
  },
  {
    title: "Remediation card",
    desc: "Names the primary document causing most blockers and the exact portal (e.g. NSDL Form 49A).",
    icon: Route,
  },
  {
    title: "Verified Identity Audit File",
    desc: "Printable PDF applicants can show bank officers, loan agents, or CAs.",
    icon: FileText,
  },
];

export function ApiSection() {
  return (
    <section id="apis" className="border-b border-border py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-4 md:px-8">
        <div className="mb-12 max-w-2xl">
          <h2 className="font-heading text-3xl font-semibold tracking-tight md:text-4xl">
            Key outputs & artifacts
          </h2>
          <p className="mt-3 text-muted-foreground">
            Everything a citizen needs to diagnose, fix, and explain identity mismatches.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {outputs.map((item) => (
            <Card
              key={item.title}
              className="border-border bg-card shadow-none transition-colors hover:border-primary/30"
            >
              <CardHeader>
                <item.icon className="mb-2 size-5 text-primary" />
                <CardTitle className="font-heading text-lg">{item.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Button className="mt-8" render={<Link href="/app" />} nativeButton={false}>
          Open Suvidha Desk
        </Button>
      </div>
    </section>
  );
}
