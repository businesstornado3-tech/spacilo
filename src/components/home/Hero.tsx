import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import heroPhoto from "@/assets/hero-storage.jpg";
import { SearchControls } from "@/components/search/SearchControls";
import { SpaceFitEntry } from "@/components/home/SpaceFitEntry";
import { SpaceFitSpark } from "@/components/trust/SpaceFitAI";
import { HostEntryButton } from "@/components/home/HostEntryButton";
import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics";

/**
 * First viewport. Three things must land immediately, on mobile too:
 * find storage, earn from space, and SpaceFit AI making both easier.
 */
export function Hero() {
  const navigate = useNavigate();

  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 pb-10 pt-6 sm:px-6 sm:pb-14 sm:pt-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:items-center lg:gap-12 lg:pb-16 lg:pt-14">
        <div className="animate-fade min-w-0">
          <p className="type-overline text-signal-soft-foreground">
            <SpaceFitSpark /> Neighbourhood storage, powered by SpaceFit AI
          </p>

          <h1 className="mt-3 max-w-[15ch] type-hero">Make space for what matters.</h1>

          <p className="mt-4 max-w-md type-body text-muted-foreground">
            Storage that fits. Space that earns. Find the right storage close to home, or turn a
            garage, loft, shed or spare room into monthly income — with SpaceFit AI working out what
            fits on both sides.
          </p>

          <SpaceFitEntry className="mt-6" from="homepage_hero" />

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

        <div className="relative overflow-hidden rounded-3xl shadow-raised">
          <img
            src={heroPhoto}
            alt="Household boxes, a bicycle and suitcases stored neatly in a British home garage"
            width={1600}
            height={1200}
            fetchPriority="high"
            className="aspect-[5/4] w-full object-cover sm:aspect-[4/3] lg:aspect-[5/4]"
          />
        </div>
      </div>
    </section>
  );
}
