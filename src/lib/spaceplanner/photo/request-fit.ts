/**
 * Renter request → host fit analysis.
 *
 * When a request lands, the host should not have to imagine whether it fits.
 * We run the renter's inventory through the host's own space model and report
 * the estimated fit, what would remain, and how the request changes the space.
 *
 * The AI never accepts or declines: it hands the host a clearer picture.
 */
import { buildPhotoPlan, type PhotoPlanResult, type SpaceSource } from "./plan";
import { capacityFromSpace, type CapacityEstimate } from "./earnings";
import type { DetectedObject } from "@/lib/vision/types";

export interface RequestFitResult {
  plan: PhotoPlanResult;
  capacity: CapacityEstimate;
  /** 0–100 estimated fit of the request within the space. */
  fitPercent: number;
  requiredM3: number;
  availableM3: number;
  remainingM3: number;
  /** Utilisation before and after accepting, 0–100 estimates. */
  utilisationBefore: number;
  utilisationAfter: number;
  remainingPercent: number;
  recommendation: string;
}

export function analyseRequestFit({
  objects,
  space,
  currentUtilisation = 0,
}: {
  objects: DetectedObject[];
  space: SpaceSource;
  currentUtilisation?: number;
}): RequestFitResult | null {
  const plan = buildPhotoPlan(objects, space);
  if (!plan) return null;

  const capacity = capacityFromSpace(plan.space, { currentUtilisation });
  const available = Math.round(
    Math.max(0, capacity.rentableVolumeM3 * (1 - currentUtilisation / 100)) * 10,
  ) / 10;
  const required = plan.plan.metrics.requiredVolume;
  const remaining = Math.round(Math.max(0, available - required) * 10) / 10;

  const utilisationAfter = Math.min(
    100,
    Math.round(
      currentUtilisation +
        (capacity.rentableVolumeM3 > 0 ? (required / capacity.rentableVolumeM3) * 100 : 100),
    ),
  );

  const fits = required <= available && plan.plan.after.unplaced.length === 0;

  return {
    plan,
    capacity,
    fitPercent: fits ? plan.fitPercent : Math.min(plan.fitPercent, 60),
    requiredM3: Math.round(required * 10) / 10,
    availableM3: available,
    remainingM3: remaining,
    utilisationBefore: Math.round(currentUtilisation),
    utilisationAfter,
    remainingPercent: Math.max(0, 100 - utilisationAfter),
    recommendation: fits
      ? "This request appears to fit within the available space based on the information provided."
      : "This request may exceed the space currently available. Review the arrangement, or message the renter before deciding.",
  };
}
