import { Link } from "@tanstack/react-router";
import { ArrowRight, Boxes, CheckCircle2, Clock, MapPinOff } from "lucide-react";

import { Reveal } from "@/components/common/Reveal";
import { TrustCard } from "@/components/trust/TrustIndicators";

const cards = [
  {
    icon: CheckCircle2,
    title: "Choose who you accept",
    body: "Review booking requests before agreeing.",
  },
  {
    icon: Boxes,
    title: "Know what's being stored",
    body: "Renters declare their belongings before a booking begins.",
  },
  {
    icon: Clock,
    title: "Control access",
    body: "Choose when and how renters can access your space.",
  },
  {
    icon: MapPinOff,
    title: "Keep your address private",
    body: "Your exact residential address isn't displayed publicly.",
  },
];

export function HostControl() {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
      <Reveal>
        <h2 className="type-h2">Your space. Your rules.</h2>
        <p className="mt-3 max-w-xl type-body text-muted-foreground">
          You decide who stores with you, what they store and how access works.
        </p>
      </Reveal>
      <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c, i) => (
          <Reveal as="li" key={c.title} delay={i * 60}>
            <TrustCard icon={c.icon} title={c.title} className="h-full">
              {c.body}
            </TrustCard>
          </Reveal>
        ))}
      </ul>
      <Link
        to="/how-it-works"
        className="mt-7 inline-flex items-center gap-1.5 type-nav text-primary underline-offset-4 hover:underline"
      >
        See how hosting works
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </section>
  );
}
