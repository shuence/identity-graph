import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Crosshair, Link2, Sparkles } from "lucide-react";

const pillars = [
  {
    title: "Source-traceable provenance",
    desc: "Every flagged field links to its bounding-box on the original scan so users verify context instantly.",
    icon: Crosshair,
  },
  {
    title: "Priority remediation pathway",
    desc: "Identify the single primary document causing the most blockers and route to the correct portal.",
    icon: Link2,
  },
  {
    title: "Built for Epoch",
    desc: "Sarvam-ready design system underneath — Indic OCR and TTS can plug into the same shell.",
    icon: Sparkles,
  },
];

export function Pillars() {
  return (
    <section className="border-b border-border py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-4 md:px-8">
        <div className="mb-12 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <h2 className="max-w-xl font-heading text-3xl font-semibold tracking-tight md:text-4xl">
            Built for citizens, usable by officers
          </h2>
          <Button render={<Link href="/app" />} nativeButton={false}>
            Open workspace
          </Button>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {pillars.map((item) => (
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
      </div>
    </section>
  );
}
