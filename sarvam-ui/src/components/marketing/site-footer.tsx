import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-card py-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 sm:flex-row sm:items-center sm:justify-between md:px-8">
        <p className="font-heading text-base font-semibold">
          IdentityGraph <span className="text-primary">India</span>
        </p>
        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          <Link href="/app" className="hover:text-primary">
            Desk
          </Link>
          <a
            href="https://www.sarvam.ai/"
            className="hover:text-primary"
            rel="noreferrer"
            target="_blank"
          >
            Sarvam
          </a>
        </div>
      </div>
    </footer>
  );
}
