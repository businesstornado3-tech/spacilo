/**
 * Spacilo AI SpacePlanner™ — public entry point.
 *
 * `buildPlan` is the whole demo brain: pure, synchronous and deterministic.
 *
 * FUTURE HOOK — replacing the simulation with the real engine
 * ----------------------------------------------------------
 * The UI only ever depends on the `SpacePlannerEngine` shape below. A later
 * phase can register an engine backed by computer vision (Scan My Stuff™ /
 * Scan My Space™), the 3D Digital Twin™ or a server optimisation service, and
 * every component on this page keeps working: same inputs, same `SpacePlan`
 * output, no redesign. Nothing in the UI calls `buildPlan` directly except the
 * default engine below.
 */
import { computeMetrics } from "./metrics";
import { explainPlan } from "./explain";
import { packNaive, packOptimised } from "./pack";
import type { InventoryLine, SpacePlan, StorageSpace } from "./types";

export * from "./types";
export * from "./catalogue";
export * from "./spaces";
export * from "./stages";
export * from "./scenes";
export { computeMetrics, totalItemVolume, PACKING_ALLOWANCE } from "./metrics";
export { packNaive, packOptimised } from "./pack";

export interface SpacePlannerEngine {
  readonly id: string;
  /** Synchronous today; the async signature keeps a served engine drop-in. */
  plan(lines: InventoryLine[], space: StorageSpace): SpacePlan;
}

export function buildPlan(lines: InventoryLine[], space: StorageSpace): SpacePlan {
  const active = lines.filter((line) => line.quantity > 0);
  const before = packNaive(active, space);
  const after = packOptimised(active, space);
  const metrics = computeMetrics(active, space, before, after);

  return {
    space,
    lines: active,
    before,
    after,
    metrics,
    explanations: explainPlan(active, space, before, after, metrics),
    itemCount: active.reduce((sum, line) => sum + line.quantity, 0),
  };
}

/** The engine the public homepage demo runs on. */
export const simulationEngine: SpacePlannerEngine = {
  id: "spaceplanner-simulation-v1",
  plan: buildPlan,
};
