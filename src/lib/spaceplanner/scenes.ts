/**
 * Spacilo AI SpacePlanner™ — reusable scene definitions.
 *
 * A "scene" is pure data: which room, which belongings, which extra objects a
 * visitor may add, and the narration shown while the planner reasons. Nothing
 * about the homepage is hardcoded in a component — the same definitions will
 * later drive the authenticated planner, the Digital Twin, the 3D view and the
 * AR view, because every one of them consumes the same `SpacePlan` output.
 */
import { CATALOGUE_BY_ID } from "./catalogue";
import { SPACE_BY_ID } from "./spaces";
import type { InventoryLine, Placement, StorageSpace } from "./types";

export interface SceneObjectRef {
  itemId: string;
  quantity: number;
}

export interface SceneDefinition {
  id: string;
  name: string;
  /** Room the scene is staged in. */
  spaceId: string;
  /** What is already in the room when the story starts. */
  objects: SceneObjectRef[];
  /** Objects a visitor may drop in afterwards, so the plan recalculates live. */
  addable: string[];
}

/** The homepage story: a real, believably untidy residential garage. */
export const GARAGE_STORY: SceneDefinition = {
  id: "residential-garage",
  name: "Residential garage",
  spaceId: "garage",
  objects: [
    { itemId: "medium-box", quantity: 6 },
    { itemId: "bicycle", quantity: 1 },
    { itemId: "mattress", quantity: 1 },
    { itemId: "suitcase", quantity: 2 },
    { itemId: "television", quantity: 1 },
    { itemId: "desk", quantity: 1 },
  ],
  addable: ["bicycle", "large-box", "suitcase", "sports-kit"],
};

export const SCENES: SceneDefinition[] = [GARAGE_STORY];

export function sceneSpace(scene: SceneDefinition): StorageSpace {
  return SPACE_BY_ID.get(scene.spaceId)!;
}

export function sceneLines(scene: SceneDefinition): InventoryLine[] {
  return quantitiesToLines(Object.fromEntries(scene.objects.map((o) => [o.itemId, o.quantity])));
}

export function sceneQuantities(scene: SceneDefinition): Record<string, number> {
  return Object.fromEntries(scene.objects.map((o) => [o.itemId, o.quantity]));
}

/** Shared quantity-map → engine input conversion used by every planner surface. */
export function quantitiesToLines(quantities: Record<string, number>): InventoryLine[] {
  return Object.entries(quantities)
    .map(([itemId, quantity]) => ({ item: CATALOGUE_BY_ID.get(itemId)!, quantity }))
    .filter((line) => Boolean(line.item) && line.quantity > 0);
}

/* -------------------------------------------------------------------------- */
/* Narration                                                                   */
/* -------------------------------------------------------------------------- */

export interface NarrationBeat {
  id: string;
  label: string;
  /** Milliseconds this beat holds when motion is allowed. */
  ms: number;
  /** True once the optimised layout is on screen. */
  organised: boolean;
}

/**
 * Each beat names a real step of the deterministic pipeline, in the order the
 * engine performs it — never a decorative loading state.
 */
export const TRANSFORMATION_BEATS: NarrationBeat[] = [
  { id: "start", label: "Your garage today", ms: 2400, organised: false },
  { id: "corners", label: "Looking for unused corners…", ms: 1100, organised: false },
  { id: "walkway", label: "Keeping your walkway clear…", ms: 1100, organised: false },
  { id: "fragile", label: "Protecting fragile belongings…", ms: 1100, organised: false },
  { id: "vertical", label: "Optimising vertical storage…", ms: 1100, organised: false },
  { id: "placement", label: "Calculating best placement…", ms: 1100, organised: false },
  { id: "layout", label: "Finished", ms: 4600, organised: true },
];

/* -------------------------------------------------------------------------- */
/* Per-object reasoning                                                        */
/* -------------------------------------------------------------------------- */

/**
 * One or two lines explaining why a single object ended up where it did.
 * Derived only from the placement the packer produced, so the explanation can
 * never describe a move the plan did not make.
 */
export function placementReason(placement: Placement, space: StorageSpace): string {
  const name = placement.label.toLowerCase();

  if (placement.upright) {
    return `Stored upright against the wall — standing your ${name} on edge gives the floor back.`;
  }
  if (placement.units > 1) {
    return `Stacked ${placement.units} high because these are marked stackable and take the weight.`;
  }
  if (placement.fragile) {
    return `Kept on top and clear of stacks so nothing can be loaded onto your ${name}.`;
  }
  if (placement.weight === "heavy") {
    return `Left on the floor towards the back — heavy items stay low and out of the walkway.`;
  }
  if (placement.zone === "front") {
    return `Placed inside the door because this is what people come back for mid-stay.`;
  }
  if (placement.zone === "back") {
    return `Moved away from the entrance of the ${space.name.toLowerCase()} — retrieval frequency is low.`;
  }
  return `Positioned mid-floor so the access strip stays clear on both sides.`;
}
