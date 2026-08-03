/**
 * Compact three-step renter journey. Deliberately stops at "send a request":
 * booking and payment do not exist yet.
 */
import { Reveal } from "@/components/common/Reveal";

const steps = [
  { n: "01", title: "Find a space", body: "Search around your neighbourhood." },
  { n: "02", title: "Check the fit", body: "Compare the space with what you need to store." },
  { n: "03", title: "Send a request", body: "Tell the host your dates and belongings." },
];

export function HowItWorks() {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <Reveal>
        <h2 className="type-h2">How it works.</h2>
      </Reveal>
      <ol className="mt-8 grid gap-4 sm:grid-cols-3">
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
