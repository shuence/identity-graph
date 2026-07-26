import Link from "next/link";
import { Button } from "@/components/ui/button";

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_#e8effc_0%,_transparent_50%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.28] [background-image:linear-gradient(to_right,#e5e5e5_1px,transparent_1px),linear-gradient(to_bottom,#e5e5e5_1px,transparent_1px)] [background-size:72px_72px] [mask-image:radial-gradient(ellipse_at_center,black_25%,transparent_72%)]"
      />

      <div className="relative mx-auto flex min-h-[72dvh] max-w-7xl flex-col justify-center gap-7 px-4 py-20 md:px-8 md:py-28">
        <p className="animate-fade-up text-sm font-medium text-muted-foreground">
          IdentityGraph India
        </p>

        <h1 className="max-w-4xl animate-fade-up font-heading text-5xl font-semibold leading-[1.05] tracking-tight text-foreground sm:text-6xl md:text-7xl [animation-delay:60ms]">
          Suvidha Desk
        </h1>

        <p className="max-w-xl animate-fade-up text-lg text-muted-foreground md:text-xl [animation-delay:120ms]">
          When Aadhaar, DL, and the form disagree, catch it at the counter —
          before the portal sends the citizen home.
        </p>

        <div className="flex animate-fade-up flex-wrap items-center gap-3 [animation-delay:180ms]">
          <Button size="lg" render={<Link href="/app" />} nativeButton={false}>
            Open desk
          </Button>
          <Button
            size="lg"
            variant="outline"
            render={<Link href="#how" />}
            nativeButton={false}
          >
            How it works
          </Button>
        </div>
      </div>
    </section>
  );
}
