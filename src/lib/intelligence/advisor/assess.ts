/**
 * Listing assessment — the one place a listing becomes facts.
 *
 * Every advisor module consumes `ListingAssessment` rather than re-running the
 * engines itself, so a ranking, a comparison and a booking check all quote the
 * same numbers. Results are memoised on a stable key (Milestone 18).
 */
import { buildPlan, earnroomScore } from "@/lib/spaceplanner";
import type { InventoryLine } from "@/lib/spaceplanner/types";

import { analyseSpace } from "../space/engine";
import type { AdvisorListing, ListingAssessment } from "./contracts";

const cache = new Map<string, ListingAssessment>();
const MAX_CACHED = 32;

const pct = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
const round1 = (value: number) => Math.round(value * 10) / 10;

export function inventoryKey(lines: InventoryLine[]): string {
  return lines
    .filter((line) => line.quantity > 0)
    .map((line) => `${line.item.id}x${line.quantity}`)
    .sort()
    .join(",");
}

export function assessmentKey(lines: InventoryLine[], listing: AdvisorListing): string {
  return [
    listing.id,
    listing.space.id,
    listing.space.width,
    listing.space.depth,
    listing.space.height,
    listing.space.doorWidth,
    listing.monthlyPence,
    listing.distanceKm,
    listing.hostRating,
    listing.availableNow ? 1 : 0,
    listing.security.slice().sort().join("+"),
    listing.features.slice().sort().join("+"),
    listing.occupiedVolumeM3 ?? 0,
    listing.hostConfirmed ? 1 : 0,
    inventoryKey(lines),
  ].join("|");
}

export function clearAssessmentCache(): void {
  cache.clear();
}

export function assessListing(
  lines: InventoryLine[],
  listing: AdvisorListing,
  options: { useCache?: boolean } = {},
): ListingAssessment {
  const useCache = options.useCache !== false;
  const key = assessmentKey(lines, listing);
  if (useCache) {
    const hit = cache.get(key);
    if (hit) return hit;
  }

  const plan = buildPlan(lines, listing.space);
  const score = earnroomScore(plan);
  const analysis = analyseSpace({
    space: listing.space,
    features: listing.features,
    monthlyPence: listing.monthlyPence,
    ...(listing.occupiedVolumeM3 !== undefined
      ? { occupiedVolumeM3: listing.occupiedVolumeM3 }
      : {}),
    ...(listing.hostConfirmed ? { hostConfirmed: true } : {}),
  });

  const floorArea = listing.space.width * listing.space.depth;
  const floorClearPercent = pct(100 - (plan.after.floorAreaUsed / Math.max(0.01, floorArea)) * 100);

  // Confidence inherits from the weaker of the two engines that produced it:
  // a confident pack inside a poorly understood space is not a confident answer.
  const confidence =
    Math.round(
      Math.min(
        1,
        Math.max(
          0,
          0.55 * analysis.confidence + 0.45 * (listing.hostConfirmed ? 0.92 : 0.78),
        ),
      ) * 100,
    ) / 100;

  const assessment: ListingAssessment = {
    listing,
    analysis,
    score,
    fitPercent: score.fitPercent,
    floorClearPercent,
    remainingVolumeM3: round1(Math.max(0, plan.metrics.remainingCapacity)),
    confidence,
  };

  // The plan itself is not part of the contract, but its metrics are already
  // folded into the score above, so nothing is lost by letting it go.
  if (useCache) {
    if (cache.size >= MAX_CACHED) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(key, assessment);
  }

  return assessment;
}

export function assessAll(lines: InventoryLine[], listings: AdvisorListing[]): ListingAssessment[] {
  return listings.map((listing) => assessListing(lines, listing));
}

/** Plan for an assessment, rebuilt on demand rather than held in the contract. */
export function planFor(lines: InventoryLine[], listing: AdvisorListing) {
  return buildPlan(lines, listing.space);
}
