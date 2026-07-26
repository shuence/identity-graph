import Link from "next/link";

const columns = [
  {
    title: "Product",
    links: [
      { label: "Suvidha Desk", href: "/app" },
      { label: "Link mobile ↔ Aadhaar", href: "/app?service=link_mobile_aadhaar" },
    ],
  },
  {
    title: "Artifacts",
    links: [
      { label: "Live OCR review", href: "/app" },
      { label: "Filled form PDF", href: "/app" },
      { label: "Identity audit PDF", href: "/app" },
    ],
  },
  {
    title: "Epoch",
    links: [
      { label: "Sarvam AI", href: "https://www.sarvam.ai/" },
      { label: "Design system", href: "/" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="bg-card py-16">
      <div className="mx-auto max-w-7xl px-4 md:px-8">
        <div className="mb-12 flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="font-heading text-xl font-semibold">
              IdentityGraph <span className="text-primary">India</span>
            </p>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              Cross-document identity reconciliation that fixes mismatched personal
              records before applications fail.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-secondary/50 px-5 py-4">
            <p className="text-sm font-medium">Live OCR + handwritten review</p>
            <Link
              href="/app"
              className="mt-1 inline-block text-sm text-primary hover:underline"
            >
              Open Suvidha Desk
            </Link>
          </div>
        </div>

        <div className="grid gap-8 sm:grid-cols-3">
          {columns.map((col) => (
            <div key={col.title}>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {col.title}
              </h3>
              <ul className="flex flex-col gap-2">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-foreground/80 transition-colors hover:text-primary"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
          IdentityGraph India · Sarvam Epoch hackathon · Design inspired by Sarvam AI.
        </div>
      </div>
    </footer>
  );
}
