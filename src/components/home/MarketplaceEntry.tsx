/**
 * Marketplace search entry.
 *
 * Follows the planner section, so the copy carries the visitor across: they
 * have a layout, now they need the space.
 */
import { useNavigate } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";


import heroPhoto from "@/assets/hero-storage.jpg";
import { SearchControls } from "@/components/search/SearchControls";
import { CoachMark } from "@/components/onboarding/CoachMark";
import { track } from "@/lib/analytics/tracker";

export function MarketplaceEntry() {
  const navigate = useNavigate();

  return (
    <section
      aria-labelledby="marketplace-heading"
      className="border-y border-border/70 bg-surface/60 py-9 sm:py-11"
    >
      {/* Mobile reads top-to-bottom: copy, a compact image banner, then the
          search card. On lg the same three blocks fall into two columns with
          the image spanning the right-hand side. */}
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 sm:px-6 lg:grid lg:grid-cols-2 lg:items-center lg:gap-x-10 lg:gap-y-5">
        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          <h2 id="marketplace-heading" className="max-w-[18ch] type-h2">
            Now find the perfect space nearby.
          </h2>
          <p className="mt-3 max-w-md type-body text-muted-foreground">
            Your belongings have an optimised layout. Next: trusted spaces — garages, lofts, spare
            rooms and more — from neighbours near you.
          </p>
        </div>

        <div className="relative overflow-hidden rounded-3xl bg-card shadow-raised lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <img
            src={heroPhoto}
            alt="Household boxes, a bicycle and suitcases stored neatly in a British home garage"
            width={1600}
            height={1200}
            loading="lazy"
            decoding="async"
            className="h-[190px] w-full object-cover sm:h-[220px] lg:aspect-[4/3] lg:h-auto"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-ink/55 to-transparent"
          />
          <p className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-background/90 px-3 py-1.5 type-badge text-foreground shadow-card backdrop-blur">
            <ShieldCheck className="size-3.5 text-primary" aria-hidden="true" />
            Verified hosts near you
          </p>
        </div>

        <div className="rounded-3xl border border-border bg-card p-4 shadow-card sm:p-5 lg:col-start-1 lg:row-start-2">
          <CoachMark id="home_search" className="mb-3" />
          <SearchControls
            submitLabel="Search nearby"
            onSubmit={({ location, radius }) => {
              track("storage_search_started", { props: { radius, from: "homepage" } });
              void navigate({ to: "/search", search: { location, radius } });
            }}
          />
        </div>
      </div>

    </section>
  );
}
