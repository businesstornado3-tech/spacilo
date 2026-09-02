/**
 * Why EarnRoom — three promises, each already demonstrated above.
 */
import { Boxes, Ruler, ShieldCheck } from "lucide-react";

import { Reveal } from "@/components/common/Reveal";

const POINTS = [
  {
    icon: Ruler,
    title: "Know it fits before you book",
    body: "EarnRoom AI plans from real item dimensions and the room's usable footprint.",
  },
  {
    icon: Boxes,
    title: "Earn money from unused space",
    body: "List a garage, loft, driveway or spare room. You set the price and accept the requests.",
  },
  {
    icon: ShieldCheck,
    title: "Planned safely and intelligently",
    body: "Fragile items stay off the bottom, heavy items stay low, the walkway stays clear.",
  },
];

export function WhySpacePlanner() {
  return (
    <section aria-labelledby="why-heading" className="py-9 sm:py-11">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <h2 id="why-heading" className="max-w-xl type-h2">
          Why EarnRoom.
        </h2>

        <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
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
