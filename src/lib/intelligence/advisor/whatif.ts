/**
 * Milestone 9 — the what-if engine.
 *
 * A simulation is the same analysis run against a modified input, so a
 * what-if answer is exactly as trustworthy as the original one. Nothing is
 * extrapolated; the engine simply runs again.
 */
import { CATALOGUE_BY_ID } from "@/lib/spaceplanner/catalogue";
import type { InventoryLine, StorageSpace } from "@/lib/spaceplanner/types";

import { assessListing } from "./assess";
import type { AdvisorListing, ListingAssessment, WhatIfChange, WhatIfResult } from "./contracts";

const round1 = (value: number) => Math.round(value * 10) / 10;

export function applyChange(
  lines: InventoryLine[],
  listing: AdvisorListing,
  change: WhatIfChange,
): { lines: InventoryLine[]; listing: AdvisorListing; label: string } {
  switch (change.kind) {
    case "remove_item": {
      const quantity = change.quantity ?? Number.POSITIVE_INFINITY;
      const target = lines.find((line) => line.item.id === change.itemId);
      const next = lines
        .map((line) =>
          line.item.id === change.itemId
            ? { ...line, quantity: Math.max(0, line.quantity - quantity) }
            : line,
        )
        .filter((line) => line.quantity > 0);
      return {
        lines: next,
        listing,
        label: `Remove ${target ? target.item.name.toLowerCase() : change.itemId}`,
      };
    }
    case "add_item": {
      const item = CATALOGUE_BY_ID.get(change.itemId);
      if (!item) return { lines, listing, label: `Add ${change.itemId}` };
      const quantity = change.quantity ?? 1;
      const existing = lines.find((line) => line.item.id === item.id);
      const next = existing
        ? lines.map((line) =>
            line.item.id === item.id ? { ...line, quantity: line.quantity + quantity } : line,
          )
        : [...lines, { item, quantity }];
      return { lines: next, listing, label: `Add ${item.name.toLowerCase()}` };
    }
    case "add_shelving":
      return {
        lines,
        listing: { ...listing, features: [...new Set([...listing.features, "shelving"])] },
        label: "Add shelving",
      };
    case "raise_ceiling": {
      const space: StorageSpace = {
        ...listing.space,
        height: round1(listing.space.height + change.byM),
      };
      return {
        lines,
        listing: { ...listing, space },
        label: `Raise the ceiling by ${change.byM.toFixed(2)}m`,
      };
    }
    case "clear_obstacle":
      return {
        lines,
        listing: { ...listing, features: [...new Set([...listing.features, "cleared"])] },
        label: "Clear the obstruction",
      };
  }
}

function snapshot(assessment: ListingAssessment) {
  return {
    score: assessment.score.value,
    fitPercent: assessment.fitPercent,
    remainingVolumeM3: assessment.remainingVolumeM3,
  };
}

export function simulate(
  lines: InventoryLine[],
  listing: AdvisorListing,
  change: WhatIfChange,
): WhatIfResult {
  const before = assessListing(lines, listing);
  const applied = applyChange(lines, listing, change);
  const after = assessListing(applied.lines, applied.listing);

  const deltaScore = after.score.value - before.score.value;
  const deltaVolumeM3 = round1(after.remainingVolumeM3 - before.remainingVolumeM3);
  const verdict = deltaScore > 0 ? "better" : deltaScore < 0 ? "worse" : "no_change";

  const explanation =
    verdict === "no_change"
      ? `${applied.label} leaves the fit score unchanged at ${before.score.value}.`
      : `${applied.label} moves the fit score from ${before.score.value} to ${after.score.value} and ${deltaVolumeM3 >= 0 ? "frees" : "uses"} about ${Math.abs(deltaVolumeM3).toFixed(1)}m³.`;

  return {
    change,
    label: applied.label,
    before: snapshot(before),
    after: snapshot(after),
    deltaScore,
    deltaVolumeM3,
    verdict,
    explanation,
  };
}

/** Runs several simulations and returns them best-first. */
export function simulateAll(
  lines: InventoryLine[],
  listing: AdvisorListing,
  changes: WhatIfChange[],
): WhatIfResult[] {
  return changes
    .map((change) => simulate(lines, listing, change))
    .sort((a, b) => b.deltaScore - a.deltaScore || b.deltaVolumeM3 - a.deltaVolumeM3);
}
