import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Check } from "lucide-react";

const cases = [
  {
    company: "Passport Seva",
    metric: "Name / DOB objections",
    desc: "Surface blockers before filing — reduce the 18%+ objection class tied to mismatched IDs.",
  },
  {
    company: "Retail lending",
    metric: "e-KYC rejections",
    desc: "Give loan agents a shareable audit instead of a silent fraud flag.",
  },
  {
    company: "Citizen self-serve",
    metric: "One primary fix",
    desc: "Route users to NSDL / UIDAI / NVSP with the document that unblocks the most fields.",
  },
];

const features = [
  {
    title: "For applicants",
    points: [
      "Upload full document stack",
      "See green / red / yellow matrix",
      "Get one remediation path",
      "Export Verified Identity Audit File",
    ],
  },
  {
    title: "For officers & CAs",
    points: [
      "Trace every value to a scan region",
      "UNCERTAIN never becomes a guess",
      "Explain variants vs fraud signals",
      "Print-ready audit PDF",
    ],
  },
  {
    title: "For builders",
    points: [
      "Sarvam-styled design tokens",
      "Plug-in OCR / digitisation later",
      "Indic name normalization hooks",
      "Hackathon-ready app shell",
    ],
  },
];

export function Enterprise() {
  return (
    <>
      <section className="border-b border-border py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-4 md:px-8">
          <h2 className="mb-10 max-w-xl font-heading text-3xl font-semibold tracking-tight md:text-4xl">
            Where mismatches hurt most
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            {cases.map((item) => (
              <Card key={item.company} className="border-border bg-card shadow-none">
                <CardHeader>
                  <Badge variant="secondary" className="w-fit rounded-full">
                    {item.company}
                  </Badge>
                  <CardTitle className="font-heading text-xl leading-snug">
                    {item.metric}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{item.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section id="enterprise" className="border-b border-border py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-4 md:px-8">
          <h2 className="mb-12 max-w-xl font-heading text-3xl font-semibold tracking-tight md:text-4xl">
            Built for the people who unblock India&apos;s paperwork
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            {features.map((feature) => (
              <Card key={feature.title} className="border-border bg-card shadow-none">
                <CardHeader>
                  <CardTitle className="font-heading text-xl">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="flex flex-col gap-3">
                    {feature.points.map((point) => (
                      <li key={point} className="flex items-start gap-2 text-sm">
                        <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                        <span className="text-muted-foreground">{point}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
          <Button className="mt-8" render={<Link href="/app" />} nativeButton={false}>
            Run the demo
          </Button>
        </div>
      </section>
    </>
  );
}
