/**
 * Marketplace journey (1D) — how Spacilo works for both sides.
 * Deliberately explains the marketplace, not the scanning capability.
 */
import { Reveal } from "@/components/common/Reveal";

const steps = [
  {
    n: "01",
    title: "Find or show",
    body: "Renters search nearby spaces. Hosts list the space they're not using.",
  },
  {
    n: "02",
    title: "Match",
    body: "Compare what needs storing with what a space can hold, before anyone commits.",
  },
  {
    n: "03",
    title: "Request",
    body: "Send the host your dates and belongings. The host reviews and responds.",
  },
  {
    n: "04",
    title: "Store",
    body: "Once the host accepts and payment is confirmed, storage begins.",
  },
];

export function HowItWorks() {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <Reveal>
        <h2 className="type-h2">How Spacilo works.</h2>
      </Reveal>
      <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((step, i) => (
          <Reveal as="li" key={step.n} delay={i * 60}>
            <div className="h-full rounded-2xl border border-border bg-card p-5">
              <span className="type-price text-primary-soft-foreground tabular-nums">{step.n}</span>
              <h3 className="mt-3 type-card-title">{step.title}</h3>
              <p className="mt-1.5 type-body-sm text-muted-foreground">{step.body}</p>
            </div>
          </Reveal>
        ))}
      </ol>
      <p className="mt-5 max-w-xl type-body-sm text-muted-foreground">
        Sending a request doesn't book the space or take payment. The host still needs to respond.
      </p>
    </section>
  );
}
