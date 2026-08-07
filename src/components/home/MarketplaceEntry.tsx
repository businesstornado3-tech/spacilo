/**
 * Chapter 5 — the marketplace.
 *
 * The planner is the product; the marketplace is where a plan becomes a real
 * space. One proposition, one search, nothing else.
 */
import { useNavigate } from "@tanstack/react-router";

import heroPhoto from "@/assets/hero-storage.jpg";
import { SearchControls } from "@/components/search/SearchControls";
import { track } from "@/lib/analytics/tracker";

export function MarketplaceEntry() {
  const navigate = useNavigate();

  return (
    <section
      aria-labelledby="marketplace-heading"
      className="border-y border-border/70 bg-surface/60 py-12 sm:py-16"
    >
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 sm:px-6 lg:grid-cols-2 lg:items-center lg:gap-12">
        <div className="min-w-0">
          <h2 id="marketplace-heading" className="max-w-[16ch] type-h1">
            Then find the space nearby.
          </h2>
          <p className="mt-3 max-w-md type-body text-muted-foreground">
            Garages, lofts and spare rooms from neighbours — with the plan you just made.
          </p>

          <div className="mt-6 rounded-3xl border border-border bg-card p-4 shadow-card sm:p-5">
            <SearchControls
              submitLabel="Find storage"
              onSubmit={({ location, radius }) => {
                track("storage_search_started", { props: { radius, from: "homepage" } });
                void navigate({ to: "/search", search: { location, radius } });
              }}
            />
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl bg-card shadow-raised">
          <img
            src={heroPhoto}
            alt="Household boxes, a bicycle and suitcases stored neatly in a British home garage"
            width={1600}
            height={1200}
            loading="lazy"
            className="aspect-[4/3] w-full object-cover"
          />
        </div>
      </div>
    </section>
  );
}
