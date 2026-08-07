/**
 * Chapter 4 — why SpacePlanner™.
 *
 * Three facts, each one demonstrated by the chapters above rather than
 * explained at length. Deliberately short.
 */
import { Boxes, Ruler, ShieldCheck } from "lucide-react";

import { Reveal } from "@/components/common/Reveal";

const POINTS = [
  {
    icon: Ruler,
    title: "Measured, not guessed",
    body: "Every plan works from real item dimensions and the room's usable footprint.",
  },
  {
    icon: ShieldCheck,
    title: "Safe by design",
    body: "Fragile items stay off the bottom, heavy items stay low, the walkway stays clear.",
  },
  {
    icon: Boxes,
    title: "Right-sized storage",
    body: "See how much space you actually need before you pay for space you don't.",
  },
];

export function WhySpacePlanner() {
  return (
    <section aria-labelledby="why-heading" className="py-12 sm:py-16">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <h2 id="why-heading" className="max-w-xl type-h1">
          Planning you can check.
        </h2>

        <ul className="mt-8 grid gap-4 sm:grid-cols-3">
          {POINTS.map((point, index) => (
            <Reveal as="li" key={point.title} delay={index * 80}>
              <div className="h-full rounded-3xl border border-border bg-card p-5 shadow-card">
                <point.icon className="size-5 text-primary" aria-hidden="true" />
                <h3 className="mt-3 type-card-title">{point.title}</h3>
                <p className="mt-2 type-body-sm text-muted-foreground">{point.body}</p>
              </div>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
