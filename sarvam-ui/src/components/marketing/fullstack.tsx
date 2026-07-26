const columns = [
  {
    title: "Documents in scope",
    items: [
      ["Aadhaar", "UIDAI"],
      ["PAN", "Income Tax"],
      ["Voter ID", "ECI"],
      ["Bank / Ration / School", "Supporting stack"],
    ],
  },
  {
    title: "Signals we classify",
    items: [
      ["Variant", "Transliteration / abbreviation"],
      ["Blocker", "DOB year, hard mismatches"],
      ["Uncertain", "Obscured / unreadable"],
      ["Match", "Aligned fields"],
    ],
  },
  {
    title: "Remediation targets",
    items: [
      ["NSDL Form 49A", "PAN corrections"],
      ["myAadhaar", "UIDAI updates"],
      ["NVSP Form 8", "Voter corrections"],
      ["Bank KYC", "Passbook / CIF update"],
    ],
  },
];

export function Fullstack() {
  return (
    <section className="border-b border-border bg-card py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-4 md:px-8">
        <h2 className="mb-12 max-w-2xl font-heading text-3xl font-semibold tracking-tight md:text-4xl">
          The identity stack India actually uses
        </h2>
        <div className="grid gap-8 md:grid-cols-3">
          {columns.map((col) => (
            <div key={col.title}>
              <h3 className="mb-5 text-sm font-medium uppercase tracking-wider text-muted-foreground">
                {col.title}
              </h3>
              <ul className="flex flex-col gap-4">
                {col.items.map(([name, label]) => (
                  <li
                    key={name}
                    className="flex items-baseline justify-between gap-4 border-b border-border pb-3"
                  >
                    <span className="font-heading text-lg font-semibold">{name}</span>
                    <span className="text-sm text-muted-foreground">{label}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
