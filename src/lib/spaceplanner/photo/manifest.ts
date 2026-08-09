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
import { manifestHash } from "./diagnostics";
import { objectVolume } from "@/lib/vision/inventory";
import type { DetectedObject, RoomFeature } from "@/lib/vision/types";
import type { PhotoPlanResult } from "./plan";
import { categoriseVerification, type CategorisedVerification } from "./verification";

/** A confirmed, immutable-by-convention inventory. */
export interface CanonicalInventory {
  id: string;
  /** Stable across identical inventories; changes whenever the user edits. */
  signature: string;
  objects: DetectedObject[];
  /** Stable one-row-per-physical-unit contract used by render verification. */
  items: readonly InventoryContractItem[];
  /** Total units, counting quantities. */
  itemCount: number;
  distinctItems: number;
  confirmedAt: number;
}

export interface InventoryContractItem {
  itemId: string;
  sourceObjectId: string;
  label: string;
  category: string;
  dimensions: Readonly<{ widthCm: number; depthCm: number; heightCm: number }>;
  source: "ai" | "manual";
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
  const cleaned = objects
    .filter((object) => object.quantity > 0 && object.label.trim().length > 0)
    .map((object) => Object.freeze({ ...object, photoIds: [...object.photoIds] }));
  const signature = inventorySignature(cleaned);
  const items = cleaned.flatMap((object) =>
    Array.from({ length: object.quantity }, (_, index) => Object.freeze({
      itemId: `${object.id}_${String(index + 1).padStart(2, "0")}`,
      sourceObjectId: object.id,
      label: object.label,
      category: object.category,
      dimensions: Object.freeze({ widthCm: object.width, depthCm: object.depth, heightCm: object.height }),
      source: object.source,
    })),
  );
  return Object.freeze({
    id: signature,
    signature,
    objects: cleaned,
    items: Object.freeze(items),
    itemCount: cleaned.reduce((sum, object) => sum + object.quantity, 0),
    distinctItems: cleaned.length,
    confirmedAt: now,
  });
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
  /** True when this unit hangs on a wall rather than standing on the floor. */
  mounted: boolean;
  /**
   * Phase 6T — the item whose top surface physically carries this unit, or
   * null when it stands on the floor. This is the manifest ASSERTING a physical
   * relationship, not a textual hint: the renderer must draw it, and render
   * verification checks for it.
   */
  supportSurfaceId: string | null;
  /** How the unit is carried. "FLOOR" when it stands on the ground. */
  supportType: "FLOOR" | "TOP_SURFACE" | "WALL";
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
  roomFeatures: readonly RoomFeature[];
  /** Total units the visualisation is expected to represent. */
  expectedUnits: number;
  /** Units the deterministic engine actually placed. */
  placedUnits: number;
  /** Usable floor the plan was allowed to use, in metres. */
  spaceWidthM: number;
  spaceDepthM: number;
  spaceHeightM: number;
  /** The access corridor no item may stand in, when the plan kept one. */
  walkway: { xM: number; yM: number; widthM: number; depthM: number } | null;
  /** Which side of the room the access route was kept on. */
  corridorSide: string;
  /** The deterministic packing strategy that won. */
  strategy: string;
  /** 0–100 arrangement-quality score of the winning plan. */
  qualityScore: number;
  /** Whether every hard constraint passed. */
  valid: boolean;
  /** Hard-constraint failures, in plain words. Empty on a valid plan. */
  violations: readonly string[];
  /** Items the engine refused to place, with the reason. */
  unplaced: readonly { label: string; reason: string }[];
  /**
   * Stable identity of this plan. Same inventory + same room always produces
   * the same value; a render retry never changes it.
   */
  planHash: string;
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
  roomFeatures: readonly RoomFeature[] = [],
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
      mounted: entry.mounted,
      supportSurfaceId: entry.supportedBy ?? null,
      supportType: entry.mounted ? "WALL" : entry.supportedBy ? "TOP_SURFACE" : "FLOOR",
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

  const base = {
    inventoryId: inventory.id,
    entries,
    roomFeatures: Object.freeze(roomFeatures.filter((feature) => feature.verified).map((feature) => Object.freeze({ ...feature }))),
    expectedUnits: entries.reduce((sum, entry) => sum + entry.quantity, 0),
    placedUnits: arrangement.placedUnits,
    spaceWidthM: r2(result.space.width),
    spaceDepthM: r2(result.space.depth),
    spaceHeightM: r2(result.space.height),
    walkway: walkway
      ? { xM: r2(walkway.x), yM: r2(walkway.y), widthM: r2(walkway.w), depthM: r2(walkway.d) }
      : null,
    corridorSide: arrangement.corridorSide,
    strategy: arrangement.strategy,
    qualityScore: Math.round(arrangement.score.total),
    valid: arrangement.valid,
    violations: Object.freeze(arrangement.violations.map((violation) => violation.message)),
    unplaced: Object.freeze(
      arrangement.unplaced.map((entry) => Object.freeze({ label: entry.label, reason: entry.reason })),
    ),
    planHash: "",
  } satisfies PlacementManifest;

  return { ...base, planHash: manifestHash(base) };
}

/**
 * The storage groups the plan formed, so the renderer draws blocks of
 * belongings rather than objects dotted around the room.
 */
