/**
 * Two-sided value section — the first thing after the hero.
 * Renter card links to the existing /search route; the host card reuses the
 * shared host entry CTA so there is only one host onboarding path.
 */
import { Link } from "@tanstack/react-router";
import { ArrowRight, Boxes, Home } from "lucide-react";

import { brand } from "@/config/brand";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/common/Reveal";
import { HostEntryButton } from "@/components/home/HostEntryButton";

const renterPoints = [
  "Only pay for the space you need",
  "Find storage around your neighbourhood",
  "Compare spaces and monthly prices",
  "Request the space before any booking or payment",
];

const hostPoints = [
  "Turn unused space into potential monthly income",
  "Set your own monthly price",
  "Choose what types of belongings you accept",
  "Pause or manage your listing when needed",
];

export function TwoSidedValue() {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <Reveal>
        <h2 className="type-h2">Space works better when it's shared.</h2>
        <p className="mt-3 max-w-xl type-body text-muted-foreground">
          {brand.name} connects people who need storage with people who have space they're not using.
        </p>
      </Reveal>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <Reveal>
          <article className="flex h-full flex-col rounded-3xl border border-border bg-card p-6 shadow-card transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-raised">
            <span className="grid size-10 place-items-center rounded-xl bg-primary-soft text-primary-soft-foreground">
              <Boxes className="size-5" aria-hidden="true" />
            </span>
            <h3 className="mt-4 type-h3">I need space</h3>
            <p className="mt-2 type-body-sm text-muted-foreground">
              Tell us what you're storing. SpaceFit helps you find nearby storage that fits your
              belongings — so you don't pay for space you don't need.
            </p>
            <ul className="mt-4 space-y-2.5">
              {renterPoints.map((point) => (
                <li key={point} className="flex gap-2.5 type-body-sm text-muted-foreground">
                  <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                  {point}
                </li>
              ))}
            </ul>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <Link to="/search" search={{ location: "", radius: 5, sort: "recommended" }}>
                  Find my space
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </Button>
              <ScanStuffButton from="homepage_two_sided" block={false} />
            </div>
          </article>
        </Reveal>

        <Reveal delay={80}>
          <article className="flex h-full flex-col rounded-3xl border border-border bg-accent-soft p-6 text-accent-foreground shadow-card transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-raised">
            <span className="grid size-10 place-items-center rounded-xl bg-card/70 text-accent-foreground">
              <Home className="size-5" aria-hidden="true" />
            </span>
            <h3 className="mt-4 type-h3">I have space</h3>
            <p className="mt-2 type-body-sm text-accent-foreground/80">
              Got an empty garage, loft, spare room or shed? Put your unused space to work and turn
              it into extra monthly income.
            </p>
            <ul className="mt-4 space-y-2.5">
              {hostPoints.map((point) => (
                <li key={point} className="flex gap-2.5 type-body-sm text-accent-foreground/80">
                  <span
                    aria-hidden="true"
                    className="mt-2 size-1.5 shrink-0 rounded-full bg-accent-foreground/50"
                  />
                  {point}
                </li>
              ))}
            </ul>
            <div className="mt-6 self-start">
              <HostEntryButton label="Start earning" from="homepage_two_sided" />
            </div>
          </article>
        </Reveal>
      </div>
    </section>
  );
}
