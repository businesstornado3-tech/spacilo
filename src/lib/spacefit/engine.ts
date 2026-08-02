/**
 * SpaceFit matching engine (spacefit-v1).
 *
 * Pipeline: confirmed inventory → eligible published spaces → hard checks →
 * component scoring → ranked, explainable results. Fully deterministic.
 */
import { calculateTotals, type InventoryItem, type ItemCategory } from "@/lib/inventory-model";
import { SPACEFIT_ALGORITHM_VERSION } from "./types";
import type { ComponentKey, ComponentScore, MatchInventory, MatchSpace, SpaceFitResult } from "./types";
import { spaceFitLabel } from "./config";
import { runHardChecks } from "./rules";
import {
  accessComponent,
  capacityComponent,
  completenessComponent,
  conditionsComponent,
  geometryComponent,
  itemComponent,
} from "./scoring";
import { buildExplanations } from "./explanations";

/** Builds the renter side of the comparison from CONFIRMED inventory items. */
export function buildMatchInventory(items: InventoryItem[]): MatchInventory {
  const totals = calculateTotals(items);
  const categories: ItemCategory[] = [];
  for (const item of items) {
    if (!categories.includes(item.category)) categories.push(item.category);
  }
  categories.sort();
  return {
    storageRequirementM3: totals.storageRequirementM3,
    itemVolumeM3: totals.itemVolumeM3,
    itemCount: totals.itemCount,
    categories,
    items,
  };
}

/** Evaluates a single published space against a confirmed inventory. */
export function evaluateSpace(space: MatchSpace, inventory: MatchInventory): SpaceFitResult {
  const { failures, capacityRatio, coverage, entrance } = runHardChecks(space, inventory);

  if (failures.length > 0) {
    return {
      space_id: space.id,
      algorithm: SPACEFIT_ALGORITHM_VERSION,
      compatible: false,
      score: null,
      label: "Not suitable",
      components: null,
      positives: [],
      warnings: [],
      hard_failures: failures,
      completenessPoints: completenessComponent(space).score,
      pricePence: space.monthly_price_pence,
    };
  }

  const components: Record<ComponentKey, ComponentScore> = {
    capacity: capacityComponent(space, inventory, capacityRatio),
    itemCompatibility: itemComponent(coverage),
    conditions: conditionsComponent(space),
    access: accessComponent(space),
    geometry: geometryComponent(entrance),
    completeness: completenessComponent(space),
  };

  // The total is the sum of the parts — never computed separately.
  const score = (Object.keys(components) as ComponentKey[]).reduce(
    (sum, key) => sum + components[key].score,
    0,
  );

  const { positives, warnings } = buildExplanations(space, components, coverage, entrance, capacityRatio);

  return {
    space_id: space.id,
    algorithm: SPACEFIT_ALGORITHM_VERSION,
    compatible: true,
    score,
    label: spaceFitLabel(score),
    components,
    positives,
    warnings,
    hard_failures: [],
    completenessPoints: components.completeness.score,
    pricePence: space.monthly_price_pence,
  };
}

export interface MatchRun<S extends MatchSpace = MatchSpace> {
  compatible: { space: S; result: SpaceFitResult }[];
  incompatible: { space: S; result: SpaceFitResult }[];
}

/**
 * Runs matching over every eligible space.
 * Ranking: SpaceFit score desc → listing completeness desc → price asc → id.
 */
export function runMatching<S extends MatchSpace>(spaces: S[], inventory: MatchInventory): MatchRun<S> {
  const evaluated = spaces.map((space) => ({ space, result: evaluateSpace(space, inventory) }));

  const compatible = evaluated
    .filter((entry) => entry.result.compatible)
    .sort((a, b) => {
      const byScore = (b.result.score ?? 0) - (a.result.score ?? 0);
      if (byScore !== 0) return byScore;
      const byData = b.result.completenessPoints - a.result.completenessPoints;
      if (byData !== 0) return byData;
      const byPrice = (a.result.pricePence ?? Number.MAX_SAFE_INTEGER) - (b.result.pricePence ?? Number.MAX_SAFE_INTEGER);
      if (byPrice !== 0) return byPrice;
      return a.space.id.localeCompare(b.space.id);
    });

  const incompatible = evaluated
    .filter((entry) => !entry.result.compatible)
    .sort((a, b) => a.space.id.localeCompare(b.space.id));

  return { compatible, incompatible };
}

export { SPACEFIT_ALGORITHM_VERSION } from "./types";
export type { SpaceFitResult, MatchSpace, MatchInventory } from "./types";
