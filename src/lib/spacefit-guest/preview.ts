/**
 * Guest SpaceFit — deterministic preview.
 *
 * AI proposes, the visitor corrects, and THIS module decides the numbers, by
 * calling the exact same deterministic engines the authenticated product uses:
 * `estimateRequiredSpace`, `deriveSpaceFigures`, `suggestPrice` and
 * `projectEarnings`. There is deliberately no separate "guest engine" — a
 * preview that disagreed with the real product would be worthless.
 *
 * Pure module: no network, no database, no AI.
 */
import { CATALOGUE_BY_KEY } from "@/lib/inventory-catalogue";
import type { InventoryItem, ItemCategory, ItemTriState } from "@/lib/inventory-model";
import { estimateRequiredSpace, type RequiredSpace } from "@/lib/spacefit/requirement";
import { deriveSpaceFigures, type SpaceScanResult } from "@/lib/spacefit-vision/space-schema";
import {
  projectEarnings,
  suggestPrice,
  type EarningsProjection,
  type PriceSuggestion,
} from "@/lib/pricing/suggestion";
import type { NormalisedDetection } from "@/lib/spacefit-vision/normalise";
import type { ConfidenceBand } from "@/lib/spacefit-vision/schema";
import { MAX_GUEST_PREVIEW_ITEMS } from "@/lib/spacefit-guest/config";

/* ------------------------------------------------------------ renter side */

/** A line in the guest's temporary, in-browser list. Never a database row. */
export interface GuestItem {
  id: string;
  label: string;
  category: ItemCategory;
  catalogueKey: string | null;
  quantity: number;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  stackable: ItemTriState;
  fragile: boolean;
  confidence: ConfidenceBand;
  source: "ai" | "manual";
  possibleRestrictedItem: boolean;
}

let counter = 0;
const nextId = (prefix: string) => `${prefix}-${(counter += 1)}`;

/** Resets the local id counter. Test helper only. */
export function __resetGuestItemIds() {
  counter = 0;
}

/**
 * Turns AI detections into editable guest lines. Detections the model thought
 * were part of the room rather than belongings are dropped — a guest should
 * never have to delete their own garage door from their list.
 */
export function guestItemsFromDetections(detections: NormalisedDetection[]): GuestItem[] {
  return detections
    .filter((detection) => detection.inventory_intent !== "likely_environment")
    .slice(0, MAX_GUEST_PREVIEW_ITEMS)
    .map((detection) => {
      const catalogue = detection.catalogue_key ? CATALOGUE_BY_KEY.get(detection.catalogue_key) : undefined;
      return {
        id: nextId("ai"),
        label: detection.label.slice(0, 80),
        category: detection.category,
        catalogueKey: catalogue?.key ?? null,
        quantity: Math.min(999, Math.max(1, Math.round(detection.estimated_quantity))),
        lengthCm: catalogue?.lengthCm ?? null,
        widthCm: catalogue?.widthCm ?? null,
        heightCm: catalogue?.heightCm ?? null,
        stackable: catalogue?.stackable ?? detection.stackable_suggestion,
        fragile: catalogue?.fragile ?? detection.fragile_suggestion === "yes",
        confidence: detection.object_confidence,
        source: "ai" as const,
        possibleRestrictedItem: detection.possible_restricted_item,
      };
    });
}

/** Manual fallback: a guest can always build the list by hand instead. */
export function guestItemFromCatalogue(key: string, quantity = 1): GuestItem | null {
  const catalogue = CATALOGUE_BY_KEY.get(key);
  if (!catalogue) return null;
  return {
    id: nextId("manual"),
    label: catalogue.name,
    category: catalogue.category,
    catalogueKey: catalogue.key,
    quantity: Math.min(999, Math.max(1, Math.round(quantity))),
    lengthCm: catalogue.lengthCm,
    widthCm: catalogue.widthCm,
    heightCm: catalogue.heightCm,
    stackable: catalogue.stackable,
    fragile: catalogue.fragile ?? false,
    confidence: "high",
    source: "manual",
    possibleRestrictedItem: false,
  };
}

/**
 * Adapts guest lines to the shape the shared requirement engine expects. The
 * engine only reads size, quantity, category, stackability and fragility.
 */
