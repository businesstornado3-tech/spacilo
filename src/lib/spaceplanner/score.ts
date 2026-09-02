/**
 * The EarnRoom AI Score.
 *
 * A single, deterministic confidence figure derived only from facts the
 * planner already computed: whether everything fits, whether the opening and
 * ceiling clear the largest item, whether heavy items stay low, whether the
 * access strip survives, and how hard the pack is to build. No weighting is
 * secret and no number is invented — the same inventory in the same space
 * always scores the same.
 */
import type { InventoryLine, SpacePlan, StorageSpace } from "./types";

export type ScoreBand =
  | "Excellent fit"
  | "Very good fit"
  | "Good fit"
  | "Tight fit"
  | "Consider a larger space"
  | "Not recommended";

export type CheckState = "passed" | "attention" | "failed";

export interface ScoreCheck {
  id: string;
  label: string;
  state: CheckState;
  detail: string;
}

export type PackingComplexity = "Easy" | "Moderate" | "Involved";

export interface EarnRoomScore {
  /** 0–100. */
  value: number;
  band: ScoreBand;
  /** Fit percentage of the required volume against usable volume. */
  fitPercent: number;
  complexity: PackingComplexity;
  checks: ScoreCheck[];
  /** Plain recommendation line, e.g. "Highly recommended". */
  recommendation: string;
}

const cmToM = (value: number) => value / 100;

export function bandFor(value: number): ScoreBand {
  if (value >= 95) return "Excellent fit";
  if (value >= 88) return "Very good fit";
  if (value >= 78) return "Good fit";
  if (value >= 68) return "Tight fit";
  if (value >= 50) return "Consider a larger space";
  return "Not recommended";
}

export function recommendationFor(band: ScoreBand): string {
  switch (band) {
    case "Excellent fit":
    case "Very good fit":
      return "Highly recommended";
    case "Good fit":
      return "Recommended";
    case "Tight fit":
      return "Workable, with care";
    case "Consider a larger space":
      return "Consider a larger space";
    default:
      return "Not recommended";
  }
}

/** Smallest opening the item can pass through, allowing a sensible rotation. */
function narrowestFace(width: number, depth: number, height: number): number {
  const dims = [cmToM(width), cmToM(depth), cmToM(height)].sort((a, b) => a - b);
  return dims[1] ?? 0;
}

export function doorClearance(lines: InventoryLine[], space: StorageSpace): ScoreCheck {
  const widest = lines.reduce(
    (max, line) => Math.max(max, narrowestFace(line.item.width, line.item.depth, line.item.height)),
    0,
  );
  const margin = space.doorWidth - widest;
  const state: CheckState = margin >= 0.15 ? "passed" : margin >= 0 ? "attention" : "failed";
  return {
    id: "door",
    label: "Door clearance",
    state,
    detail:
      state === "failed"
        ? `Largest item needs about ${widest.toFixed(2)}m through a ${space.doorWidth.toFixed(2)}m opening`
        : `Largest item about ${widest.toFixed(2)}m through a ${space.doorWidth.toFixed(2)}m opening`,
  };
}

export function ceilingClearance(lines: InventoryLine[], space: StorageSpace): ScoreCheck {
  const tallest = lines.reduce((max, line) => Math.max(max, cmToM(line.item.height)), 0);
  const state: CheckState =
    tallest <= space.height - 0.3 ? "passed" : tallest <= space.height ? "attention" : "failed";
  return {
    id: "ceiling",
    label: "Ceiling",
    state,
    detail: `Tallest item about ${tallest.toFixed(2)}m under a ${space.height.toFixed(2)}m ceiling`,
  };
}

export function packingComplexity(plan: SpacePlan): PackingComplexity {
  const stacked = plan.after.stackedUnits;
  const utilisation = plan.metrics.utilisation;
  if (utilisation >= 85 || stacked >= 8) return "Involved";
  if (utilisation >= 60 || stacked >= 3) return "Moderate";
  return "Easy";
}

export function earnroomScore(plan: SpacePlan): EarnRoomScore {
  const m = plan.metrics;
  const door = doorClearance(plan.lines, plan.space);
  const ceiling = ceilingClearance(plan.lines, plan.space);

  const checks: ScoreCheck[] = [
    {
      id: "fit",
      label: "Estimated fit",
      state: m.everythingFits ? "passed" : "failed",
      detail: m.everythingFits
        ? `About ${m.requiredVolume.toFixed(1)}m³ needed of ~${m.usableVolume.toFixed(1)}m³ usable`
        : `About ${m.requiredVolume.toFixed(1)}m³ needed, more than the ~${m.usableVolume.toFixed(1)}m³ usable`,
    },
    door,
    {
      id: "walkway",
      label: "Walkway",
      state: m.walkwayPreserved ? "passed" : "attention",
      detail: m.walkwayPreserved ? "Access strip kept clear" : "Access strip is blocked",
    },
    {
      id: "weight",
      label: "Weight",
      state: m.heavyItemsLow ? "passed" : "attention",
      detail: m.heavyItemsLow ? "Heavy items on the floor" : "Heavy items are stacked high",
    },
    ceiling,
    {
      id: "fragile",
      label: "Fragile items",
      state: m.fragileProtected ? "passed" : "attention",
      detail: m.fragileProtected ? "Fragile items kept clear" : "Fragile items need extra care",
    },
  ];

  const penalty = checks.reduce(
    (sum, check) => sum + (check.state === "failed" ? 22 : check.state === "attention" ? 7 : 0),
    0,
  );

  // Head-room reward: the more comfortably it fits, the higher the confidence.
  const headroom = m.usableVolume > 0 ? 1 - m.requiredVolume / m.usableVolume : 0;
  const base = 62 + Math.max(0, Math.min(1, headroom)) * 26 + (m.compatibility / 100) * 12;

  const value = Math.max(0, Math.min(100, Math.round(base - penalty)));
  const band = bandFor(value);

  return {
    value,
    band,
    fitPercent: Math.max(
      0,
      Math.min(
        100,
        Math.round(m.usableVolume > 0 ? (m.requiredVolume / m.usableVolume) * 100 : 0),
      ),
    ),
    complexity: packingComplexity(plan),
    checks,
    recommendation: recommendationFor(band),
  };
}
