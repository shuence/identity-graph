import Link from "next/link";
import { Button } from "@/components/ui/button";

const outcomes = [
  { value: "~16 min", label: "Saved vs finding the blocker at Parivahan" },
  { value: "2", label: "Critical address risks caught on the RTO sample" },
  { value: "1 pack", label: "Filled form + audit — ready to upload or fix" },
];

export function PlatformShowcase() {
  return (
    <section
      id="desk"
      className="border-b border-border bg-secondary/30 py-20 md:py-28"
    >
      <div className="mx-auto max-w-7xl px-4 md:px-8">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-end lg:gap-16">
          <div>
            <h2 className="font-heading text-3xl font-semibold tracking-tight md:text-4xl">
              Suvidha Desk sits between the paper and the portal.
            </h2>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
              One interaction: load the case, see what will reject, leave with a
              pack — or fix it before the citizen walks out.
            </p>
            <Button
              className="mt-8"
              size="lg"
              render={<Link href="/app" />}
              nativeButton={false}
            >
              Run the live desk
            </Button>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6 md:p-8">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              What changes
            </p>
            <p className="mt-3 font-heading text-2xl font-semibold leading-snug tracking-tight">
              Old address on the licence. New address on Aadhaar. Desk sees it
              first.
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              {outcomes.map((item) => (
                <div key={item.label}>
                  <p className="font-heading text-2xl font-semibold tabular-nums text-primary">
                    {item.value}
                  </p>
                  <p className="mt-1 text-xs leading-snug text-muted-foreground">
                    {item.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
