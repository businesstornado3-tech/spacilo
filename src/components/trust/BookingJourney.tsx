/**
 * "Where am I, and what happens next?" — rendered from an authoritative
 * status only. This component decides nothing.
 */
import { Check, Circle, CreditCard } from "lucide-react";

import { commitmentCopy, journeySteps, nextStepCopy, type JourneyStage } from "@/lib/trust/journey";

export function BookingJourney({ stage }: { stage: JourneyStage }) {
  const steps = journeySteps(stage);

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
      <h2 className="type-h3">Where you are</h2>
      <p className="mt-1 type-body-sm text-muted-foreground">{commitmentCopy(stage)}</p>

      <ol className="mt-4 space-y-3">
        {steps.map((step) => (
          <li key={step.stage} className="flex gap-3">
            {step.done ? (
              <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
            ) : step.payment ? (
              <CreditCard
                className={`mt-0.5 size-4 shrink-0 ${step.current ? "text-primary" : "text-muted-foreground"}`}
                aria-hidden="true"
              />
            ) : (
              <Circle
                className={`mt-0.5 size-4 shrink-0 ${step.current ? "text-primary" : "text-muted-foreground"}`}
                aria-hidden="true"
              />
            )}
            <div className="min-w-0">
              <p className={`type-body-sm ${step.current ? "font-semibold" : ""}`}>{step.title}</p>
              <p className="type-body-sm text-muted-foreground">{step.detail}</p>
            </div>
          </li>
        ))}
      </ol>

      <p className="mt-4 type-body-sm">
        <span className="font-semibold">Next: </span>
        {nextStepCopy(stage)}
      </p>
    </section>
  );
}
