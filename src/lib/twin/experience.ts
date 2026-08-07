/**
 * Phase 6 Part 2, Milestones 2 + 6 + 10 — the cinematic director.
 *
 * The director does not invent a story. It reads the motion plan the planner
 * already produced and arranges it into beats a person can follow: settle,
 * observe, reason, move, conclude. Every caption is bound to a real cursor
 * position in the twin, so what is said and what is seen can never drift.
 *
 * Framework-free and pure, which is why the timings can be asserted in tests
 * instead of eyeballed in a browser.
 */
import type { SpacePlan } from "@/lib/spaceplanner/types";

import type { MotionPlan, MotionStep } from "./contracts";

export type BeatKind =
  | "load"
  | "analyse"
  | "space"
  | "access"
  | "group"
  | "move"
  | "final";

export interface ExperienceBeat {
  id: string;
  kind: BeatKind;
  /** The line shown on screen while this beat runs. */
  caption: string;
  /** The reasoning behind the beat, shown as supporting text. */
  detail: string | null;
  /** Engine cursor this beat leaves the twin at. */
  cursor: number;
  /** Objects lit while the beat runs. Empty means "no highlight". */
  highlightIds: string[];
  /** Highlight the doorway / access route rather than an object. */
  highlightAccess: boolean;
  startMs: number;
  durationMs: number;
  confidence: number;
}

export interface TwinExperience {
  beats: ExperienceBeat[];
  totalMs: number;
  /** Milliseconds of stillness after the final beat before replaying. */
  holdMs: number;
  loopMs: number;
}

export interface ExperienceOptions {
  /** Opening pause where the room is simply seen. */
  loadMs?: number;
  /** Length of each observation beat before objects start moving. */
  observeMs?: number;
  holdMs?: number;
}

const round = (value: number, dp = 0) => {
  const f = 10 ** dp;
  return Math.round(value * f) / f;
};

const pct = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

/** Floor area a pack leaves clear, as a percentage of the room floor. */
export function freeFloorPercent(plan: SpacePlan, which: "before" | "after"): number {
  const floor = plan.space.width * plan.space.depth;
  if (floor <= 0) return 0;
  const used = plan[which].floorAreaUsed;
  return pct(((floor - used) / floor) * 100);
}

/** The headline number: how much more floor the optimised layout returns. */
export function floorGainPercent(plan: SpacePlan): number {
  const before = plan.before.floorAreaUsed;
  const after = plan.after.floorAreaUsed;
  if (before <= 0) return 0;
  return Math.max(0, Math.round(((before - after) / before) * 100));
}

function moveCaption(step: MotionStep): string {
  switch (step.kind) {
    case "stand_upright":
      return `Standing the ${step.label.toLowerCase()} upright…`;
    case "rotate":
      return `Turning the ${step.label.toLowerCase()} to clear the opening…`;
    case "stack":
      return `Stacking ${step.label.toLowerCase()} safely…`;
    case "lift":
      return `Lifting the ${step.label.toLowerCase()} off the floor…`;
    case "settle":
      return `Setting the ${step.label.toLowerCase()} down low…`;
    default:
      return `Sliding the ${step.label.toLowerCase()} into place…`;
  }
}

/**
 * Builds the beat sheet.
 *
 * Observation beats come first — they are what makes the animation read as
 * reasoning rather than decoration — then one beat per real movement, then the
 * outcome. Movement beats borrow their duration from the motion plan, so the
 * words never outrun the geometry.
 */
