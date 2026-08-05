/**
 * "SpaceFit for your stuff" panel on a public listing.
 * Signed-out visitors and renters without an inventory see a prompt instead —
 * ordinary public browsing is never blocked.
 */
import { Link } from "@tanstack/react-router";
import { Boxes } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useSpaceFitForSpace } from "@/hooks/useSpaceFitMatches";
import { ReasonList, SpaceFitResultBadge, WhyThisMatches } from "@/components/spacefit/SpaceFitResult";
import { PackPlanView } from "@/components/spacefit/PackPlanView";
import { buildSpaceFitPlanSnapshot, packSpaceFromListing, type PackSpaceSource } from "@/lib/spacefit/plan";
import type { MatchSpace } from "@/lib/spacefit/types";

export function ListingSpaceFitPanel({
  space,
  listing,
}: {
  space: MatchSpace;
  /** Raw listing row, used for the live packing preview's geometry. */
  listing?: PackSpaceSource;
}) {
  const { user } = useAuth();
  const { result, items } = useSpaceFitForSpace(user ? space : null);
  const hasInventory = items.length > 0;

  if (!user || !hasInventory || !result) {
    return (
      <section className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-card">
        <div className="flex items-start gap-3">
          <Boxes className="mt-0.5 size-5 text-primary" aria-hidden="true" />
          <div className="min-w-0">
            <h2 className="type-h3">Add your stuff to see your SpaceFit</h2>
            <p className="mt-1 type-body-sm text-muted-foreground">
              Tell us what you&apos;re storing and we&apos;ll estimate how well this space suits it.
            </p>
            <Button asChild size="sm" className="mt-3">
              <Link to={user ? "/renter/inventory" : "/get-started"}>
                {user ? "Add my stuff" : "Get started"}
              </Link>
            </Button>
          </div>
        </div>
      </section>
    );
  }

  // Live preview only: nothing is stored until a request is sent.
  const preview = listing ? buildSpaceFitPlanSnapshot(items, packSpaceFromListing(listing)) : null;

  return (
    <>
      <section className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="type-h3">SpaceFit for your stuff</h2>
          <SpaceFitResultBadge result={result} />
        </div>
        <p className="mt-1 type-body-sm font-semibold">{result.label}</p>
        <div className="mt-3">
          {result.compatible ? (
            <ReasonList positives={result.positives} warnings={result.warnings} limit={4} />
          ) : (
            <ReasonList failures={result.hard_failures.map((failure) => failure.message)} />
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <WhyThisMatches result={result} />
          <Button asChild variant="ghost" size="sm">
            <Link to="/renter/matches">See all your matches</Link>
          </Button>
        </div>
      </section>

      {preview ? (
        <PackPlanView
          plan={preview.plan}
          space={preview.space}
          title="How your stuff could fit"
          intro="A suggested arrangement for the items you've confirmed in My Stuff."
          className="mt-6"
        />
      ) : null}
    </>
  );
}

