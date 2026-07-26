import Link from "next/link";
import { Button } from "@/components/ui/button";

const figures = [
  {
    value: "18%+",
    label: "Passport objections tied to mismatched identity records",
  },
  {
    value: "2–3",
    label: "People touch the same case before it reaches the portal",
  },
  {
    value: "1",
    label: "Return visit when the mismatch is found after upload",
  },
];

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_#e8effc_0%,_transparent_52%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.2] [background-image:linear-gradient(to_right,#e5e5e5_1px,transparent_1px),linear-gradient(to_bottom,#e5e5e5_1px,transparent_1px)] [background-size:72px_72px] [mask-image:radial-gradient(ellipse_at_center,black_22%,transparent_70%)]"
      />

      <div className="relative mx-auto flex max-w-7xl flex-col gap-10 px-4 py-16 md:gap-12 md:px-8 md:py-24 lg:py-28">
        <div className="flex max-w-4xl flex-col gap-6">
          <p className="animate-fade-up text-sm font-medium text-muted-foreground">
            IdentityGraph India · Suvidha Desk
          </p>

          <h1 className="animate-fade-up font-heading text-4xl font-semibold leading-[1.08] tracking-tight text-foreground sm:text-5xl md:text-6xl lg:text-[4.25rem] [animation-delay:60ms]">
            Citizens still fill identity forms by hand.
            <span className="mt-2 block text-primary">
              Portals reject them after they leave.
            </span>
          </h1>

          <p className="max-w-2xl animate-fade-up text-lg leading-relaxed text-muted-foreground md:text-xl [animation-delay:120ms]">
            Name spelling. Old address on the licence. New address on Aadhaar.
            The desk never saw the clash — until Parivahan or the bank did.
          </p>

          <div className="flex animate-fade-up flex-wrap items-center gap-3 [animation-delay:180ms]">
            <Button size="lg" render={<Link href="/app" />} nativeButton={false}>
              Open Suvidha Desk
            </Button>
            <Button
              size="lg"
              variant="outline"
              render={<Link href="#today" />}
              nativeButton={false}
            >
              How it fails today
            </Button>
          </div>
        </div>

        <div className="grid animate-fade-up gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-3 [animation-delay:220ms]">
          {figures.map((item) => (
            <div
              key={item.label}
              className="flex flex-col gap-2 bg-card px-5 py-6 md:px-6 md:py-7"
            >
              <p className="font-heading text-3xl font-semibold tabular-nums tracking-tight text-foreground md:text-4xl">
                {item.value}
              </p>
              <p className="max-w-[16rem] text-sm leading-snug text-muted-foreground">
                {item.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
