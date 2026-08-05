/**
 * SpaceFit — required-space estimation (`spacefit-requirement-v1`).
 *
 * Turns a CONFIRMED renter inventory into the practical space it needs:
 * volume, floor footprint, minimum usable height and the doorway clearance
 * required to get the largest item in.
 *
 * This module is deterministic and pure. It performs no AI, no network calls
 * and no randomness — the same inventory always produces the same estimate.
 * AI only ever proposes ITEMS (see `src/lib/spacefit-vision`); the numbers
 * below are always computed here from confirmed item data.
 *
 * MODEL
 *  - Volume reuses the shared packing allowance in `inventory-model` so the
 *    figure matches the renter's My Stuff dashboard exactly.
 *  - Footprint assumes each item rests on its smallest face. Stackable items
 *    share a footprint (up to a conservative stack limit); non-stackable and
 *    fragile items each need their own patch of floor.
 *  - An aisle allowance is then added because a renter has to physically walk
 *    in and reach their belongings.
 *
 * Everything is an ESTIMATE and must be presented as such.
 */
import {
  calculateTotals,
  largestItem,
  type InventoryItem,
  type InventoryTotals,
} from "@/lib/inventory-model";

export const SPACEFIT_REQUIREMENT_VERSION = "spacefit-requirement-v1";

/** How many like items we assume can safely be stacked on one footprint. */
export const STACK_LIMIT_KNOWN = 3;
/** Applied when stackability is unknown — deliberately pessimistic. */
export const STACK_LIMIT_UNKNOWN = 1.5;

/** Floor space for walking in and reaching things, on top of item footprint. */
export const AISLE_ALLOWANCE = 1.35;

export type RequirementConfidence = "high" | "medium" | "low";

export interface RequiredSpace {
  algorithm: typeof SPACEFIT_REQUIREMENT_VERSION;
  totals: InventoryTotals;
  /** Item volume plus packing allowance, m³. Same figure as My Stuff. */
  requiredVolumeM3: number;
  /** Estimated floor area needed including aisle allowance, m². */
  requiredFloorAreaM2: number;
  /** Minimum internal height needed for the tallest unavoidable item, m. */
  requiredHeightM: number | null;
  /** Narrowest opening the largest item can pass through, cm. */
  requiredDoorClearanceCm: number | null;
  largestItemLabel: string | null;
  itemCount: number;
  nonStackableCount: number;
  fragileCount: number;
  unknownSizeLines: number;
  confidence: RequirementConfidence;
  /** Plain-English caveats the renter should read. */
  warnings: string[];
  /** What the estimate assumed, so the number is never a black box. */
  assumptions: string[];
}

const toNum = (value: number | string | null | undefined): number | null => {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const round = (value: number, dp: number) => {
  const f = 10 ** dp;
  return Math.round(value * f) / f;
};

/** Sorted centimetre dimensions of an item, smallest first, or null. */
function sortedDimsCm(item: InventoryItem): [number, number, number] | null {
  const l = toNum(item.length_cm);
  const w = toNum(item.width_cm);
  const h = toNum(item.height_cm);
  if (!l || !w || !h) return null;
  const sorted = [l, w, h].sort((a, b) => a - b);
  return [sorted[0]!, sorted[1]!, sorted[2]!];
}

export function estimateRequiredSpace(items: InventoryItem[]): RequiredSpace {
  const totals = calculateTotals(items);

  let footprintM2 = 0;
  let tallestRestingCm = 0;
  let nonStackable = 0;
  let fragile = 0;
  let measuredLines = 0;

  for (const item of items) {
    if (item.fragile) fragile += item.quantity;
    if (item.stackable === "no") nonStackable += item.quantity;

    const dims = sortedDimsCm(item);
    if (!dims) continue;
    measuredLines += 1;

    const [smallest, middle, largest] = dims;

    // Resting on its smallest face gives the smallest realistic floor patch.
    const faceAreaM2 = (middle * largest) / 10_000;

    // Fragile things are never assumed to be stacked, whatever the flag says.
    const stackDivisor = item.fragile
      ? 1
      : item.stackable === "yes"
        ? STACK_LIMIT_KNOWN
        : item.stackable === "no"
          ? 1
          : STACK_LIMIT_UNKNOWN;

    const patches = Math.ceil(item.quantity / stackDivisor);
    footprintM2 += faceAreaM2 * patches;

    // Height needed: a stack of this item, or the item's own resting height.
    const stackHeight = smallest * Math.min(item.quantity, stackDivisor);
    tallestRestingCm = Math.max(tallestRestingCm, smallest, stackHeight);
  }

  const largest = largestItem(items);

  const confidence = requirementConfidence(items, measuredLines);

  const warnings: string[] = [];
  if (totals.unknownSizeLines > 0) {
    warnings.push(
      `${totals.unknownSizeLines} ${totals.unknownSizeLines === 1 ? "item has" : "items have"} no measurements, so this estimate is probably low.`,
    );
  }
  if (fragile > 0) {
    warnings.push("Fragile items are assumed not to be stacked, which needs more floor space.");
  }
  if (nonStackable > 0) {
    warnings.push(`${nonStackable} item${nonStackable === 1 ? "" : "s"} can't be stacked and each needs its own floor space.`);
  }
  if (items.length === 0) {
    warnings.push("Add some belongings so we can estimate the space you need.");
  }

  return {
    algorithm: SPACEFIT_REQUIREMENT_VERSION,
    totals,
    requiredVolumeM3: totals.storageRequirementM3,
    requiredFloorAreaM2: round(footprintM2 * AISLE_ALLOWANCE, 2),
    requiredHeightM: tallestRestingCm > 0 ? round(tallestRestingCm / 100, 2) : null,
    requiredDoorClearanceCm: largest ? Math.round(Math.min(largest.widthCm, largest.heightCm, largest.lengthCm)) : null,
    largestItemLabel: largest?.item.item_name ?? null,
    itemCount: totals.itemCount,
    nonStackableCount: nonStackable,
    fragileCount: fragile,
    unknownSizeLines: totals.unknownSizeLines,
    confidence,
    warnings,
    assumptions: [
      "Each item rests on its smallest face.",
      `Stackable items are stacked no more than ${STACK_LIMIT_KNOWN} high.`,
      `A ${Math.round((AISLE_ALLOWANCE - 1) * 100)}% allowance is added so you can walk in and reach things.`,
      "Packing allowances come from the item category, as shown in My Stuff.",
    ],
  };
}

function requirementConfidence(items: InventoryItem[], measuredLines: number): RequirementConfidence {
  if (items.length === 0) return "low";
  const knownRatio = measuredLines / items.length;
  const userMeasured = items.filter((item) => item.size_source === "user_measured").length / items.length;
  if (knownRatio >= 0.9 && userMeasured >= 0.5) return "high";
  if (knownRatio >= 0.7) return "medium";
  return "low";
}

export const REQUIREMENT_CONFIDENCE_LABEL: Record<RequirementConfidence, string> = {
  high: "High confidence — most items are measured",
  medium: "Medium confidence — some sizes are typical estimates",
  low: "Low confidence — add sizes to improve this",
};

export const REQUIREMENT_DISCLAIMER =
  "This is an estimate based on the belongings you've confirmed. Real-world fit depends on shape, stacking and how the space is arranged.";
