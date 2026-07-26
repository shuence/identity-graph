import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileScan, Mic, ShieldCheck } from "lucide-react";

const pillars = [
  {
    title: "Voice",
    desc: "Hindi field prompts while the citizen sits at the counter.",
    icon: Mic,
  },
  {
    title: "OCR",
    desc: "Scan IDs and filled forms. Review unsure fields before submit.",
    icon: FileScan,
  },
  {
    title: "Verify",
    desc: "Catch Mohd vs Mohammed before the portal does.",
    icon: ShieldCheck,
  },
];

export function Pillars() {
  return (
    <section id="pillars" className="border-b border-border py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-4 md:px-8">
        <div className="mb-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              How it works
            </p>
            <h2 className="max-w-xl font-heading text-3xl font-semibold tracking-tight md:text-4xl">
              Three steps at the desk
            </h2>
          </div>
          <Button render={<Link href="/app" />} nativeButton={false}>
            Open desk
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
