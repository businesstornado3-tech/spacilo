import { Reveal } from "@/components/common/Reveal";
import type { JourneyStep } from "@/data/how-it-works";

export function JourneySteps({
  heading,
  intro,
  steps,
}: {
  heading: string;
  intro: string;
  steps: JourneyStep[];
}) {
  return (
    <div>
      <Reveal>
        <h2 className="type-h2">{heading}</h2>
        <p className="mt-2 max-w-prose type-body text-muted-foreground">{intro}</p>
      </Reveal>
      <ol className="mt-7 grid gap-4 sm:grid-cols-2">
        {steps.map((step, i) => (
          <Reveal as="li" key={step.number} delay={i * 40}>
            <article className="h-full rounded-2xl border border-border bg-card p-5">
              <span className="grid size-9 place-items-center rounded-full bg-primary-soft type-nav text-primary-soft-foreground">
                {step.number}
              </span>
              <h3 className="mt-3.5 type-card-title">{step.title}</h3>
              <p className="mt-1.5 type-body-sm text-muted-foreground">{step.body}</p>
            </article>
          </Reveal>
        ))}
      </ol>
    </div>
  );
}
