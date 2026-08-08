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
