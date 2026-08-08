/**
 * Meet Spacilo AI — four honest steps, one CTA.
 *
 * Presentational: nothing here loads AI code. It explains the pipeline the
 * real scan journeys run, in the order a visitor experiences it.
 */
import { Camera, Ruler, ScanSearch, Sparkles } from "lucide-react";

import { Reveal } from "@/components/common/Reveal";
import { SpaceFitAiMark } from "@/components/trust/SpaceFitAI";
import { ScanStuffButton } from "@/components/home/SpaceFitEntry";

const STEPS = [
  {
    icon: Camera,
    step: "Step 1",
    title: "Photo",
    body: "Snap or upload your belongings, or your empty space.",
  },
  {
    icon: ScanSearch,
    step: "Step 2",
    title: "Understand",
    body: "Spacilo AI recognises items and proposes what it sees.",
  },
  {
    icon: Ruler,
    step: "Step 3",
    title: "Estimate",
    body: "You get an estimated volume — review and correct anything.",
  },
  {
    icon: Sparkles,
    step: "Step 4",
    title: "Match",
    body: "We show nearby spaces your belongings should fit into.",
  },
];

export function MeetSpaciloAI() {
  return (
    <section
      aria-labelledby="meet-ai-heading"
      className="border-y border-border/70 bg-surface/60 py-9 sm:py-11"
    >
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="min-w-0">
            <div className="inline-flex">
              <SpaceFitAiMark size="sm" />
            </div>
            <h2 id="meet-ai-heading" className="mt-3 text-balance type-h2">
              Meet Spacilo AI. Don't measure boxes — just show us.
            </h2>
            <p className="mt-2 max-w-lg type-body-sm text-muted-foreground">
              Estimates you can review and correct. Never a guarantee, always a starting point.
            </p>
          </div>
        </div>

        <ol className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {STEPS.map((step, index) => (
            <Reveal as="li" key={step.title} delay={index * 70}>
              <div className="h-full rounded-3xl border border-border bg-card p-5 shadow-card transition-shadow hover:shadow-raised">
                <span className="type-overline text-muted-foreground">{step.step}</span>
                <step.icon className="mt-2 size-5 text-primary" aria-hidden="true" />
                <h3 className="mt-2 type-card-title">{step.title}</h3>
                <p className="mt-1.5 type-body-sm text-muted-foreground">{step.body}</p>
              </div>
            </Reveal>
          ))}
        </ol>

        <div className="mt-6 flex flex-wrap items-center gap-4">
          <ScanStuffButton from="homepage_meet_ai" block={false}>
            Try Spacilo AI
          </ScanStuffButton>
          <p className="type-badge text-muted-foreground">
            Typical fit indicator: <span className="text-foreground">92% estimated fit</span> —
            illustrative only.
          </p>
        </div>
      </div>
    </section>
  );
}
