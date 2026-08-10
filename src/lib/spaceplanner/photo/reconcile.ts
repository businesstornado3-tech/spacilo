/**
 * Phase 6Y — detection → manifest reconciliation.
 *
 * The invariant this file exists to enforce, in one line:
 *
 *   detectedCount = classifiedCount = manifestPlacedCount + manifestUnplacedCount
 *
 * Nothing the photograph showed and the user confirmed may quietly vanish on
 * its way to the arrangement. An item the planner cannot fit is UNPLACED with
 * a measured reason — it is never deleted. If this report ever shows a drop,
 * that is a bug in the pipeline and the UI says so rather than presenting a
 * confident-looking plan of a shortened inventory.
 */
import type { DetectedObject } from "@/lib/vision/types";
import type { CanonicalInventory, PlacementManifest } from "./manifest";

export interface ReconciliationReport {
  /** Units the scan detected, counting quantities. */
  detectedCount: number;
  /** Units the confirmed canonical inventory carries. */
  classifiedCount: number;
  /** Units the deterministic engine physically placed. */
  manifestPlacedCount: number;
  /** Units the engine explicitly refused to place, with reasons. */
  manifestUnplacedCount: number;
  /** Units that exist upstream but appear nowhere downstream. Must be 0. */
  droppedCount: number;
  /** Labels of the dropped objects, so a failure can be traced to an item. */
  droppedLabels: string[];
  /** True only when every count above balances. */
  balanced: boolean;
}

const unitsOf = (objects: readonly DetectedObject[]) =>
  objects.reduce((sum, object) => sum + Math.max(0, object.quantity), 0);

/**
 * Builds the report. Every stage that has not happened yet contributes 0 and
 * is reported as balanced — the check only bites once a manifest exists.
 */
export function reconcileInventory(input: {
  detected: readonly DetectedObject[];
  inventory: CanonicalInventory | null;
  manifest: PlacementManifest | null;
}): ReconciliationReport {
  const detectedCount = unitsOf(input.detected);
  const classifiedCount = input.inventory?.itemCount ?? 0;

  if (!input.inventory || !input.manifest) {
    return {
      detectedCount,
      classifiedCount,
      manifestPlacedCount: 0,
      manifestUnplacedCount: 0,
      droppedCount: 0,
      droppedLabels: [],
      balanced: true,
    };
  }

  const manifest = input.manifest;
  const manifestPlacedCount = manifest.placedUnits;
  // Everything the manifest expected but did not place is, by definition,
  // unplaced. Derived rather than trusted, so the two can never disagree.
  const manifestUnplacedCount = Math.max(0, manifest.expectedUnits - manifest.placedUnits);

  // An object is "dropped" when the confirmed inventory holds it but the
  // manifest has no entry for it at all — neither placed nor unplaced.
  const manifestIds = new Set(manifest.entries.map((entry) => entry.id));
  const droppedLabels = input.inventory.objects
    .filter((object) => !manifestIds.has(object.id))
    .map((object) => object.label);

  const accounted = manifestPlacedCount + manifestUnplacedCount;
  const droppedCount =
    droppedLabels.length > 0
      ? input.inventory.objects
          .filter((object) => !manifestIds.has(object.id))
          .reduce((sum, object) => sum + object.quantity, 0)
      : Math.max(0, classifiedCount - accounted);

  return {
    detectedCount,
    classifiedCount,
    manifestPlacedCount,
    manifestUnplacedCount,
    droppedCount,
    droppedLabels,
    balanced:
      droppedCount === 0 &&
      detectedCount === classifiedCount &&
      classifiedCount === accounted,
  };
}
