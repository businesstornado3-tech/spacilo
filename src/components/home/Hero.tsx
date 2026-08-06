import { useNavigate } from "@tanstack/react-router";

import heroPhoto from "@/assets/hero-storage.jpg";
import { SearchControls } from "@/components/search/SearchControls";
import { SpaceFitEntry } from "@/components/home/SpaceFitEntry";
import { HeroAiPreview } from "@/components/home/HeroAiPreview";

import { track } from "@/lib/analytics/tracker";

/**
 * First viewport. The marketplace proposition leads, then the real Spacilo AI
 * launcher (the signature interaction), then the postcode search for visitors
 * who already know where they need storage.
 *
 * No camera, no AI code and no analysis runs here — the launcher only routes
 * into the existing renter and host Spacilo AI experiences.
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

          <SpaceFitEntry from="homepage_hero" className="mt-6" />

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
        </div>

        <div className="overflow-hidden rounded-3xl bg-card shadow-raised lg:sticky lg:top-24">
          <img
            src={heroPhoto}
            alt="Household boxes, a bicycle and suitcases stored neatly in a British home garage"
            width={1600}
            height={1200}
            fetchPriority="high"
            className="aspect-[4/3] w-full object-cover"
          />
          <HeroAiPreview />

        </div>
      </div>
    </section>
  );
}
