/**
 * Inventory Lock and the placement manifest — SpacePlanner's single source of
 * truth.
 *
 * Once someone confirms what Spacilo AI found, that confirmed list becomes a
 * canonical inventory with a stable id and signature. Every downstream step —
 * the analytical plan, the visualisation prompt and the completeness check —
 * reads from this one object. The image layer is never allowed to reinterpret
 * the inventory for itself.
 */
import { hashString } from "@/lib/vision/hash";
import { objectVolume } from "@/lib/vision/inventory";
import type { DetectedObject } from "@/lib/vision/types";
import type { PhotoPlanResult } from "./plan";

/** A confirmed, immutable-by-convention inventory. */
export interface CanonicalInventory {
  id: string;
  /** Stable across identical inventories; changes whenever the user edits. */
  signature: string;
  objects: DetectedObject[];
  /** Total units, counting quantities. */
  itemCount: number;
  distinctItems: number;
  confirmedAt: number;
}

export function inventorySignature(objects: DetectedObject[]): string {
  const parts = objects
    .map(
      (object) =>
        `${object.label.trim().toLowerCase()}|${object.quantity}|${Math.round(object.width)}x${Math.round(object.depth)}x${Math.round(object.height)}`,
    )
    .sort();
  return `inv_${hashString(parts.join("~")).toString(36)}`;
}

/** Locks the reviewed inventory. Nothing downstream may add or drop items. */
export function lockInventory(objects: DetectedObject[], now = Date.now()): CanonicalInventory {
  const cleaned = objects.filter((object) => object.quantity > 0 && object.label.trim().length > 0);
  const signature = inventorySignature(cleaned);
  return {
    id: signature,
    signature,
    objects: cleaned,
    itemCount: cleaned.reduce((sum, object) => sum + object.quantity, 0),
    distinctItems: cleaned.length,
    confirmedAt: now,
  };
}

export type PlacementState =
  | "placed"
  | "partially visible"
  | "intentionally stacked"
  | "intentionally occluded"
  | "cannot be safely placed";

export interface ManifestEntry {
  id: string;
  label: string;
  quantity: number;
  widthCm: number;
  depthCm: number;
  heightCm: number;
  volumeM3: number;
  /** Where the analytical plan wants it. */
  placement: string;
  orientation: string;
  state: PlacementState;
}

export interface PlacementManifest {
  inventoryId: string;
  entries: ManifestEntry[];
  /** Total units the visualisation is expected to represent. */
  expectedUnits: number;
}

function describePlacement(x: number, y: number, result: PhotoPlanResult): string {
  const across = x / Math.max(result.space.width, 0.1);
  const into = y / Math.max(result.space.depth, 0.1);
  const side = across < 0.34 ? "against the left wall" : across > 0.66 ? "against the right wall" : "in the centre";
  const depth = into < 0.34 ? "towards the rear wall" : into > 0.66 ? "near the entrance" : "in the middle of the floor";
  return `${side}, ${depth}`;
}

/**
 * Turns the confirmed inventory plus the analytical plan into the manifest the
 * visualisation must satisfy. Every confirmed item gets an entry — an item the
 * packer could not place is still listed, marked as such.
 */
export function buildPlacementManifest(
  inventory: CanonicalInventory,
  result: PhotoPlanResult,
): PlacementManifest {
  const placements = result.plan.after.placements;
  const unplaced = new Set(result.plan.after.unplaced);

  const entries = inventory.objects.map((object) => {
    const match = placements.find(
      (placement) =>
        (object.catalogueId && placement.itemId === object.catalogueId) ||
        placement.label.toLowerCase() === object.label.toLowerCase(),
    );

    const state: PlacementState =
      object.catalogueId && unplaced.has(object.catalogueId)
        ? "cannot be safely placed"
        : match && match.level > 0
          ? "intentionally stacked"
          : match
            ? "placed"
            : "partially visible";

    return {
      id: object.id,
      label: object.label,
      quantity: object.quantity,
      widthCm: Math.round(object.width),
      depthCm: Math.round(object.depth),
      heightCm: Math.round(object.height),
      volumeM3: Math.round(objectVolume(object) * 100) / 100,
      placement: match ? describePlacement(match.x, match.y, result) : "in any free floor area",
      orientation: match?.rotated
        ? "short edge parallel to the nearest wall"
        : "long edge parallel to the nearest wall",
      state,
    } satisfies ManifestEntry;
  });

  return {
    inventoryId: inventory.id,
    entries,
    expectedUnits: entries.reduce((sum, entry) => sum + entry.quantity, 0),
  };
}

/** Structured, model-facing manifest text. Not a loose natural-language summary. */
export function formatManifestForModel(manifest: PlacementManifest): string {
  return manifest.entries
    .map((entry, index) =>
      [
        `ITEM ${index + 1}:`,
        `Name: ${entry.label}`,
        `Quantity: ${entry.quantity}`,
        `Approx dimensions: ${entry.widthCm} × ${entry.depthCm} × ${entry.heightCm} cm`,
        `Placement: ${entry.placement}`,
        `Orientation: ${entry.orientation}`,
        `Placement state: ${entry.state}`,
        "Priority: preserve the recognisable appearance of the user's actual object",
      ].join("\n"),
    )
    .join("\n\n");
}

/** Every label the generated image is required to show. */
export function requiredLabels(manifest: PlacementManifest): string[] {
  return manifest.entries
    .filter((entry) => entry.state !== "cannot be safely placed")
    .map((entry) => entry.label);
}

export interface CoverageReport {
  expected: number;
  present: number;
  missing: string[];
  /** True only when every required item is represented. */
  complete: boolean;
}

export function coverageFrom(required: string[], present: string[]): CoverageReport {
  const seen = new Set(present.map((label) => label.trim().toLowerCase()));
  const missing = required.filter((label) => !seen.has(label.trim().toLowerCase()));
  return {
    expected: required.length,
    present: required.length - missing.length,
    missing,
    complete: missing.length === 0 && required.length > 0,
  };
}
