/**
 * Plan metrics.
 *
 * Every number here is derived from the packing result, never invented, and
 * every label in the UI presents it as an estimate.
 */
import { itemVolume, round3 } from "./catalogue";
import { usableVolume, walkwayDepth } from "./spaces";
import type { InventoryLine, PackResult, PlanMetrics, StorageSpace } from "./types";

/** Head-room allowance for irregular shapes and access gaps. */
export const PACKING_ALLOWANCE = 1.25;

const pct = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

export function totalItemVolume(lines: InventoryLine[]): number {
  return round3(lines.reduce((sum, line) => sum + itemVolume(line.item) * line.quantity, 0));
}

export function computeMetrics(
  lines: InventoryLine[],
  space: StorageSpace,
  before: PackResult,
  after: PackResult,
): PlanMetrics {
  const usable = usableVolume(space);
  const volume = totalItemVolume(lines);
  const required = round3(volume * PACKING_ALLOWANCE);
  const floorArea = space.width * space.depth;

  const everythingFits = after.unplaced.length === 0 && required <= usable;
  const walkwayPreserved = after.walkway !== null || walkwayDepth(space) === 0;

  const stackables = lines.filter((l) => l.item.stackable);
  const stackableUnits = stackables.reduce((sum, l) => sum + l.quantity, 0);
  const stackingEfficiency = stackableUnits
    ? pct((after.stackedUnits / stackableUnits) * 100)
    : 100;

  const fragileLines = lines.filter((l) => l.item.fragile);
  const fragilePlacements = after.placements.filter((p) => p.fragile);
  const fragileProtected =
    fragileLines.length === 0 || fragilePlacements.every((p) => p.level > 0 || p.units === 1);

  const heavyItemsLow = after.placements
    .filter((p) => p.weight === "heavy")
    .every((p) => p.level === 0);

  const frequentIds = new Set(lines.filter((l) => l.item.frequentlyUsed).map((l) => l.item.id));
  const frequent = after.placements.filter((p) => frequentIds.has(p.itemId));
  const frequentNearDoor = frequent.filter((p) => p.zone !== "back").length;
  const retrieval = frequent.length
    ? pct(40 + (frequentNearDoor / frequent.length) * 45 + (walkwayPreserved ? 15 : 0))
    : pct(walkwayPreserved ? 82 : 60);

  const accessibility = pct(
    (walkwayPreserved ? 60 : 25) +
      (space.doorWidth >= 2 ? 25 : space.doorWidth >= 0.9 ? 15 : 8) +
      (after.unplaced.length === 0 ? 15 : 0),
  );

  const compatibility = pct(
    (everythingFits ? 62 : 24) +
      (required <= usable * 0.85 ? 18 : required <= usable ? 10 : 0) +
      (fragileProtected ? 10 : 0) +
      (heavyItemsLow ? 10 : 0),
  );

  return {
    utilisation: pct((required / usable) * 100),
    utilisationBefore: pct((before.floorAreaUsed / floorArea) * 100),
    compatibility,
    retrieval,
    accessibility,
    stackingEfficiency,
    itemVolume: volume,
    requiredVolume: required,
    usableVolume: usable,
    remainingCapacity: Math.round(Math.max(0, usable - required) * 10) / 10,
    fragileProtected,
    heavyItemsLow,
    walkwayPreserved,
    everythingFits,
  };
}
