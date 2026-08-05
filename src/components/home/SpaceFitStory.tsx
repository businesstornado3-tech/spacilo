/**
 * Spacilo AI, introduced once for renters: PHOTO → UNDERSTAND → ESTIMATE → MATCH.
 * Bounded language only — every output is a reviewable estimate, never a
 * guarantee. Routes to the existing renter scan journey.
 */
import { Camera, Boxes, Ruler, Sparkles } from "lucide-react";

import { Reveal } from "@/components/common/Reveal";
import { AnimatedSpaceFitScore, SpaceFitAiMark } from "@/components/trust/SpaceFitAI";
import { ScanStuffButton } from "@/components/home/SpaceFitEntry";
import { SPACEFIT_DISCLAIMER } from "@/lib/spacefit";

const steps = [
  {
    icon: Camera,
    title: "Photo",
    body: "Take a photo of what you want to store — no tape measure, no box counting.",
  },
  {
    icon: Boxes,
    title: "Understand",
    body: "Spacilo AI proposes an itemised list. You review, correct and confirm it.",
  },
  {
    icon: Ruler,
    title: "Estimate",
    body: "You get an estimated storage requirement based on the items you confirmed.",
  },
  {
    icon: Sparkles,
    title: "Match",
    body: "See nearby spaces that may fit, with a packing plan you can check.",
  },
];

export function SpaceFitStory() {
  return (
    <section className="bg-surface">
      <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <Reveal>
          <SpaceFitAiMark size="sm" />
          <h2 className="mt-3 type-h2">Meet Spacilo AI.</h2>
          <p className="mt-2 type-h3 text-muted-foreground">
            Don't measure boxes. Just show us.
          </p>
          <p className="mt-3 max-w-xl type-body text-muted-foreground">
            Take a photo of what you want to store. Spacilo AI helps identify your belongings,
            estimate the space they may need and find spaces that could fit.
          </p>
        </Reveal>

        <ol className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, i) => (
            <Reveal as="li" key={step.title} delay={i * 70}>
              <div className="h-full rounded-2xl border border-border bg-card p-5 shadow-card">
                <span className="grid size-10 place-items-center rounded-xl bg-signal-soft text-signal-soft-foreground">
                  <step.icon className="size-5" aria-hidden="true" />
                </span>
                <p className="mt-4 type-overline text-muted-foreground">Step {i + 1}</p>
                <h3 className="mt-1 type-h3">{step.title}</h3>
                <p className="mt-2 type-body-sm text-muted-foreground">{step.body}</p>
              </div>
            </Reveal>
          ))}
        </ol>

        <Reveal>
          <div className="mt-8 flex flex-col gap-6 rounded-3xl border border-border bg-card p-6 shadow-card sm:flex-row sm:items-center">
            <AnimatedSpaceFitScore score={94} size="sm" className="shrink-0" />
            <div className="min-w-0">
              <p className="type-body-sm text-muted-foreground">
                An illustrative result: items identified from photos, an estimated requirement in
                m³, and spaces nearby that may fit it.
              </p>
              <div className="mt-4">
                <ScanStuffButton from="homepage_spacefit_story" block={false}>
                  Try Spacilo AI
                </ScanStuffButton>
              </div>
            </div>
          </div>
        </Reveal>

        <p className="mt-6 type-body-sm text-muted-foreground">{SPACEFIT_DISCLAIMER}</p>
      </div>
    </section>
  );
}
