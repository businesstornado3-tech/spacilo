import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { SearchControls } from "@/components/search/SearchControls";
import { SpaceFitDemo } from "@/components/home/SpaceFitDemo";
import { HostEntryButton } from "@/components/home/HostEntryButton";
import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics/tracker";

/**
 * First viewport. The marketplace proposition leads: space nearby for renters,
 * income at home for hosts. Spacilo AI is introduced only as a supporting
 * capability here — its dedicated entry points live further down the page.
 */
export function Hero() {
  const navigate = useNavigate();

  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-40 h-[28rem] bg-[radial-gradient(60%_60%_at_50%_40%,var(--color-signal-soft),transparent_70%)] opacity-80"
      />
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 pb-10 pt-6 sm:px-6 sm:pb-14 sm:pt-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:items-start lg:gap-12 lg:pb-16 lg:pt-10">
        <div className="animate-fade min-w-0">
          <h1 className="max-w-[14ch] type-hero">
            <span className="block">Space nearby.</span>
            <span className="block">Income at home.</span>
          </h1>

          <p className="mt-4 max-w-md type-body text-muted-foreground">
            Find trusted neighbourhood storage — or earn from the space you're not using.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <Link
                to="/search"
                search={{ location: "", radius: 5, sort: "recommended" }}
                onClick={() =>
                  track("storage_search_started", { props: { from: "homepage_hero_find_storage" } })
                }
              >
                Find storage
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
            <HostEntryButton
              label="Start earning"
              from="homepage_hero"
              size="lg"
              variant="secondary"
              withArrow={false}
            />
          </div>

          <div className="mt-6 rounded-2xl bg-card p-4 shadow-card sm:p-5">
            <p className="type-label">Know your area already?</p>
            <p className="mt-1 mb-3 type-body-sm text-muted-foreground">
              Search garages, spare rooms and other unused spaces around your neighbourhood.
            </p>
            <SearchControls
              submitLabel="Find storage"
              onSubmit={({ location, radius }) => {
                track("storage_search_started", { props: { radius, from: "homepage" } });
                void navigate({ to: "/search", search: { location, radius } });
              }}
            />
          </div>

          <p className="mt-4 max-w-md type-body-sm text-muted-foreground">
            Not sure how much space you need? Spacilo AI can estimate it from a photo — more on that
            below.
          </p>
        </div>

        <SpaceFitDemo className="lg:sticky lg:top-24" />
      </div>
    </section>
  );
}
