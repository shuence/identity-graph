import Link from "next/link";
import { Button } from "@/components/ui/button";

export function FinalCta() {
  return (
    <section className="relative overflow-hidden border-b border-border py-20 md:py-28">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,_#e8effc_0%,_transparent_55%)]"
      />
      <div className="relative mx-auto flex max-w-7xl flex-col items-start gap-6 px-4 md:px-8">
        <h2 className="max-w-2xl font-heading text-3xl font-semibold tracking-tight md:text-4xl">
          Leave with a pack that can upload.
        </h2>
        <p className="max-w-lg text-muted-foreground">
          Open Suvidha Desk for the next citizen at the counter.
        </p>
        <Button size="lg" render={<Link href="/app" />} nativeButton={false}>
          Open desk
        </Button>
      </div>
    </section>
  );
}
