const steps = [
  {
    title: "At the counter",
    desc: "IDs and a filled form land on the desk while the citizen waits.",
  },
  {
    title: "Before upload",
    desc: "Name, DOB, and address are checked across documents — not after Sarathi rejects.",
  },
  {
    title: "Same visit",
    desc: "Fix what’s wrong, or leave with a pack that’s ready to submit.",
  },
];

export function Pillars() {
  return (
    <section id="how" className="border-b border-border py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-4 md:px-8">
        <div className="mb-12 max-w-2xl">
          <h2 className="font-heading text-3xl font-semibold tracking-tight md:text-4xl">
            Most visits fail after the citizen has left.
          </h2>
          <p className="mt-3 text-muted-foreground">
            The mismatch was always on the table — the portal just found it
            later.
          </p>
        </div>

        <div className="grid gap-10 md:grid-cols-3 md:gap-8">
          {steps.map((step) => (
            <div key={step.title}>
              <h3 className="font-heading text-xl font-semibold tracking-tight">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {step.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
