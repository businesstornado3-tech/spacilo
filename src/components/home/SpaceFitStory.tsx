/**
 * Spacilo AI explained as a two-sided intelligence layer:
 * SCAN → UNDERSTAND → MATCH → FIT, with what each side gets from it.
 * Illustrative figures only — the real numbers come from the scan flows.
 */
import { Camera, Boxes, Ruler, Sparkles } from "lucide-react";

import { Reveal } from "@/components/common/Reveal";
import { AnimatedSpaceFitScore, SpaceFitAiMark } from "@/components/trust/SpaceFitAI";
import { ScanSpaceButton, ScanStuffButton } from "@/components/home/SpaceFitEntry";
import { SPACEFIT_DISCLAIMER } from "@/lib/spacefit";

const steps = [
  {
    icon: Camera,
    title: "Scan",
    body: "Photograph your belongings, or the space you want to rent out.",
  },
  {
    icon: Boxes,
    title: "Understand",
    body: "SpaceFit estimates items, volume and usable space — you review and correct it.",
  },
  {
    icon: Ruler,
    title: "Match",
    body: "Renters see spaces that can actually hold their stuff; hosts see who fits.",
  },
  {
    icon: Sparkles,
    title: "Fit",
    body: "A packing plan for renters, a price and capacity guide for hosts.",
  },
];

export function SpaceFitStory() {
  return (
    <section className="bg-surface">
      <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <Reveal>
          <SpaceFitAiMark size="sm" />
          <h2 className="mt-3 type-h2">One scan. Both sides of the deal.</h2>
          <p className="mt-3 max-w-xl type-body text-muted-foreground">
            Spacilo AI works for renters and hosts alike — estimating what needs storing, what a
            space can hold, and whether the two fit.
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

        <div className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Reveal>
            <article className="flex h-full flex-col rounded-3xl border border-border bg-card p-6 shadow-card">
              <h3 className="type-h3">If you need storage</h3>
              <p className="mt-2 type-body-sm text-muted-foreground">
                Scan your stuff and get an estimated storage requirement, then only look at spaces
                that can hold it.
              </p>
              <div className="mt-5 flex items-center gap-5">
                <AnimatedSpaceFitScore score={94} size="sm" className="shrink-0" />
                <ul className="grid gap-2 type-body-sm text-muted-foreground">
                  <li className="tabular-nums">18 items identified</li>
                  <li className="tabular-nums">5.4 m³ estimated requirement</li>
                  <li>Packing plan included</li>
                </ul>
              </div>
              <div className="mt-6">
                <ScanStuffButton from="homepage_spacefit_story" block={false} />
              </div>
            </article>
          </Reveal>

          <Reveal delay={80}>
            <article className="flex h-full flex-col rounded-3xl border border-border bg-card p-6 shadow-card">
              <h3 className="type-h3">If you have space</h3>
              <p className="mt-2 type-body-sm text-muted-foreground">
                Scan your garage, loft, shed or spare room to estimate usable capacity and a
                sensible monthly price for your area.
              </p>
              <ul className="mt-5 grid gap-2 type-body-sm text-muted-foreground">
                <li className="tabular-nums">Usable volume estimated from photos</li>
                <li>Obstacles and access noted</li>
                <li>Suggested monthly price you can adjust</li>
              </ul>
              <div className="mt-6">
                <ScanSpaceButton from="homepage_spacefit_story" block={false} />
              </div>
            </article>
          </Reveal>
        </div>

        <p className="mt-6 type-body-sm text-muted-foreground">{SPACEFIT_DISCLAIMER}</p>
      </div>
    </section>
  );
}
