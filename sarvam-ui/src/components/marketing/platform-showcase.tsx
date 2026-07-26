import Link from "next/link";
import { Button } from "@/components/ui/button";

export function PlatformShowcase() {
  return (
    <section id="desk" className="border-b border-border bg-secondary/35 py-20 md:py-28">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 md:px-8 lg:grid-cols-2 lg:items-center lg:gap-16">
        <div>
          <h2 className="font-heading text-3xl font-semibold tracking-tight md:text-4xl">
            Built for the CSC operator, not a slide deck.
          </h2>
          <p className="mt-4 text-muted-foreground">
            Voice prompts in Hindi, OCR on the scans, and a clear read on what
            will block the portal — so the desk finishes the case in one sitting.
          </p>
          <ul className="mt-8 flex flex-col gap-3 text-sm text-foreground">
            <li className="flex gap-3">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
              Form and KYC fields side by side
            </li>
            <li className="flex gap-3">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
              Harmless spelling variants stay quiet; real blockers don’t
            </li>
            <li className="flex gap-3">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
              Download the filled form and audit when you’re done
            </li>
          </ul>
          <Button
            className="mt-8"
            size="lg"
            render={<Link href="/app" />}
            nativeButton={false}
          >
            Try the desk
          </Button>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 md:p-8">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Example · DL address update
          </p>
          <p className="mt-4 font-heading text-2xl font-semibold leading-snug tracking-tight">
            Old CIDCO address still on the licence. New address on Aadhaar.
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            The desk surfaces that before Parivahan does — roughly a quarter
            hour back in the day, and one less return trip.
          </p>
          <div className="mt-8 flex flex-wrap gap-2">
            <span className="rounded-full border border-status-match/30 bg-status-match/10 px-3 py-1 text-xs text-status-match">
              Name match
            </span>
            <span className="rounded-full border border-status-variant/30 bg-status-variant/10 px-3 py-1 text-xs text-status-variant">
              Format variant
            </span>
            <span className="rounded-full border border-status-blocker/30 bg-status-blocker/10 px-3 py-1 text-xs text-status-blocker">
              Address risk
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
