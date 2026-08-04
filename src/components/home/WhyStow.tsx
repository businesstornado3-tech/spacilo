/** Compact benefit section — claims stay within what the product actually does. */
import { MapPin, MapPinOff, Ruler, Tag } from "lucide-react";

import { Reveal } from "@/components/common/Reveal";

const benefits = [
  {
    icon: MapPin,
    title: "Closer to home",
    body: "Discover storage in neighbourhood spaces around you.",
  },
  {
    icon: Ruler,
    title: "Only pay for the space you need",
    body: "Describe what you're storing and SpaceFit helps identify suitable nearby spaces, instead of a fixed-size unit. It's an estimate, not a guarantee.",
  },
  {
    icon: Tag,
    title: "Clear monthly pricing",
    body: "See the host's monthly price before sending a request.",
  },
  {
    icon: MapPinOff,
    title: "Privacy built in",
    body: "Exact storage addresses stay private during public browsing — only an approximate location is shown.",
  },
];

export function WhyStow() {
  return (
    <section className="bg-surface">
      <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <Reveal>
          <h2 className="type-h2">Storage designed around real life.</h2>
        </Reveal>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {benefits.map(({ icon: Icon, title, body }, i) => (
            <Reveal as="li" key={title} delay={i * 60}>
              <article className="h-full rounded-2xl border border-border bg-card p-5">
                <span className="grid size-9 place-items-center rounded-xl bg-primary-soft text-primary-soft-foreground">
                  <Icon className="size-4.5" aria-hidden="true" />
                </span>
                <h3 className="mt-3.5 type-card-title">{title}</h3>
                <p className="mt-1.5 type-body-sm text-muted-foreground">{body}</p>
              </article>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
