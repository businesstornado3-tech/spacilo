/**
 * Real storage nearby — illustrative pilot-area listings.
 *
 * Presentational only: these are sample spaces for the Portsmouth pilot, and
 * the section exists to make "nearby storage" concrete before a visitor
 * searches. The single CTA browses the real marketplace.
 */
import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { ListingCard } from "@/components/marketplace/ListingCard";
import { Reveal } from "@/components/common/Reveal";
import { homeListings } from "@/data/home";
import { track } from "@/lib/analytics/tracker";

export function NearbySpaces() {
  const listings = homeListings.slice(0, 4);

  return (
    <section aria-labelledby="nearby-heading" className="py-9 sm:py-11">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4">
          <div className="min-w-0">
            <h2 id="nearby-heading" className="type-h2">
              Real storage nearby.
            </h2>
            <p className="mt-2 max-w-md type-body-sm text-muted-foreground">
              Garages, spare rooms and lofts from neighbours in the pilot area. Sample spaces shown
              for illustration.
            </p>
          </div>
        </div>

        <ul className="mobile-rail mobile-rail-bleed mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {listings.map((listing, index) => (
            <Reveal as="li" key={listing.id} delay={index * 70} className="mobile-rail-card">
              <ListingCard
                id={listing.id}
                title={listing.title}
                areaName={listing.areaName}
                distanceMiles={listing.distanceMiles}
                pricePerMonth={listing.pricePerMonth}
                rating={listing.rating}
                reviewCount={listing.reviewCount}
                hostVerified={listing.hostVerified}
                spaceFitScore={listing.spaceFitScore}
                securityFeatures={listing.features}
                extraFeatures={listing.extraFeatures ?? []}
                photoUrl={listing.photoUrl}
                photoAlt={listing.photoAlt}
                className="h-full transition-[transform,box-shadow] duration-300 hover:-translate-y-1.5 hover:shadow-raised"
              />
            </Reveal>
          ))}
        </ul>

        <div className="mt-6">
          <Button
            asChild
            variant="secondary"
            size="lg"
            onClick={() =>
              track("cta_clicked", { props: { cta: "browse_spaces", from: "homepage_nearby" } })
            }
          >
            <Link to="/search">Browse nearby spaces</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
