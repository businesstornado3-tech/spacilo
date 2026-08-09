/**
 * Photo SpacePlanner — the shared brain behind every "how does it fit?" result.
 *
 * Inputs are what Spacilo AI observed (belongings, a space) and the output is
 * one consistent result shape used by the homepage, the renter dashboard, the
 * host dashboard, listings and host request review. Nothing here measures
 * anything: every figure is an estimate, expressed as a range where the
 * evidence does not support a single number.
 */
import { buildPlan } from "../index";
import { CATALOGUE_BY_ID } from "../catalogue";
import { usableVolume } from "../spaces";
import {
  bestArrangement,
  planningItemsFrom,
  planningSpaceFrom,
  usableRectFromSelection,
  type PhysicalArrangement,
  type Obstacle,
  type Rect,
} from "../physical";
import type { CatalogueItem, InventoryLine, SpacePlan, StorageSpace } from "../types";
import { canonicaliseInventory } from "@/lib/vision/canonical";
import type { DetectedObject, SpaceScanResult } from "@/lib/vision/types";

export interface SpaceSource {
  /** Usable internal dimensions in metres. */
  widthM: number;
  depthM: number;
  heightM: number;
  name?: string;
  /** 0–1 confidence in the dimensions, when they were estimated from photos. */
  confidence?: number;
  /** How the dimensions were obtained. Drives the transparency copy. */
  basis: "photo" | "manual" | "listing";
  /** The floor the user approved for storage, when they marked one. */
  usable?: Rect;
  /** Normalised (0–1) usable-area selection from the space photograph. */
  usableSelection?: { x: number; y: number; width: number; height: number };
  /** Fixed furniture and exclusion zones that must stay unobstructed. */
  obstacles?: Obstacle[];
  /** Minimum access clearance in metres. Configurable per space. */
  walkwayClearanceM?: number;
}

export interface PhotoPlanResult {
  plan: SpacePlan;
  space: StorageSpace;
  /** The validated physical arrangement. Source of truth for every figure below. */
  arrangement: PhysicalArrangement;
  /** 0–100 estimated fit. Always labelled as an estimate in the UI. */
  fitPercent: number;
  /** Estimated cubic metres the belongings would occupy. */
  spaceUsedM3: number;
  /** Estimated cubic metres left over. */
  spaceRemainingM3: number;
  /** Honest range for the storage requirement, in m³. */
  requirementLowM3: number;
  requirementHighM3: number;
  itemCount: number;
  distinctItems: number;
  everythingFits: boolean;
  walkwayPreserved: boolean;
  /** Items the validated plan could not place while keeping access. */
  unplaced: { itemId: string; label: string; units: number; reason: string }[];
  /** 0–1, combining detection confidence with dimension confidence. */
  confidence: number;
  explanation: string;
  /** What would make the estimate better, when confidence is low. */
  improvements: string[];
}


export const LOW_CONFIDENCE = 0.7;

/**
 * Confirmed belongings → planner inventory lines.
 *
 * The locked inventory is canonical: every confirmed item becomes its own
 * line, keeping its own id, its own name and its own estimated dimensions.
 * Nothing is collapsed into "medium boxes" and nothing is swapped for a
 * catalogue lookalike, so the plan, the manifest and the visualisation all
 * describe the same physical objects the user photographed.
 */
