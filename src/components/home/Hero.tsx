import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { SearchControls } from "@/components/search/SearchControls";
import { ScanSpaceButton, ScanStuffButton } from "@/components/home/SpaceFitEntry";
import { SpaceFitDemo } from "@/components/home/SpaceFitDemo";
import { SpaceFitAiMark } from "@/components/trust/SpaceFitAI";
import { HostEntryButton } from "@/components/home/HostEntryButton";
import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics";

/**
 * First viewport. Both sides of the marketplace carry equal weight —
 * space nearby for renters, income at home for hosts — with SpaceFit AI
 * demonstrated right beside the headline.
 */
export function Hero() {
  const navigate = useNavigate();

  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 pb-10 pt-6 sm:px-6 sm:pb-14 sm:pt-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:items-start lg:gap-12 lg:pb-16 lg:pt-10">
        <div className="animate-fade min-w-0">
          <h1 className="max-w-[14ch] type-hero">
            <span className="block">Space nearby.</span>
            <span className="block">Income at home.</span>
          </h1>

          <p className="mt-4 max-w-md type-body text-muted-foreground">
            Find trusted neighbourhood storage — or earn from the space you're not using.
          </p>

          <div className="mt-6 rounded-3xl border border-signal/25 bg-signal-soft/45 p-4 shadow-card sm:p-5">
            <SpaceFitAiMark size="sm" />
            <p className="mt-3 type-h3">Your stuff. Your space. Just show us.</p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="flex h-full flex-col rounded-2xl bg-card p-4">
                <ScanStuffButton from="homepage_hero" />
                <p className="mt-2 type-body-sm text-muted-foreground">
                  How much space do I really need?
                </p>
              </div>
              <div className="flex h-full flex-col rounded-2xl bg-card p-4">
                <ScanSpaceButton from="homepage_hero" />
                <p className="mt-2 type-body-sm text-muted-foreground">
                  What could my unused space earn?
                </p>
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button asChild size="lg" variant="outline">
              <Link
                to="/search"
                search={{ location: "", radius: 5, sort: "recommended" }}
                onClick={() => track("location_search_submitted", { from: "homepage_hero_browse" })}
              >
                Browse storage nearby
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
            <HostEntryButton
              label="List my space"
              from="homepage_hero"
              size="lg"
              variant="ghost"
              withArrow={false}
            />
          </div>

          <div className="mt-5 rounded-2xl bg-card p-4 shadow-card sm:p-5">
            <p className="type-label">Know your area already?</p>
            <p className="mt-1 mb-3 type-body-sm text-muted-foreground">
              Search garages, spare rooms and other unused spaces around your neighbourhood.
            </p>
            <SearchControls
              submitLabel="Find storage"
              onSubmit={({ location, radius }) => {
                track("location_search_submitted", { radius, from: "homepage" });
                void navigate({ to: "/search", search: { location, radius } });
              }}
            />
          </div>
        </div>

        <SpaceFitDemo className="lg:sticky lg:top-24" />
      </div>
    </section>
  );
}
