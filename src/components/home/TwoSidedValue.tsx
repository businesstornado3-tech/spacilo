/**
 * The two marketplace propositions, side by side and equal in weight.
 *
 * Evolved from the original v1.0 renter/host value sections: same messages,
 * modern presentation, each with its own call to action.
 */
import { Link } from "@tanstack/react-router";
import { ArrowRight, Home, Warehouse } from "lucide-react";

import { Reveal } from "@/components/common/Reveal";
import { HostEntryButton } from "@/components/home/HostEntryButton";

export function TwoSidedValue() {
  return (
    <section
      aria-labelledby="two-sided-heading"
      className="border-y border-border/70 bg-surface/60 py-10 sm:py-12"
    >
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <h2 id="two-sided-heading" className="sr-only">
          Two ways to use Spacilo
        </h2>

        <div className="grid gap-4 sm:grid-cols-2 sm:gap-5">
          <Reveal>
            <article className="flex h-full flex-col rounded-3xl border border-border bg-card p-6 shadow-card transition-shadow hover:shadow-raised sm:p-7">
              <Warehouse className="size-5 text-primary" aria-hidden="true" />
              <h3 className="mt-3 type-h3">Need storage?</h3>
              <p className="mt-2 max-w-sm type-body text-muted-foreground">
                Find trusted nearby garages, lofts, spare rooms and storage spaces — and see how
                your belongings fit before you book.
              </p>
              <div className="mt-auto pt-5">
                <Link
                  to="/find-storage"
                  className="inline-flex min-h-11 items-center gap-1.5 type-label text-primary underline-offset-4 hover:underline"
                >
                  Browse spaces near me
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </div>
            </article>
          </Reveal>

          <Reveal delay={80}>
            <article className="flex h-full flex-col rounded-3xl border border-border bg-card p-6 shadow-card transition-shadow hover:shadow-raised sm:p-7">
              <Home className="size-5 text-primary" aria-hidden="true" />
              <h3 className="mt-3 type-h3">Have unused space?</h3>
              <p className="mt-2 max-w-sm type-body text-muted-foreground">
                Turn your unused garage, loft, driveway or spare room into monthly income. You set
                the price and choose who to accept.
              </p>
              <div className="mt-auto pt-5">
                <HostEntryButton
                  label="See what I could earn"
                  from="homepage_two_sided"
                  variant="link"
                />
              </div>
            </article>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
