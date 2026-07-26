import Link from "next/link";
import { Button } from "@/components/ui/button";

export function FinalCta() {
  return (
    <section
      id="outcome"
      className="relative overflow-hidden border-b border-border py-20 md:py-28"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,_#e8effc_0%,_transparent_55%)]"
      />
      <div className="relative mx-auto max-w-7xl px-4 md:px-8">
        <h2 className="max-w-3xl font-heading text-3xl font-semibold tracking-tight md:text-5xl">
          One outcome: the pack is clean enough to upload.
        </h2>
        <p className="mt-4 max-w-xl text-lg text-muted-foreground">
          Fewer return visits. Risks named at the counter. Minutes saved vs the
          same failure at the portal.
        </p>

        <div className="mt-10 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card px-5 py-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Before
            </p>
            <p className="mt-2 text-sm leading-relaxed text-foreground">
              Upload → reject → citizen returns → desk retypes
            </p>
          </div>
          <div className="rounded-2xl border border-primary/25 bg-secondary px-5 py-5">
            <p className="text-xs font-medium uppercase tracking-wide text-primary">
              After
            </p>
            <p className="mt-2 text-sm leading-relaxed text-foreground">
              Risks on screen → fix or pack → same visit
            </p>
          </div>
        </div>

        <Button
          className="mt-10"
          size="lg"
          render={<Link href="/app" />}
          nativeButton={false}
        >
          Open Suvidha Desk
        </Button>
      </div>
    </section>
  );
}
