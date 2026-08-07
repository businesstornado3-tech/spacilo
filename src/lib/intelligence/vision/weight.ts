/**
 * Stage 6 — weight estimation.
 *
 * Weight comes from estimated volume multiplied by the density of its weight
 * class — the same densities the planner already uses, so one item never
 * weighs two different things in two parts of the product.
 *
 * The output is about safety, not trivia: who should lift it, whether anything
 * may sit on top, and how much.
 */
import { DENSITY_KG_PER_M3 } from "@/lib/spaceplanner/library";
import type { WeightClass } from "@/lib/spaceplanner/types";

import type { VisionClassification, VisionDimensions, VisionWeight } from "./contracts";

/** UK manual-handling guidance, applied conservatively. */
export const ONE_PERSON_LIMIT_KG = 20;
export const TWO_PERSON_LIMIT_KG = 40;

/** Fraction of its own weight an item can safely carry on top. */
const STACK_LOAD_RATIO: Record<WeightClass, number> = {
  light: 0.6,
  medium: 1,
  heavy: 1.4,
};

export function estimateWeight(
  dimensions: VisionDimensions,
  classification: VisionClassification,
  quantity: number,
): VisionWeight {
  const density = DENSITY_KG_PER_M3[classification.weightClass];
  const perUnitKg = Math.max(1, Math.round(dimensions.volumeM3 * density));
  const totalKg = perUnitKg * quantity;

  const heavyLift = perUnitKg > TWO_PERSON_LIMIT_KG;
  const twoPersonLift = perUnitKg > ONE_PERSON_LIMIT_KG;
  const fragileLift = classification.fragile;

  const liftClass = heavyLift
    ? "heavy_lift"
    : fragileLift
      ? "fragile_lift"
      : twoPersonLift
        ? "two_person"
        : "one_person";

  const safeStackLoadKg = classification.stackable
    ? Math.round(perUnitKg * STACK_LOAD_RATIO[classification.weightClass])
    : 0;

  return {
    perUnitKg,
    totalKg,
    weightClass: classification.weightClass,
    liftClass,
    heavyLift,
    twoPersonLift,
    fragileLift,
    safeStackLoadKg,
    safeToStack: classification.stackable && !classification.fragile,
    // Weight inherits dimension error, so it is never more certain than shape.
    weightConfidence: Math.round(dimensions.dimensionConfidence * 0.92 * 100) / 100,
  };
}