export function manifestGroups(manifest: PlacementManifest): { zone: string; labels: string[] }[] {
  const zones = new Map<string, string[]>();
  for (const entry of manifest.entries) {
    for (const position of entry.positions) {
      const list = zones.get(position.zone) ?? [];
      if (!list.includes(entry.label)) list.push(entry.label);
      zones.set(position.zone, list);
    }
  }
  return [...zones.entries()]
    .map(([zone, labels]) => ({ zone, labels }))
    .sort((a, b) => a.zone.localeCompare(b.zone));
}

/** Total units the rendered image must contain — no more, no fewer. */
export function manifestUnitCount(manifest: PlacementManifest): number {
  return manifest.entries
    .filter((entry) => entry.state !== "cannot be safely placed")
    .reduce((sum, entry) => sum + entry.quantity, 0);
}

/**
 * Structured, model-facing manifest text.
 *
 * This is a rendering order, not a suggestion: exact metric coordinates in a
 * floor frame whose origin is the rear-left corner of the room. The image
 * model is a renderer; it is never asked where anything should go.
 */
export function formatManifestForModel(manifest: PlacementManifest): string {
  const groups = manifestGroups(manifest);
  const header = [
    "FLOOR COORDINATE FRAME: origin (0,0) is the REAR-LEFT corner of the room floor.",
    `X increases towards the right wall (0 → ${manifest.spaceWidthM}m). Y increases from the rear wall towards the entrance (0 → ${manifest.spaceDepthM}m). Z is height above the floor (0 → ${manifest.spaceHeightM}m).`,
    `TOTAL OBJECTS TO DRAW: exactly ${manifestUnitCount(manifest)}. Not one more, not one fewer.`,
    groups.length
      ? `STORAGE GROUPS — draw each group as one contiguous block, items touching each other:\n${groups
          .map((group) => `• ${group.zone}: ${group.labels.join(", ")}`)
          .join("\n")}`
      : "",
    manifest.walkway
      ? `KEEP CLEAR: the access corridor from x=${manifest.walkway.xM}m to x=${r2(manifest.walkway.xM + manifest.walkway.widthM)}m, y=${manifest.walkway.yM}m to y=${r2(manifest.walkway.yM + manifest.walkway.depthM)}m. Nothing may be drawn inside it.`
      : "",
    "DO NOT INVENT STORAGE FURNITURE: no shelves, racks, cupboards, cabinets, hooks, pallets or storage boxes may be added. Only the objects listed below, in the room as photographed.",
    manifest.roomFeatures.length
      ? `FIXED ROOM FEATURES — preserve these exactly where they appear in the source photograph; they are NOT belongings and must never be moved, hidden, removed or counted as inventory:\n${manifest.roomFeatures
          .map((feature) => `• ${feature.id}: ${feature.label} (${feature.kind}) at ${feature.position}`)
          .join("\n")}`
      : "PRESERVE ALL SOURCE ROOM FEATURES: do not remove, move, replace or cover any television, radiator, door, window, fitted shelving, built-in furniture or electrical fixture visible in the source photograph.",
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
          if (position.supportSurfaceId) {
            const base = manifest.entries.find((candidate) => candidate.id === position.supportSurfaceId);
            lines.push(
              `SUPPORT: this unit is NOT on the floor. It rests on the top surface of ${position.supportSurfaceId}${base ? ` (${base.label})` : ""}. Draw it standing on that object, in contact with it, with a contact shadow. Drawing it on the floor is wrong.`,
            );
          } else if (position.mounted) {
            lines.push("SUPPORT: this unit is fixed to the wall and does not touch the floor.");
          }
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

/** Exact one-entry-per-unit render contract. IDs remain distinct for duplicate labels. */
export function requiredRenderItems(
  manifest: PlacementManifest,
): { id: string; label: string; quantity: 1 }[] {
  return manifest.entries
    .filter((entry) => entry.state !== "cannot be safely placed")
    .flatMap((entry) =>
      Array.from({ length: entry.quantity }, (_, index) => ({
        id: `${entry.id}_${String(index + 1).padStart(2, "0")}`,
        label: entry.label,
        quantity: 1 as const,
      })),
    );
}

export type { CategorisedVerification } from "./verification";

export interface CoverageReport {
  expected: number;
  present: number;
  missing: string[];
  /**
   * Objects the verifier saw that are NOT in the verified inventory. A render
   * with any of these is a hallucination and must never be shown as the plan.
   */
  unexpected: string[];
  /** True only when every required item is represented. */
  complete: boolean;
  /** True only when nothing was invented. */
  faithful: boolean;
  /**
   * Fixed room features (doors, windows, radiators) the verifier says drifted.
   * Reported for honesty; never a reason to withhold the render.
   */
  featureNotes?: string[];
  /** Full per-category breakdown from the categorised verifier. */
  categories?: CategorisedVerification;
}

export function coverageFrom(
  required: string[],
  present: string[],
  unexpected: string[] = [],
): CoverageReport {
  const categories = categoriseVerification({
    items: required.map((id) => ({ id, label: id })),
    features: [],
    reply: { present, unexpected },
  });
  const { userInventory, roomFeatures } = categories;
  return {
    expected: userInventory.expected.length,
    present: userInventory.found.length,
    missing: userInventory.missing,
    unexpected: userInventory.unexpected,
    featureNotes: roomFeatures.unexpected,
    complete: userInventory.missing.length === 0 && required.length > 0,
    faithful: userInventory.unexpected.length === 0,
    categories,
  };
}

