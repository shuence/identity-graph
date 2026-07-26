import Link from "next/link";
import { Button } from "@/components/ui/button";

export function IndiaCan() {
  return (
    <section className="border-b border-border bg-indigo-deep py-20 text-primary-foreground md:py-24">
      <div className="mx-auto flex max-w-7xl flex-col items-start gap-6 px-4 md:px-8">
        <h2 className="font-heading text-3xl font-semibold tracking-tight md:text-4xl">
          18%+ passport objections start here
        </h2>
        <p className="max-w-2xl text-base leading-relaxed text-primary-foreground/80 md:text-lg">
          Every adult holds 5–8 identity documents. Almost no one has identical details
          across all of them. Small transliteration shifts and clerical typos trigger
          rejections — while enterprises treat citizens as fraud signals.
        </p>
        <Button
          variant="secondary"
          render={<Link href="/app" />}
          nativeButton={false}
        >
          Diagnose your stack
        </Button>
      </div>
    </section>
  );
}
