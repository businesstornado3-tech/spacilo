/**
 * "SpaceFit for your stuff" panel on a public listing.
 *
 * Signed-out visitors and renters without an inventory see a prompt instead —
 * ordinary public browsing is never blocked, and we never fabricate a match
 * for someone whose stuff we've never seen.
 */
import { Link } from "@tanstack/react-router";
import { Boxes } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useSpaceFitForSpace } from "@/hooks/useSpaceFitMatches";
import { useActiveInventory } from "@/hooks/useInventory";
import { useActivePolicy, useInventoryScreening, usePolicyRules, useSuitabilityProfile } from "@/hooks/usePolicy";
import {
  ReasonList,
  SpaceFitResultBadge,
  WhyThisMatches,
} from "@/components/spacefit/SpaceFitResult";
import { ListingConfidenceSection } from "@/components/spacefit/ListingConfidence";
import { PackPlanView } from "@/components/spacefit/PackPlanView";
import { evaluateCompatibility, summariseScreening } from "@/lib/policy/engine";
import {
  buildListingConfidence,
  buildWhySection,
  NO_INVENTORY_COPY,
} from "@/lib/trust/listing-confidence";
import {
  buildSpaceFitPlanSnapshot,
  packSpaceFromListing,
  type PackSpaceSource,
} from "@/lib/spacefit/plan";
import type { HostSpaceLike } from "@/lib/spacefit-hub";
import type { MatchSpace } from "@/lib/spacefit/types";

export function ListingSpaceFitPanel({
  space,
  listing,
}: {
  space: MatchSpace;
  /** Raw listing row, used for the live packing preview's geometry. */
  listing?: PackSpaceSource & Partial<HostSpaceLike>;
}) {
  const { user } = useAuth();
  const { result, items, matchInventory } = useSpaceFitForSpace(user ? space : null);
  const hasInventory = items.length > 0;

  // Safety layer — the same authoritative results used at request time.
  const { data: inventory } = useActiveInventory();
  const { data: screening } = useInventoryScreening(user ? inventory?.id : undefined);
  const { data: policy } = useActivePolicy();
  const { data: rules } = usePolicyRules(policy?.id);
  const { data: suitability } = useSuitabilityProfile(space.id);

  if (!user || !hasInventory || !result) {
    return (
      <section className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-card">
        <div className="flex items-start gap-3">
          <Boxes className="mt-0.5 size-5 text-primary" aria-hidden="true" />
          <div className="min-w-0">
            <h2 className="type-h3">{NO_INVENTORY_COPY.title}</h2>
            <p className="mt-1 type-body-sm text-muted-foreground">{NO_INVENTORY_COPY.body}</p>
            <Button asChild size="sm" className="mt-3">
              <Link to={user ? "/renter/inventory" : "/get-started"}>
                {user ? NO_INVENTORY_COPY.cta : "Get started"}
              </Link>
            </Button>
          </div>
        </div>
      </section>
    );
  }

  const summary = summariseScreening(screening);
  const report = evaluateCompatibility({
    screening: screening ?? null,
    rules: rules ?? [],
    suitability: suitability?.attributes ?? null,
    spaceFit: { score: result.score, compatible: result.compatible, label: result.label },
  });

  const hostSpace: HostSpaceLike = {
    id: space.id,
    space_type: space.space_type,
    estimated_available_volume_m3: space.estimated_available_volume_m3,
    access_type: space.access_type,
    moisture_condition: space.moisture_condition,
    temperature_condition: space.temperature_condition,
    features: space.features,
    measurement_source: listing?.measurement_source ?? null,
    measurements_verified_at: listing?.measurements_verified_at ?? null,
  };

  const requirementM3 = matchInventory?.storageRequirementM3 ?? null;
  const confidence = buildListingConfidence({
    report,
    screening: summary,
    spaceFit: result,
    requirementM3,
    space: hostSpace,
  });
  const capacityCovers =
    requirementM3 === null || space.estimated_available_volume_m3 === null
      ? null
      : space.estimated_available_volume_m3 >= requirementM3;
  const why = buildWhySection({ confidence, spaceFit: result, space: hostSpace, capacityCovers });

  // Live preview only: nothing is stored until a request is sent.
  const preview = listing ? buildSpaceFitPlanSnapshot(items, packSpaceFromListing(listing)) : null;

  return (
    <>
      <ListingConfidenceSection confidence={confidence} why={why} className="mt-6" />

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
