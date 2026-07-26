import Link from "next/link";
import { Button } from "@/components/ui/button";

export function FinalCta() {
  return (
    <section className="relative overflow-hidden border-b border-border py-24 md:py-32">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,_#e8effc_0%,_transparent_60%)]"
      />
      <div className="relative mx-auto flex max-w-7xl flex-col items-start gap-6 px-4 md:px-8">
        <h2 className="max-w-3xl font-heading text-4xl font-semibold tracking-tight md:text-5xl">
          Reconcile the stack.
          <br />
          Fix the blocker. Share the audit.
        </h2>
        <Button size="lg" render={<Link href="/app" />} nativeButton={false}>
          Launch Suvidha Desk
        </Button>
      </div>
    </section>
  );
}