export function linesFromObjects(objects: DetectedObject[]): InventoryLine[] {
  // Phase 6O: nothing reaches the deterministic engine without passing the
  // canonical validation gate first — positive numeric centimetres, a stable
  // id and a name, with volume derived rather than trusted.
  const { items } = canonicaliseInventory(objects);
  const byId = new Map(objects.map((object) => [object.id, object]));

  return items.map((canonical) => {
    const source = byId.get(canonical.id);
    const catalogue = source?.catalogueId ? CATALOGUE_BY_ID.get(source.catalogueId) : undefined;
    const item: CatalogueItem = {
      id: canonical.id,
      name: canonical.name,
      category: canonical.category,
      icon: catalogue?.icon ?? "box",
      width: Math.max(3, canonical.widthCm),
      depth: Math.max(3, canonical.depthCm),
      height: Math.max(3, canonical.heightCm),
      fragile: canonical.fragile,
      stackable: canonical.stackable,
      maxStack: canonical.stackable ? (catalogue?.maxStack ?? 3) : 1,
      weight: canonical.weightClass,
      standsUpright: catalogue?.standsUpright ?? false,
      frequentlyUsed: catalogue?.frequentlyUsed ?? false,
      popular: false,
    };
    return { item, quantity: canonical.quantity };
  });
}


/** A scanned space → the planner's metric space. */
export function spaceFromScan(scan: SpaceScanResult, name = "Your space"): SpaceSource {
  return {
    widthM: scan.widthM,
    depthM: scan.depthM,
    heightM: scan.ceilingHeightM,
    name,
    confidence: scan.confidence,
    basis: "photo",
  };
}

export function toStorageSpace(source: SpaceSource): StorageSpace {
  const width = Math.max(1, source.widthM);
  const depth = Math.max(1, source.depthM);
  return {
    id: "photo-space",
    name: source.name ?? "Your space",
    kind: "storage_room",
    width,
    depth,
    height: Math.max(1.6, source.heightM),
    door: "front",
    doorWidth: Math.min(width, 2.1),
    blurb: "Estimated from the photos provided.",
  };
}

const round1 = (value: number) => Math.round(value * 10) / 10;
const pct = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

function averageConfidence(objects: DetectedObject[]): number {
  const ai = objects.filter((object) => object.source === "ai");
  if (ai.length === 0) return 0.85;
  return ai.reduce((sum, object) => sum + object.confidence, 0) / ai.length;
}

/**
 * Items that physically cannot go in, whatever the cubic maths says: too tall
 * for the ceiling, or too wide and too deep to turn into the room.
 */
export function oversizeItems(lines: InventoryLine[], space: StorageSpace): string[] {
  return lines
    .filter(({ item }) => {
      const w = item.width / 100;
      const d = item.depth / 100;
      const h = item.height / 100;
      const tooTall = h > space.height;
      const tooBroad = Math.min(w, d) > Math.max(space.width, space.depth);
      const tooWide = w > space.width && d > space.width;
      return tooTall || tooBroad || tooWide;
    })
    .map(({ item }) => item.name);
}

/**
 * The estimated fit — spatial feasibility, not cubic volume.
 *
 * Placement is the primary evidence: anything the packer could not put on the
 * floor counts against the score, and anything physically too large for the
 * room caps it. A tight volume is penalised on top, because a photograph
 * cannot prove the last few centimetres.
 */
export function fitPercentFor(plan: SpacePlan, oversize = 0): number {
  const totalUnits = plan.itemCount;
  if (totalUnits === 0) return 0;
  const unplaced = plan.after.unplaced.length;
  const placedShare = Math.max(0, (totalUnits - unplaced) / totalUnits);
  const { requiredVolume, usableVolume: usable } = plan.metrics;
  const headroom = usable > 0 ? requiredVolume / usable : 2;
  const tightness = headroom > 1 ? 0.72 : headroom > 0.95 ? 0.93 : 1;
  const access = plan.metrics.walkwayPreserved ? 1 : 0.94;
  const feasibility = oversize > 0 ? Math.max(0.3, 1 - oversize * 0.2) : 1;
  return pct(placedShare * tightness * access * feasibility * 100);
}


