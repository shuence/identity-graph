const partners = [
  "Passport Seva",
  "e-KYC",
  "Retail loans",
  "NSDL Form 49A",
  "UIDAI",
  "NVSP",
  "Bank KYC",
  "CAs & agents",
  "Aadhaar",
  "PAN",
  "Voter ID",
  "SSLC",
];

export function LogoMarquee() {
  const row = [...partners, ...partners];

  return (
    <section className="border-b border-border py-12 md:py-16">
      <p className="mb-8 text-center text-sm text-muted-foreground">
        Where IdentityGraph unblocks India
      </p>
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-linear-to-r from-background to-transparent md:w-24" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-linear-to-l from-background to-transparent md:w-24" />
        <div className="animate-marquee flex w-max gap-10 px-4 md:gap-16">
          {row.map((name, i) => (
            <span
              key={`${name}-${i}`}
              className="shrink-0 font-heading text-lg font-semibold tracking-tight text-foreground/35 md:text-xl"
            >
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
