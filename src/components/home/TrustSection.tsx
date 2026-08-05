import { Link } from "@tanstack/react-router";
import { ArrowRight, BadgeCheck, Boxes, Camera, CreditCard, MapPinOff, Star } from "lucide-react";

import { Reveal } from "@/components/common/Reveal";

const items = [
  {
    icon: BadgeCheck,
    title: "Declared suitability",
    body: "Hosts record what their space is suitable for, and Spacilo checks that against what a renter declares.",
  },
  {
    icon: Boxes,
    title: "Declared belongings",
    body: "Hosts can review what renters intend to store before agreeing to a booking.",
  },
  {
    icon: Camera,
    title: "Digital inventory",
    body: "Create a photographic record when belongings enter storage.",
  },
  {
    icon: CreditCard,
    title: "Payments held to the agreed price",
    body: "The amount you pay is calculated server-side from the price the host accepted, and is processed by Stripe.",
  },
  {
    icon: Star,
    title: "Booking-based reviews",
    body: "Reputation is built through genuine marketplace activity.",
  },
  {
    icon: MapPinOff,
    title: "Private addresses",
    body: "Residential addresses aren't publicly displayed in search results.",
  },
];

export function TrustSection() {
  return (
    <section className="bg-surface">
      <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <Reveal>
          <p className="type-overline text-muted-foreground">Trust &amp; Safety</p>
          <h2 className="mt-3 type-h2">
            Storage between people,
            <br />
            built around trust.
          </h2>
          <p className="mt-3 max-w-xl type-body text-muted-foreground">
            When homes and belongings are involved, transparency matters.
          </p>
        </Reveal>

        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map(({ icon: Icon, title, body }, i) => (
            <Reveal as="li" key={title} delay={i * 50}>
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

        <Link
          to="/trust"
          className="mt-7 inline-flex items-center gap-1.5 type-nav text-primary underline-offset-4 hover:underline"
        >
          Explore Trust &amp; Safety
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
