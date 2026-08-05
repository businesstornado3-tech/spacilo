/**
 * SpaceFit plan snapshot (`spacefit-plan-snapshot-v1`).
 *
 * Binds together the three deterministic engines — requirement, pack and the
 * matching engine — into ONE serialisable structure that can be frozen into
 * `storage_requests.spacefit_plan_snapshot` and carried through to
 * `bookings.spacefit_plan_snapshot`.
 *
 * Everything here is pure. AI never produces, edits or overrides any value in
 * this structure: it only ever proposes inventory items and host measurements,
 * both of which must be confirmed by a human before they reach these inputs.
 *
 * Algorithm versions are persisted INSIDE the snapshot so a historical plan can
 * still be interpreted after the engines evolve.
 */
import type { InventoryItem } from "@/lib/inventory-model";
import { estimateRequiredSpace, SPACEFIT_REQUIREMENT_VERSION, type RequiredSpace } from "./requirement";
import { buildPackPlan, SPACEFIT_PACK_VERSION, type PackPlan, type PackSpace } from "./pack";
import { SPACEFIT_ALGORITHM_VERSION } from "./types";

export const SPACEFIT_PLAN_SNAPSHOT_VERSION = "spacefit-plan-snapshot-v1";

/** The subset of the requirement estimate worth freezing. */
export interface PlanRequirementSnapshot {
  algorithm: string;
  requiredVolumeM3: number;
  requiredFloorAreaM2: number;
  requiredHeightM: number | null;
  requiredDoorClearanceCm: number | null;
  largestItemLabel: string | null;
  itemCount: number;
  nonStackableCount: number;
  fragileCount: number;
  unknownSizeLines: number;
  confidence: RequiredSpace["confidence"];
  warnings: string[];
}

/** Geometry the plan was reasoned against, as known to the client at the time. */
export interface PlanSpaceSnapshot {
  usableVolumeM3: number | null;
  floorAreaM2: number | null;
  heightM: number | null;
  doorWidthCm: number | null;
  doorHeightCm: number | null;
}

export interface SpaceFitPlanSnapshot {
  snapshotVersion: typeof SPACEFIT_PLAN_SNAPSHOT_VERSION;
  algorithms: {
    requirement: typeof SPACEFIT_REQUIREMENT_VERSION;
    pack: typeof SPACEFIT_PACK_VERSION;
    match: typeof SPACEFIT_ALGORITHM_VERSION;
  };
  capturedAt: string;
  requirement: PlanRequirementSnapshot;
  plan: PackPlan;
  space: PlanSpaceSnapshot;
}

/** Loose listing-row shape — both published-space RPC variants satisfy it. */
export interface PackSpaceSource {
  estimated_available_volume_m3?: number | string | null;
  total_volume_m3?: number | string | null;
  floor_area_m2?: number | string | null;
  height_m?: number | string | null;
  door_width_cm?: number | string | null;
  door_height_cm?: number | string | null;
  moisture_condition?: string | null;
  temperature_condition?: string | null;
  access_type?: string | null;
  obstacles?: unknown;
}

const num = (value: number | string | null | undefined): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/** Normalises a listing row into the geometry the packing engine consumes. */
export function packSpaceFromListing(row: PackSpaceSource): PackSpace {
  return {
    usableVolumeM3: num(row.estimated_available_volume_m3) ?? num(row.total_volume_m3),
    floorAreaM2: num(row.floor_area_m2),
    heightM: num(row.height_m),
    doorWidthCm: num(row.door_width_cm),
    doorHeightCm: num(row.door_height_cm),
    moistureCondition: row.moisture_condition ?? null,
    temperatureCondition: row.temperature_condition ?? null,
    accessType: row.access_type ?? null,
    // Host-confirmed obstacles are not part of the public listing projection.
    obstacles: Array.isArray(row.obstacles)
      ? (row.obstacles as PackSpace["obstacles"])
      : [],
  };
}

/**
 * Builds the full, frozen SpaceFit plan for a renter's confirmed inventory in
 * a specific space. Deterministic: same inputs, same output (bar `capturedAt`).
 */
export function buildSpaceFitPlanSnapshot(
  items: InventoryItem[],
  space: PackSpace,
  now: Date = new Date(),
): SpaceFitPlanSnapshot {
  const requirement = estimateRequiredSpace(items);
  const plan = buildPackPlan(items, requirement, space);

  return {
    snapshotVersion: SPACEFIT_PLAN_SNAPSHOT_VERSION,
    algorithms: {
      requirement: SPACEFIT_REQUIREMENT_VERSION,
      pack: SPACEFIT_PACK_VERSION,
      match: SPACEFIT_ALGORITHM_VERSION,
    },
    capturedAt: now.toISOString(),
    requirement: {
      algorithm: requirement.algorithm,
      requiredVolumeM3: requirement.requiredVolumeM3,
      requiredFloorAreaM2: requirement.requiredFloorAreaM2,
      requiredHeightM: requirement.requiredHeightM,
      requiredDoorClearanceCm: requirement.requiredDoorClearanceCm,
      largestItemLabel: requirement.largestItemLabel,
      itemCount: requirement.itemCount,
      nonStackableCount: requirement.nonStackableCount,
      fragileCount: requirement.fragileCount,
      unknownSizeLines: requirement.unknownSizeLines,
      confidence: requirement.confidence,
      warnings: requirement.warnings,
    },
    plan,
    space: {
      usableVolumeM3: space.usableVolumeM3,
      floorAreaM2: space.floorAreaM2,
      heightM: space.heightM,
      doorWidthCm: space.doorWidthCm,
      doorHeightCm: space.doorHeightCm,
    },
  };
}

/**
 * Reads a stored plan back. Anything that isn't a recognisable plan returns
 * null rather than throwing — a historical row must never break a page.
 */
export function parsePlanSnapshot(value: unknown): SpaceFitPlanSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<SpaceFitPlanSnapshot>;
  if (!candidate.plan || typeof candidate.plan !== "object") return null;
  if (!Array.isArray(candidate.plan.loadingOrder)) return null;
  if (!candidate.requirement || typeof candidate.requirement !== "object") return null;
  return candidate as SpaceFitPlanSnapshot;
}

/**
 * Is there enough verified geometry to draw a schematic without inventing
 * precision? We require a floor area, a height and at least one zone.
 */
export function hasSchematicGeometry(
  plan: Pick<PackPlan, "zones">,
  space: PlanSpaceSnapshot,
): boolean {
  return (
    plan.zones.length > 0 &&
    typeof space.floorAreaM2 === "number" &&
    space.floorAreaM2 > 0 &&
    typeof space.heightM === "number" &&
    space.heightM > 0
  );
}

export const INSUFFICIENT_GEOMETRY_MESSAGE =
  "We don't have enough verified dimensions to create a reliable arrangement.";

export const SCHEMATIC_DISCLAIMER =
  "This is a planning estimate, not a measured floor plan. Check dimensions, access and safe stacking during handover.";
