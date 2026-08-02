import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Boxes, Camera, ChevronDown, Sparkles } from "lucide-react";

import { brand } from "@/config/brand";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/common/Skeletons";
import { EmptyState, ErrorState } from "@/components/common/States";
import { MatchCard, IncompatibleRow } from "@/components/spacefit/MatchCard";
import { useSpaceFitMatches } from "@/hooks/useSpaceFitMatches";
import { usePendingDetections } from "@/hooks/useSpaceFitVision";
import { formatM3 } from "@/lib/spaces";
import { SPACEFIT_MATCH_DISCLAIMER } from "@/lib/spacefit/config";

const title = "Your SpaceFit matches — " + brand.name;
const description = "Storage spaces ranked by how well they suit the belongings you've confirmed.";

export const Route = createFileRoute("/_authenticated/renter/matches")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MatchesPage,
});

function MatchesPage() {
  const { inventoryId, items, matchInventory, compatible, incompatible, isLoading, error } =
    useSpaceFitMatches();
  const { data: pending } = usePendingDetections(inventoryId);
  const [showIncompatible, setShowIncompatible] = React.useState(false);

  return (
    <AppLayout mode="renter" title="Your SpaceFit matches" description={description}>
      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-80 w-full" />
        </div>
      ) : error ? (
        <ErrorState onRetry={() => window.location.reload()} />
      ) : items.length === 0 ? (
        <div className="space-y-4">
          <EmptyState
            icon={Boxes}
            title="Add what you're storing first"
            description="SpaceFit compares your confirmed belongings with each space, so we need your inventory before we can match."
          />
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild>
              <Link to="/renter/inventory/photos">
                <Camera aria-hidden="true" />
                Scan my stuff
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link to="/renter/inventory/add">Add items manually</Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {(pending?.length ?? 0) > 0 ? (
            <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-signal/25 bg-signal-soft/40 p-4">
              <Sparkles className="size-5 text-primary" aria-hidden="true" />
              <p className="min-w-0 flex-1 type-body-sm">
                You have suggestions waiting to be reviewed. They aren&apos;t included in these
                matches.
              </p>
              <Button asChild size="sm" variant="secondary">
                <Link to="/renter/inventory/review">Review suggestions</Link>
              </Button>
            </section>
          ) : null}

          <section className="rounded-2xl border border-border bg-card p-4">
            <p className="type-body-sm text-muted-foreground">
              Matched against your confirmed inventory: {matchInventory?.itemCount ?? 0} items,{" "}
              {formatM3(matchInventory?.storageRequirementM3 ?? 0)} estimated storage requirement.
            </p>
            <p className="mt-2 type-body-sm text-muted-foreground">{SPACEFIT_MATCH_DISCLAIMER}</p>
          </section>

          {compatible.length === 0 ? (
            <EmptyState
              icon={Boxes}
              title="No compatible spaces yet"
              description="Nothing published right now suits your belongings. Try again soon, or adjust what you're planning to store."
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {compatible.map((entry) => (
                <MatchCard key={entry.row.id} entry={entry} />
              ))}
            </div>
          )}

          {incompatible.length > 0 ? (
            <section>
              <Button
                variant="ghost"
                onClick={() => setShowIncompatible((open) => !open)}
                aria-expanded={showIncompatible}
              >
                <ChevronDown
                  className={showIncompatible ? "rotate-180 transition-transform" : "transition-transform"}
                  aria-hidden="true"
                />
                Spaces that don&apos;t fit your needs ({incompatible.length})
              </Button>
              {showIncompatible ? (
                <ul className="mt-3 space-y-3">
                  {incompatible.map((entry) => (
                    <IncompatibleRow key={entry.row.id} entry={entry} />
                  ))}
                </ul>
              ) : null}
            </section>
          )}
        </div>
      )}
    </AppLayout>
  );
}
