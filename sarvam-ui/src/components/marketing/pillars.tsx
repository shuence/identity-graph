const steps = [
  {
    who: "Citizen + operator",
    time: "15–25 min",
    title: "Paper at the counter",
    desc: "Aadhaar, DL, PAN, passbook. Form filled by hand or typed while someone waits.",
  },
  {
    who: "Operator",
    time: "10–20 min",
    title: "Retype into the portal",
    desc: "Same fields again into Sarathi, UIDAI, or tax systems. No check that the IDs agree.",
  },
  {
    who: "Portal → citizen",
    time: "Days later",
    title: "Rejection after the visit",
    desc: "Mohd vs Mohammed. Old CIDCO address vs new Aadhaar. Citizen returns. Desk starts over.",
  },
];

export function Pillars() {
  return (
    <section id="today" className="border-b border-border py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-4 md:px-8">
        <div className="mb-12 max-w-2xl">
          <h2 className="font-heading text-3xl font-semibold tracking-tight md:text-4xl">
            Today the friction is late.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            Two or three people already spent the hour. The failure shows up
            after the citizen has gone home.
          </p>
        </div>

        <div className="grid gap-0 overflow-hidden rounded-2xl border border-border md:grid-cols-3">
          {steps.map((step, i) => (
            <div
              key={step.title}
              className={
                i < steps.length - 1
                  ? "border-b border-border p-6 md:border-b-0 md:border-r md:p-8"
                  : "p-6 md:p-8"
              }
            >
              <div className="mb-5 flex items-baseline justify-between gap-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {step.who}
                </p>
                <p className="text-xs font-semibold tabular-nums text-status-blocker">
                  {step.time}
                </p>
              </div>
              <h3 className="font-heading text-xl font-semibold tracking-tight">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {step.desc}
              </p>
            </div>
          ))}
        </div>

        <p className="mt-8 max-w-2xl text-sm text-muted-foreground">
          Baseline:{" "}
          <span className="font-medium text-foreground">
            rejection discovered at the portal
          </span>
          . Impact we claim: the same risk named at the desk — same visit.
        </p>
      </div>
    </section>
  );
}
