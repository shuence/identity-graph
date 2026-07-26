import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_#e8effc_0%,_transparent_55%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:linear-gradient(to_right,#e5e5e5_1px,transparent_1px),linear-gradient(to_bottom,#e5e5e5_1px,transparent_1px)] [background-size:64px_64px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]"
      />

      <div className="relative mx-auto flex max-w-7xl flex-col gap-8 px-4 py-20 md:px-8 md:py-28 lg:py-36">
        <Badge
          variant="secondary"
          className="w-fit animate-fade-up rounded-full px-3 py-1 text-xs font-medium"
        >
          IdentityGraph India · Sarvam Epoch Buildathon
        </Badge>

        <h1 className="max-w-4xl animate-fade-up font-heading text-5xl font-semibold leading-[1.05] tracking-tight text-foreground md:text-6xl lg:text-7xl [animation-delay:80ms]">
          IdentityGraph
        </h1>

        <p className="max-w-2xl animate-fade-up text-lg text-muted-foreground md:text-xl [animation-delay:140ms]">
          The Suvidha desk for forms India still fills by hand — Aadhaar Form 1,
          PAN CR, ECI Form 6/8, passport annexures. Sarvam voice asks in Hindi,
          Vision reads block letters, 30B structures the pack before the portal
          rejects Mohd vs Mohammed.
        </p>

        <div className="flex animate-fade-up flex-wrap gap-3 [animation-delay:200ms]">
          <Button size="lg" render={<Link href="/app" />} nativeButton={false}>
            Open Suvidha Desk
          </Button>
          <Button
            size="lg"
            variant="outline"
            render={<Link href="/app" />}
            nativeButton={false}
          >
            Live OCR + Bulbul prompts
          </Button>
        </div>
      </div>
    </section>
  );
}
