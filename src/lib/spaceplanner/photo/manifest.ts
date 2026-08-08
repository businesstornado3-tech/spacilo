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

/** One physical position the deterministic engine allocated. */
export interface ManifestPosition {
  /** Metres from the left wall to the near-left corner of the footprint. */
  xM: number;
  /** Metres from the rear wall to the rear edge of the footprint. */
  yM: number;
  /** Metres above the floor the base of this unit sits at. */
  baseHeightM: number;
  widthM: number;
  depthM: number;
  heightM: number;
  units: number;
  layer: number;
  rotationDeg: number;
  orientation: string;
  zone: string;
}

export interface ManifestEntry {
  id: string;
  label: string;
  quantity: number;
  widthCm: number;
  depthCm: number;
  heightCm: number;
  volumeM3: number;
  /** Where the validated physical plan put it, in plain words. */
  placement: string;
  orientation: string;
  state: PlacementState;
  /** The exact positions the physical engine allocated. Authoritative. */
  positions: ManifestPosition[];
}

export interface PlacementManifest {
  inventoryId: string;
  entries: ManifestEntry[];
  /** Total units the visualisation is expected to represent. */
  expectedUnits: number;
  /** Usable floor the plan was allowed to use, in metres. */
  spaceWidthM: number;
  spaceDepthM: number;
  spaceHeightM: number;
  /** The access corridor no item may stand in, when the plan kept one. */
  walkway: { xM: number; yM: number; widthM: number; depthM: number } | null;
}

const r2 = (value: number) => Math.round(value * 100) / 100;

function describePlacement(x: number, y: number, result: PhotoPlanResult): string {
  const across = x / Math.max(result.space.width, 0.1);
  const into = y / Math.max(result.space.depth, 0.1);
  const side = across < 0.34 ? "against the left wall" : across > 0.66 ? "against the right wall" : "in the centre";
  const depth = into < 0.34 ? "towards the rear wall" : into > 0.66 ? "near the entrance" : "in the middle of the floor";
  return `${side}, ${depth}`;
}

/**
 * Turns the confirmed inventory plus the VALIDATED PHYSICAL ARRANGEMENT into
 * the manifest the visualisation must satisfy.
 *
 * The deterministic engine — not the image model, and not the legacy volume
 * packer — decides every position here. Every confirmed item gets an entry; an
 * item the engine could not place is still listed, marked as such, so the
 * renderer knows to leave it out and the UI knows to say why.
 */
export function buildPlacementManifest(
  inventory: CanonicalInventory,
  result: PhotoPlanResult,
): PlacementManifest {
  const arrangement = result.arrangement;
  const unplaced = new Set(arrangement.unplaced.map((entry) => entry.itemId));

  const entries = inventory.objects.map((object) => {
    const placed = arrangement.entries.filter((entry) => entry.itemId === object.id);

    const positions: ManifestPosition[] = placed.map((entry) => ({
      xM: r2(entry.x),
      yM: r2(entry.y),
      baseHeightM: r2(entry.baseHeightM),
      widthM: r2(entry.w),
      depthM: r2(entry.d),
      heightM: r2(entry.heightM),
      units: entry.units,
      layer: entry.layer,
      rotationDeg: entry.rotationDeg,
      orientation: entry.orientation,
      zone: entry.zone,
    }));

    const first = placed[0];
    const state: PlacementState =
      positions.length === 0
        ? unplaced.has(object.id)
          ? "cannot be safely placed"
          : "partially visible"
        : placed.some((entry) => entry.layer > 0 || entry.units > 1)
          ? "intentionally stacked"
          : "placed";

    return {
      id: object.id,
      label: object.label,
      quantity: object.quantity,
      widthCm: Math.round(object.width),
      depthCm: Math.round(object.depth),
      heightCm: Math.round(object.height),
      volumeM3: Math.round(objectVolume(object) * 100) / 100,
      placement: first
        ? describePlacement(first.x + first.w / 2, first.y + first.d / 2, result)
        : "in any free floor area",
      orientation:
        first?.orientation === "upright"
          ? "standing upright on its long edge"
          : first?.rotationDeg
            ? "short edge parallel to the nearest wall"
            : "long edge parallel to the nearest wall",
      state,
      positions,
    } satisfies ManifestEntry;
  });

  const walkway = arrangement.walkway;

  return {
    inventoryId: inventory.id,
    entries,
    expectedUnits: entries.reduce((sum, entry) => sum + entry.quantity, 0),
    spaceWidthM: r2(result.space.width),
    spaceDepthM: r2(result.space.depth),
    spaceHeightM: r2(result.space.height),
    walkway: walkway
      ? { xM: r2(walkway.x), yM: r2(walkway.y), widthM: r2(walkway.w), depthM: r2(walkway.d) }
      : null,
  };
}

/**
 * Structured, model-facing manifest text.
 *
 * This is a rendering order, not a suggestion: exact metric coordinates in a
 * floor frame whose origin is the rear-left corner of the room. The image
 * model is a renderer; it is never asked where anything should go.
 */
export function formatManifestForModel(manifest: PlacementManifest): string {
  const header = [
    "FLOOR COORDINATE FRAME: origin (0,0) is the REAR-LEFT corner of the room floor.",
    `X increases towards the right wall (0 → ${manifest.spaceWidthM}m). Y increases from the rear wall towards the entrance (0 → ${manifest.spaceDepthM}m). Z is height above the floor (0 → ${manifest.spaceHeightM}m).`,
    manifest.walkway
      ? `KEEP CLEAR: the access corridor from x=${manifest.walkway.xM}m to x=${r2(manifest.walkway.xM + manifest.walkway.widthM)}m, y=${manifest.walkway.yM}m to y=${r2(manifest.walkway.yM + manifest.walkway.depthM)}m. Nothing may be drawn inside it.`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const body = manifest.entries
    .map((entry, index) => {
      const lines = [
        `ITEM ${index + 1}:`,
        `Name: ${entry.label}`,
        `Quantity: ${entry.quantity}`,
        `Approx dimensions: ${entry.widthCm} × ${entry.depthCm} × ${entry.heightCm} cm`,
        `Placement: ${entry.placement}`,
        `Orientation: ${entry.orientation}`,
        `Placement state: ${entry.state}`,
      ];

      if (entry.positions.length === 0) {
        lines.push(
          entry.state === "cannot be safely placed"
            ? "Exact position: NONE — this item did not fit. Do NOT draw it."
            : "Exact position: any free floor area outside the access corridor.",
        );
      } else {
        for (const [i, position] of entry.positions.entries()) {
          lines.push(
            `Exact position ${i + 1}: rear-left corner at x=${position.xM}m, y=${position.yM}m; footprint ${position.widthM}m × ${position.depthM}m; base ${position.baseHeightM}m above the floor; total height ${position.heightM}m; ${position.units} unit(s)${position.units > 1 ? " stacked vertically in one column" : ""}; rotated ${position.rotationDeg}°; ${position.zone} zone.`,
          );
        }
      }

      lines.push("Priority: preserve the recognisable appearance of the user's actual object");
      return lines.join("\n");
    })
    .join("\n\n");

  return `${header}\n\n${body}`;
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

