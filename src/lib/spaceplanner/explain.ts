/**
 * Plain-English reasons.
 *
 * Each sentence is generated from something the packer actually did, so the
 * explanation panel can never describe a move the plan did not make.
 */
import type { InventoryLine, PackResult, PlanMetrics, StorageSpace } from "./types";

export function explainPlan(
  lines: InventoryLine[],
  space: StorageSpace,
  before: PackResult,
  after: PackResult,
  metrics: PlanMetrics,
): string[] {
  const reasons: string[] = [];
  const label = space.name.toLowerCase();

  const uprights = after.placements.filter((p) => p.upright);
  for (const p of uniqueBy(uprights, (p) => p.itemId).slice(0, 2)) {
    reasons.push(
      `Your ${p.label.toLowerCase()} takes far less floor space stood on its edge, so it has been turned upright against the wall.`,
    );
  }

  const stacks = after.placements.filter((p) => p.units > 1);
  const deepest = stacks.reduce<(typeof stacks)[number] | null>(
    (best, p) => (!best || p.units > best.units ? p : best),
    null,
  );
  if (deepest) {
    reasons.push(
      `${deepest.label} stack safely ${deepest.units} high, which frees floor area without leaning anything against your other belongings.`,
    );
  }

  const heavy = after.placements.filter((p) => p.weight === "heavy");
  if (heavy.length > 0 && metrics.heavyItemsLow) {
    reasons.push(
      `Heavier items such as ${heavy[0]!.label.toLowerCase()} stay on the floor and towards the back wall, so nothing weighty sits above head height.`,
    );
  }

  const fragile = after.placements.filter((p) => p.fragile);
  if (fragile.length > 0) {
    reasons.push(
      metrics.fragileProtected
        ? `Fragile items — ${listNames(fragile)} — sit on top of solid bases so nothing can be placed on them later.`
        : `Fragile items — ${listNames(fragile)} — are kept clear of stacks, and we would suggest a shelf or crate for extra protection.`,
    );
  }

  const frequent = after.placements.filter((p) => p.zone === "front" || p.zone === "middle");
  const frequentLabels = uniqueBy(frequent, (p) => p.itemId).slice(0, 2);
  if (frequentLabels.length > 0) {
    reasons.push(
      `${listNames(frequentLabels)} are placed nearest the entrance because they are the things people come back for mid-stay.`,
    );
  }

  if (after.walkway) {
    reasons.push(
      `A ${after.walkway.d.toFixed(1)}m access strip is kept clear inside the door, so you can reach the back of the ${label} without unloading everything first.`,
    );
  }

  if (after.unplaced.length > 0) {
    reasons.push(
      `${after.unplaced.length} item${after.unplaced.length === 1 ? "" : "s"} would not fit in this ${label} on these estimates — a larger space, or storing in two visits, would be the safer plan.`,
    );
  } else {
    reasons.push(
      `On these estimates everything fits, with roughly ${metrics.remainingCapacity.toFixed(1)}m³ of the ${label} still free.`,
    );
  }

  const reclaimed = before.floorAreaUsed - after.floorAreaUsed;
  if (reclaimed > 0.15) {
    reasons.push(
      `Rotating and stacking reclaims about ${reclaimed.toFixed(1)}m² of floor compared with loading items in the order they arrive.`,
    );
  }

  if (lines.length === 0) {
    return ["Add a few belongings and EarnRoom AI will plan the space around them."];
  }

  return reasons;
}

function listNames<T extends { label: string }>(items: T[]): string {
  const names = uniqueBy(items, (i) => i.label).map((i) => i.label.toLowerCase());
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const k = key(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}
