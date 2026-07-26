import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileScan, Mic, ShieldCheck } from "lucide-react";

const pillars = [
  {
    title: "Voice for the desk",
    desc: "Bulbul speaks every field prompt in Hindi; Saaras can capture the citizen's answer. Built for operators who fill forms while the citizen sits beside them.",
    icon: Mic,
  },
  {
    title: "Document intelligence",
    desc: "Sarvam Vision + 30B OCR on printed IDs and handwritten block-letter forms. Operator reviews UNCERTAIN fields before anything hits the portal.",
    icon: FileScan,
  },
  {
    title: "Mismatch before rejection",
    desc: "Variant vs blocker classification across Aadhaar, PAN, EPIC, DL, passbook — then a portal-ready pack with the operator checklist from the real form KB.",
    icon: ShieldCheck,
  },
];

export function Pillars() {
  return (
    <section id="pillars" className="border-b border-border py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-4 md:px-8">
        <div className="mb-12 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-col gap-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Sarvam stack · Epoch positioning
            </p>
            <h2 className="max-w-xl font-heading text-3xl font-semibold tracking-tight md:text-4xl">
              Voice + documents for Bharat&apos;s counters
            </h2>
          </div>
          <Button render={<Link href="/app" />} nativeButton={false}>
            Open Suvidha Desk
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
