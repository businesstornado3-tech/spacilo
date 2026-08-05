import * as React from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { categoryChips, homeListings } from "@/data/home";
import { ListingCard } from "@/components/marketplace/ListingCard";
import { Reveal } from "@/components/common/Reveal";

export function StorageNearYou() {
  const [active, setActive] = React.useState("all");

  const chip = categoryChips.find((c) => c.id === active);
  const listings = chip?.types
    ? homeListings.filter((l) => chip.types!.includes(l.spaceType))
    : homeListings;

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
      <Reveal>
        <h2 className="type-h2">Real storage nearby.</h2>
        <p className="mt-3 max-w-xl type-body text-muted-foreground">
          Browse spaces in the Portsmouth pilot area — garages, spare rooms, lofts and sheds, with
          the monthly price shown up front.
        </p>
      </Reveal>

      <div className="carousel-track -mx-4 mt-7 gap-2 px-4 pb-1 sm:mx-0 sm:px-0">
        {categoryChips.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={active === c.id}
            onClick={() => setActive(c.id)}
            className={cn(
              "carousel-item h-10 rounded-full border px-4 type-nav transition-[background-color,color,border-color,transform] duration-200 active:scale-[0.97]",
              active === c.id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border-strong bg-card text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      {listings.length > 0 ? (
        <ul className="carousel-track -mx-4 mt-6 gap-4 px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4">
          {listings.map((l, i) => (
            <li key={l.id} className="carousel-item w-[78%] max-w-80 sm:w-auto sm:max-w-none">
              <Reveal delay={i * 60} className="h-full">
                <ListingCard
                  id={l.id}
                  title={l.title}
                  areaName={l.areaName}
                  distanceMiles={l.distanceMiles}
                  pricePerMonth={l.pricePerMonth}
                  rating={l.rating}
                  reviewCount={l.reviewCount}
                  hostVerified={l.hostVerified}
                  spaceFitScore={l.spaceFitScore}
                  securityFeatures={l.features}
                  {...(l.extraFeatures ? { extraFeatures: l.extraFeatures } : {})}
                  photoUrl={l.photoUrl}
                  photoAlt={l.photoAlt}
                  className="h-full"
                />
              </Reveal>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-6 rounded-2xl border border-border bg-card p-6 type-body-sm text-muted-foreground">
          No example spaces of this type yet — we're adding more across the Portsmouth pilot area.
        </p>
      )}

      <Link
        to="/find-storage"
        className="mt-7 inline-flex items-center gap-1.5 type-nav text-primary underline-offset-4 hover:underline"
      >
        See spaces near me
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </section>
  );
}