export function buildPhotoPlan(
  objects: DetectedObject[],
  source: SpaceSource,
): PhotoPlanResult | null {
  const lines = linesFromObjects(objects);
  if (lines.length === 0) return null;

  const space = toStorageSpace(source);
  const plan = buildPlan(lines, space);

  // The physical engine is the source of truth: user-confirmed inventory and
  // user-defined usable space in, a validated arrangement out.
  const usableRect =
    source.usable ??
    (source.usableSelection
      ? usableRectFromSelection(
          { widthM: space.width, depthM: space.depth },
          source.usableSelection,
        )
      : undefined);
  const planningSpace = planningSpaceFrom(space, {
    ...(usableRect ? { usable: usableRect } : {}),
    ...(source.obstacles ? { obstacles: source.obstacles } : {}),
    ...(source.walkwayClearanceM ? { walkwayClearanceM: source.walkwayClearanceM } : {}),
    dimensionBasis: source.basis === "photo" ? "estimated" : "confirmed",
    ...(source.confidence !== undefined ? { confidence: source.confidence } : {}),
  });
  const arrangement = bestArrangement(planningItemsFrom(objects), planningSpace);

  const usable = arrangement.usableVolumeM3 > 0 ? arrangement.usableVolumeM3 : usableVolume(space);
  const required = plan.metrics.requiredVolume;

  const detection = averageConfidence(objects);
  const dimension = source.basis === "photo" ? (source.confidence ?? 0.7) : 0.9;
  const confidence = Math.max(0.35, Math.min(0.95, detection * 0.55 + dimension * 0.45));

  const spread = confidence > 0.8 ? 0.07 : confidence > 0.65 ? 0.12 : 0.18;
  const oversize = oversizeItems(lines, space);
  const everythingFits = arrangement.unplaced.length === 0 && arrangement.valid;
  const fitPercent = Math.min(
    fitPercentFor(plan, oversize.length),
    arrangement.score.completeness,
  );

  const improvements: string[] = [];
  if (dimension < LOW_CONFIDENCE)
    improvements.push("Add another photo of the space, or confirm its dimensions.");
  if (detection < LOW_CONFIDENCE)
    improvements.push("Check the detected items — correcting a few sharpens the estimate.");
  if (oversize.length > 0)
    improvements.push(
      `These look too large for this space: ${oversize.slice(0, 3).join(", ")}. Check their measurements.`,
    );
  if (arrangement.unplaced.length > 0)
    improvements.push(
      `${arrangement.unplaced.map((entry) => entry.label).slice(0, 3).join(", ")} could not be placed while keeping the access route clear. A larger space, or a smaller walkway, would be needed.`,
    );

  return {
    plan,
    space,
    arrangement,
    fitPercent,
    spaceUsedM3: round1(Math.min(arrangement.occupiedVolumeM3 || required, usable)),
    spaceRemainingM3: round1(Math.max(0, usable - (arrangement.occupiedVolumeM3 || required))),
    requirementLowM3: round1(required * (1 - spread)),
    requirementHighM3: round1(required * (1 + spread)),
    itemCount: plan.itemCount,
    distinctItems: lines.length,
    everythingFits,
    walkwayPreserved: Boolean(arrangement.walkway) || arrangement.valid,
    unplaced: arrangement.unplaced,
    confidence,
    explanation: explainFit(plan, fitPercent, source),
    improvements,
  };
}


export function explainFit(plan: SpacePlan, fitPercent: number, source: SpaceSource): string {
  const basis =
    source.basis === "photo"
      ? "Based on the photos provided"
      : source.basis === "listing"
        ? "Based on the listing's stated dimensions"
        : "Based on the dimensions you entered";

  if (fitPercent >= 85 && plan.metrics.everythingFits) {
    return `${basis}, your belongings appear to fit within the available space. The arrangement places larger items first while keeping a walkway to the door.`;
  }
  if (plan.metrics.everythingFits) {
    return `${basis}, your belongings appear to fit, but the space would be close to full. Final fit depends on actual measurements and conditions.`;
  }
  return `${basis}, some items may not fit in this space. Consider a larger space, or storing fewer items here.`;
}