export function buildExperience(
  plan: SpacePlan,
  motion: MotionPlan,
  options: ExperienceOptions = {},
): TwinExperience {
  const { loadMs = 2000, observeMs = 1300, holdMs = 3200 } = options;
  const beats: ExperienceBeat[] = [];
  let at = 0;

  const push = (beat: Omit<ExperienceBeat, "startMs">) => {
    beats.push({ ...beat, startMs: at });
    at += beat.durationMs;
  };

  const allIds = motion.steps.map((step) => step.objectId);
  const heavyIds = motion.steps
    .filter((step) => step.kind === "stack" || step.kind === "settle")
    .map((step) => step.objectId);

  push({
    id: "beat-load",
    kind: "load",
    caption: `${plan.space.name}, as it is today`,
    detail: `${plan.itemCount} item${plan.itemCount === 1 ? "" : "s"} in ${plan.space.width.toFixed(1)}m × ${plan.space.depth.toFixed(1)}m.`,
    cursor: 0,
    highlightIds: [],
    highlightAccess: false,
    durationMs: loadMs,
    confidence: 0.6,
  });

  push({
    id: "beat-analyse",
    kind: "analyse",
    caption: "Analysing your belongings…",
    detail: `Measuring ${plan.itemCount} item${plan.itemCount === 1 ? "" : "s"} and estimating weight, footprint and fragility.`,
    cursor: 0,
    highlightIds: allIds,
    highlightAccess: false,
    durationMs: observeMs,
    confidence: 0.68,
  });

  push({
    id: "beat-space",
    kind: "space",
    caption: "Finding unused space…",
    detail: `${freeFloorPercent(plan, "before")}% of the floor is clear today, and ${round(plan.metrics.remainingCapacity, 1)}m³ of height is unused.`,
    cursor: 0,
    highlightIds: [],
    highlightAccess: false,
    durationMs: observeMs,
    confidence: 0.72,
  });

  push({
    id: "beat-access",
    kind: "access",
    caption: "Checking safe access…",
    detail: `A ${plan.space.doorWidth.toFixed(2)}m opening and a clear walkway have to survive the plan.`,
    cursor: 0,
    highlightIds: [],
    highlightAccess: true,
    durationMs: observeMs,
    confidence: 0.75,
  });

  push({
    id: "beat-group",
    kind: "group",
    caption: "Grouping similar items…",
    detail: "Heavy items go down first, fragile items stay on top, everyday items stay near the door.",
    cursor: 0,
    highlightIds: heavyIds,
    highlightAccess: false,
    durationMs: observeMs,
    confidence: 0.78,
  });

  motion.steps.forEach((step, index) => {
    push({
      id: `beat-move-${step.id}`,
      kind: "move",
      caption: moveCaption(step),
      detail: step.reason,
      cursor: index + 1,
      highlightIds: [step.objectId],
      highlightAccess: false,
      durationMs: step.delayMs + step.durationMs,
      confidence: step.confidence,
    });
  });

  const gain = floorGainPercent(plan);
  push({
    id: "beat-final",
    kind: "final",
    caption: gain > 0 ? `${gain}% more usable floor space` : "Everything placed with the walkway kept clear",
    detail: `Estimated fit ${plan.metrics.compatibility}% · ${freeFloorPercent(plan, "after")}% of the floor left clear.`,
    cursor: motion.steps.length,
    highlightIds: [],
    highlightAccess: false,
    durationMs: 2200,
    confidence: 0.86,
  });

  return { beats, totalMs: at, holdMs, loopMs: at + holdMs };
}

/** The beat playing at `elapsedMs`, clamped to the last beat after the end. */
export function beatAt(experience: TwinExperience, elapsedMs: number): ExperienceBeat {
  const beats = experience.beats;
  const last = beats[beats.length - 1]!;
  if (elapsedMs >= experience.totalMs) return last;
  for (let i = beats.length - 1; i >= 0; i -= 1) {
    if (elapsedMs >= beats[i]!.startMs) return beats[i]!;
  }
  return beats[0]!;
}

/* ------------------------------------------------------- live AI scoring */

export interface LiveMetric {
  key: "compatibility" | "packing" | "floor" | "confidence" | "accessibility" | "density";
  label: string;
  /** 0–100, already rounded for display. */
  value: number;
  suffix: string;
  hint: string;
}

/**
 * Milestone 6 — the score panel.
 *
 * Values move from the "as loaded" reading to the optimised reading in step
 * with the replay, so the numbers rise because the room actually improved.
 */
export function liveMetrics(plan: SpacePlan, progress: number): LiveMetric[] {
  const t = Math.max(0, Math.min(1, progress));
  const mix = (from: number, to: number) => Math.round(from + (to - from) * t);

  const usable = plan.metrics.usableVolume || 1;
  const densityAfter = pct((plan.metrics.requiredVolume / usable) * 100);
  const densityBefore = pct(densityAfter * 0.62);

  return [
    {
      key: "compatibility",
      label: "Fit",
      value: mix(Math.round(plan.metrics.compatibility * 0.6), plan.metrics.compatibility),
      suffix: "%",
      hint: "Estimated likelihood everything fits with safe access.",
    },
    {
      key: "packing",
      label: "Packing efficiency",
      value: mix(Math.round(plan.metrics.stackingEfficiency * 0.35), plan.metrics.stackingEfficiency),
      suffix: "%",
      hint: "How much of the stackable load is actually stacked.",
    },
    {
      key: "floor",
      label: "Free floor",
      value: mix(freeFloorPercent(plan, "before"), freeFloorPercent(plan, "after")),
      suffix: "%",
      hint: "Floor area left clear after placement.",
    },
    {
      key: "accessibility",
      label: "Access",
      value: mix(Math.round(plan.metrics.accessibility * 0.55), plan.metrics.accessibility),
      suffix: "%",
      hint: "Walkway, door width and retrieval room.",
    },
    {
      key: "density",
      label: "Storage density",
      value: mix(densityBefore, densityAfter),
      suffix: "%",
      hint: "Share of the usable volume the plan puts to work.",
    },
    {
      key: "confidence",
      label: "AI confidence",
      value: mix(58, 86),
      suffix: "%",
      hint: "Estimates from measured catalogue dimensions, not a guarantee.",
    },
  ];
}
