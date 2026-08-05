import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { Reveal } from "@/components/common/Reveal";

const steps = [
  {
    n: "01",
    title: "Show us your stuff",
    body: "Take photos or select what you want to store.",
  },
  {
    n: "02",
    title: "We estimate the space",
    body: "Spacilo AI helps work out approximately what you need.",
  },
  {
    n: "03",
    title: "Choose a nearby match",
    body: "Compare price, distance, access and verification.",
  },
  {
    n: "04",
    title: "Book and store",
    body: "Agree access arrangements and keep everything organised through the platform.",
  },
];

export function RenterJourney() {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
      <Reveal>
        <h2 className="type-h2">From stuff to stored.</h2>
      </Reveal>
      <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s, i) => (
          <Reveal as="li" key={s.n} delay={i * 60}>
            <div className="h-full rounded-2xl border border-border bg-card p-5 transition-transform duration-200 hover:-translate-y-0.5">
              <span className="type-price text-primary-soft-foreground tabular-nums">{s.n}</span>
              <h3 className="mt-3 type-card-title">{s.title}</h3>
              <p className="mt-1.5 type-body-sm text-muted-foreground">{s.body}</p>
            </div>
          </Reveal>
        ))}
      </ol>
      <Link
        to="/find-storage"
        className="mt-7 inline-flex items-center gap-1.5 type-nav text-primary underline-offset-4 hover:underline"
      >
        Find my space
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </section>
  );
}
