/**
 * Host earnings, driven by what SpacePlanner actually observed.
 *
 * The host never re-enters anything the scan already estimated: usable volume
 * comes from the space analysis, rentable capacity is derived from it, and the
 * existing marketplace value model prices it. Estimates only — never a promise.
 */
import { estimateSpaceValue, type SpaceValueEstimate, type ValueSpaceType } from "@/lib/vision/space-value";

import { usableVolume } from "../spaces";
import type { StorageSpace } from "../types";

/** Share of usable capacity a host can realistically let out. */
export const RENTABLE_SHARE = 0.86;

export interface CapacityEstimate {
  usableVolumeM3: number;
  rentableVolumeM3: number;
  usableAreaM2: number;
  rentableAreaM2: number;
  /** 0–100 estimate of how much of the space is currently in use. */
  currentUtilisation: number;
  /** 0–100 estimate after an optimised arrangement. */
  potentialUtilisation: number;
}

export function capacityFromSpace(
  space: StorageSpace,
  { currentUtilisation = 0 }: { currentUtilisation?: number } = {},
): CapacityEstimate {
  const usable = usableVolume(space);
  const rentable = Math.round(usable * RENTABLE_SHARE * 10) / 10;
  const area = Math.round(space.width * space.depth * 10) / 10;
  const potential = Math.max(
    currentUtilisation,
    Math.min(92, Math.round(currentUtilisation + (100 - currentUtilisation) * 0.45)),
  );

  return {
    usableVolumeM3: Math.round(usable * 10) / 10,
    rentableVolumeM3: rentable,
    usableAreaM2: area,
    rentableAreaM2: Math.round(area * RENTABLE_SHARE * 10) / 10,
    currentUtilisation: Math.round(currentUtilisation),
    potentialUtilisation: potential,
  };
}

/**
 * Capacity from a validated physical arrangement.
 *
 * Preferred over `capacityFromSpace` wherever a plan exists: it uses the floor
 * the host actually approved, minus the access route and anything excluded, so
 * the earnings range reflects lettable space rather than raw cubic metres.
 */
export function capacityFromArrangement(arrangement: {
  usableVolumeM3: number;
  usableFloorM2: number;
  walkwayFloorM2: number;
  excludedFloorM2: number;
  utilisationPercent: number;
}): CapacityEstimate {
  const netArea = Math.max(
    0,
    arrangement.usableFloorM2 - arrangement.walkwayFloorM2 - arrangement.excludedFloorM2,
  );
  const areaShare = arrangement.usableFloorM2 > 0 ? netArea / arrangement.usableFloorM2 : 0;
  const usable = Math.max(0, arrangement.usableVolumeM3 * areaShare);
  const current = Math.round(arrangement.utilisationPercent);

  return {
    usableVolumeM3: Math.round(usable * 10) / 10,
    rentableVolumeM3: Math.round(usable * RENTABLE_SHARE * 10) / 10,
    usableAreaM2: Math.round(netArea * 10) / 10,
    rentableAreaM2: Math.round(netArea * RENTABLE_SHARE * 10) / 10,
    currentUtilisation: current,
    potentialUtilisation: Math.max(
      current,
      Math.min(92, Math.round(current + (100 - current) * 0.45)),
    ),
  };
}


export interface EarningsEstimate {
  capacity: CapacityEstimate;
  value: SpaceValueEstimate;
  monthlyMin: number;
  monthlyMax: number;
  annualMin: number;
  annualMax: number;
  basis: string[];
}

export function estimateEarningsFromCapacity({
  capacity,
  spaceType,
  postcode = "",
}: {
  capacity: CapacityEstimate;
  spaceType: ValueSpaceType;
  postcode?: string;
}): EarningsEstimate {
  const value = estimateSpaceValue({
    spaceType,
    areaM2: capacity.rentableAreaM2,
    postcode,
  });

  return {
    capacity,
    value,
    monthlyMin: value.monthlyMin,
    monthlyMax: value.monthlyMax,
    annualMin: value.monthlyMin * 12,
    annualMax: value.monthlyMax * 12,
    basis: [
      "Estimated usable capacity from your photos",
      "Space type and typical rentable share",
      value.basis,
      `${value.demand} local demand band`,
      "Expected utilisation over a typical let",
    ],
  };
}

/**
 * A finished SpacePlanner result → the host's estimated monthly earnings.
 *
 * Earnings follow *usable* capacity, never the raw cubic volume of the room:
 * the analysis already accounts for access, obstacles and walkways, and the
 * rentable share trims it further. Utilisation comes from the plan itself, so
 * a space that is already half full is never priced as if it were empty.
 */
export function earningsFromPlan({
  usableVolumeM3,
  usableAreaM2,
  occupiedVolumeM3 = 0,
  spaceType,
  postcode = "",
}: {
  usableVolumeM3: number;
  usableAreaM2: number;
  occupiedVolumeM3?: number;
  spaceType: ValueSpaceType;
  postcode?: string;
}): EarningsEstimate {
  const usable = Math.max(0, usableVolumeM3);
  const utilisation = usable > 0 ? Math.min(100, (occupiedVolumeM3 / usable) * 100) : 0;
  const rentableVolume = Math.round(usable * RENTABLE_SHARE * 10) / 10;
  const area = Math.max(0, Math.round(usableAreaM2 * 10) / 10);

  const capacity: CapacityEstimate = {
    usableVolumeM3: Math.round(usable * 10) / 10,
    rentableVolumeM3: rentableVolume,
    usableAreaM2: area,
    rentableAreaM2: Math.round(area * RENTABLE_SHARE * 10) / 10,
    currentUtilisation: Math.round(utilisation),
    potentialUtilisation: Math.max(
      Math.round(utilisation),
      Math.min(92, Math.round(utilisation + (100 - utilisation) * 0.45)),
    ),
  };

  return estimateEarningsFromCapacity({ capacity, spaceType, postcode });
}

/** Practical, non-guaranteed ways a host could open up more rentable space. */
export function improvementIdeas(capacity: CapacityEstimate, hasShelving: boolean): string[] {
  const ideas: string[] = [];
  if (capacity.currentUtilisation > 20) {
    ideas.push(
      `Reorganising this area could increase estimated usable capacity — your current estimated utilisation is ${capacity.currentUtilisation}%, and an optimised arrangement could potentially reach around ${capacity.potentialUtilisation}%.`,
    );
  }
  if (!hasShelving) {
    ideas.push("Adding suitable shelving may improve vertical storage and free up floor area.");
  }
  ideas.push("Keeping a clear access path could make more of the space rentable.");
  return ideas;
}