export function toInventoryItems(items: GuestItem[]): InventoryItem[] {
  return items.map(
    (item) =>
      ({
        id: item.id,
        inventory_id: "guest",
        user_id: "guest",
        label: item.label,
        category: item.category,
        catalogue_key: item.catalogueKey,
        quantity: item.quantity,
        length_cm: item.lengthCm,
        width_cm: item.widthCm,
        height_cm: item.heightCm,
        stackable: item.stackable,
        fragile: item.fragile,
        orientation_flexible: "unknown",
        size_source: item.catalogueKey ? "catalogue_estimate" : "unknown",
        notes: null,
        created_at: new Date(0).toISOString(),
        updated_at: new Date(0).toISOString(),
      }) as unknown as InventoryItem,
  );
}

export interface GuestRequirementPreview {
  requirement: RequiredSpace;
  itemCount: number;
  restrictedCount: number;
}

export function guestRequirementPreview(items: GuestItem[]): GuestRequirementPreview {
  return {
    requirement: estimateRequiredSpace(toInventoryItems(items)),
    itemCount: items.reduce((total, item) => total + item.quantity, 0),
    restrictedCount: items.filter((item) => item.possibleRestrictedItem).length,
  };
}

/* -------------------------------------------------------------- host side */

/** Editable host proposal. Identical fields to the authenticated proposal. */
export interface GuestSpaceProposal {
  widthM: number | null;
  depthM: number | null;
  usableHeightM: number | null;
  confidence: ConfidenceBand;
  referenceUsed: string | null;
  obstacles: { kind: string; label: string; estimatedVolumeM3: number | null }[];
  limitations: string[];
  notes: string | null;
  spaceType: string | null;
}

export function guestProposalFromScan(
  result: SpaceScanResult,
  spaceType: string | null,
): GuestSpaceProposal {
  return {
    widthM: result.estimated_width_m,
    depthM: result.estimated_depth_m,
    usableHeightM: result.estimated_usable_height_m,
    confidence: result.measurement_confidence,
    referenceUsed: result.reference_used,
    obstacles: result.obstacles.map((obstacle) => ({
      kind: obstacle.kind,
      label: obstacle.label,
      estimatedVolumeM3: obstacle.estimated_volume_m3,
    })),
    limitations: [...result.limitations],
    notes: result.notes,
    spaceType,
  };
}

/** Back to the shared schema shape so `deriveSpaceFigures` stays the authority. */
function toScanResult(proposal: GuestSpaceProposal): SpaceScanResult {
  return {
    estimated_width_m: proposal.widthM,
    estimated_depth_m: proposal.depthM,
    estimated_usable_height_m: proposal.usableHeightM,
    measurement_confidence: proposal.confidence,
    reference_used: proposal.referenceUsed,
    obstacles: proposal.obstacles.map((obstacle) => ({
      kind: obstacle.kind,
      label: obstacle.label,
      estimated_volume_m3: obstacle.estimatedVolumeM3,
      confidence: proposal.confidence,
    })),
    limitations: proposal.limitations,
    notes: proposal.notes,
  } as unknown as SpaceScanResult;
}

export interface GuestSpacePreview {
  figures: ReturnType<typeof deriveSpaceFigures>;
  price: PriceSuggestion;
  earnings: EarningsProjection[];
}

/**
 * Guest earnings guidance uses the SAME price engine as the host wizard, with
 * deliberately cautious inputs: no security features, no access uplift and no
 * condition uplift are assumed, because a guest hasn't declared any of them.
 */
export function guestSpacePreview(proposal: GuestSpaceProposal, occupancy = 0.8): GuestSpacePreview {
  const figures = deriveSpaceFigures(toScanResult(proposal));
  const price = suggestPrice({
    usableVolumeM3: figures.usableVolumeM3,
    spaceType: proposal.spaceType,
    accessType: null,
    moistureCondition: null,
    temperatureCondition: null,
    features: null,
  });
  const earnings = price.suggestedMonthlyPence
    ? projectEarnings(price.suggestedMonthlyPence, occupancy)
    : [];
  return { figures, price, earnings };
}

export const GUEST_HOST_VERIFICATION_NOTE =
  "These are AI estimates only. When you create your account you'll be asked to check them against the real space — nothing becomes a verified measurement until you confirm it.";
