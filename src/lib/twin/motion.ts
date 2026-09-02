/**
 * Milestone 6 + 13 — the motion planner.
 *
 * This is the module that keeps the signature animation honest. It never
 * invents a movement: it diffs the planner's *unplanned* pack against its
 * *optimised* pack and animates the difference. If an object does not move in
 * the real plan, it does not move on screen. If it does, the reason is derived
 * from the same facts that made the planner move it.
 *
 * The ordering is the reasoning order a person would use — clear the walkway,
 * put the heavy things down first, stand the long things up, stack, then
 * protect the fragile ones — so watching the animation teaches the method.
 */
import type { PackResult, Placement, SpacePlan, StorageSpace } from "@/lib/spaceplanner/types";

import { modelKeyFor } from "./library";
import {
  sameTransform,
  transformFromPlacement,
  vec3,
  type MotionCaption,
  type MotionKind,
  type MotionPlan,
  type MotionStep,
  type TwinObject,
  type TwinTransform,
} from "./contracts";

const round2 = (value: number) => Math.round(value * 100) / 100;

const WEIGHT_ORDER = { heavy: 0, medium: 1, light: 2 } as const;

/** Turns one planner placement into a twin body. */
export function objectFromPlacement(placement: Placement, space: StorageSpace): TwinObject {
  const heightM = round2(Math.max(0.1, (space.height * 0.9) / 4));
  return {
    id: placement.key,
    itemId: placement.itemId,
    label: placement.label,
    modelKey: modelKeyFor(placement.itemId, placement.icon),
    icon: placement.icon,
    size: {
      widthM: placement.rotated ? placement.d : placement.w,
      depthM: placement.rotated ? placement.w : placement.d,
      heightM,
    },
    transform: transformFromPlacement(placement, heightM),
    units: placement.units,
    level: placement.level,
    weight: placement.weight,
    fragile: placement.fragile,
    fixed: false,
    zone: placement.zone,
  };
}

export function objectsFromPack(pack: PackResult, space: StorageSpace): TwinObject[] {
  return pack.placements.map((placement) => objectFromPlacement(placement, space));
}

/* ------------------------------------------------------------- reasoning */

function kindFor(from: TwinTransform, to: TwinTransform, placement: Placement): MotionKind {
  if (to.upright && !from.upright) return "stand_upright";
  if (to.rotationDeg !== from.rotationDeg) return "rotate";
  if (placement.level > 0) return "stack";
  if (to.position.y < from.position.y) return "settle";
  if (to.position.y > from.position.y) return "lift";
  return "slide";
}

function reasonFor(kind: MotionKind, placement: Placement, space: StorageSpace): string {
  switch (kind) {
    case "stand_upright":
      return `${placement.label} stores safely on its edge, which returns floor area to the walkway.`;
    case "rotate":
      return `Turning ${placement.label.toLowerCase()} a quarter-turn clears the ${space.doorWidth.toFixed(2)}m opening and shortens its footprint.`;
    case "stack":
      return `${placement.label} stacks at level ${placement.level + 1}, using the height rather than more floor.`;
    case "lift":
      return `${placement.label} moves up off the floor so heavier items keep the ground.`;
    case "settle":
      return `${placement.label} comes down to the floor — heavy items belong at the bottom of a stack.`;
    default:
      return placement.zone === "back"
        ? `${placement.label} moves to the back, where it is out of the way for the whole stay.`
        : placement.zone === "front"
          ? `${placement.label} stays near the opening because it is reached most often.`
          : `${placement.label} moves into the middle band, keeping the walkway clear.`;
  }
}

function evidenceFor(placement: Placement, space: StorageSpace, kind: MotionKind): string[] {
  const facts = [
    `Footprint about ${placement.w.toFixed(2)}m × ${placement.d.toFixed(2)}m.`,
    `Weight class: ${placement.weight}.`,
    `Placed in the ${placement.zone} of a ${space.width.toFixed(1)}m × ${space.depth.toFixed(1)}m space.`,
  ];
  if (kind === "rotate") facts.push(`Opening measured at ${space.doorWidth.toFixed(2)}m.`);
  if (kind === "stack") facts.push(`Stack level ${placement.level + 1}.`);
  if (placement.fragile) facts.push("Marked fragile, so nothing is stacked on top.");
  return facts;
}

function priority(placement: Placement): number {
  // Heavy first, then upright/rotations, then stacks, fragile last.
  const weight = WEIGHT_ORDER[placement.weight];
  const stack = placement.level;
  const fragile = placement.fragile ? 1 : 0;
  return weight * 100 + stack * 10 + fragile;
}

/* ------------------------------------------------------------------ plan */

export interface MotionPlanOptions {
  /** Milliseconds one movement takes. Reduced-motion surfaces pass a low value. */
  stepMs?: number;
  /** Gap between movements. */
  gapMs?: number;
  /** Cap on how many movements are animated; the rest apply instantly. */
  maxSteps?: number;
}

/**
 * Builds the animation from the real before→after difference.
 *
 * `plan.before` is the load as it arrives; `plan.after` is what EarnRoom AI
 * proposes. Every step below is one of those differences, and nothing else.
 */
export function buildMotionPlan(plan: SpacePlan, options: MotionPlanOptions = {}): MotionPlan {
  const { stepMs = 900, gapMs = 140, maxSteps = 14 } = options;
  const space = plan.space;
  const before = new Map(plan.before.placements.map((entry) => [entry.key, entry]));

  const moved = plan.after.placements
    .map((placement) => {
      const start = before.get(placement.key);
      const target = objectFromPlacement(placement, space);
      const from: TwinTransform = start
        ? transformFromPlacement(start, target.size.heightM)
        : {
            // Items with no "before" enter from just outside the opening.
            position: vec3(target.transform.position.x, 0, round2(space.depth + 0.8)),
            rotationDeg: 0,
            upright: false,
          };
      return { placement, target, from };
    })
    .filter((entry) => !sameTransform(entry.from, entry.target.transform))
    .sort((a, b) => priority(a.placement) - priority(b.placement))
    .slice(0, maxSteps);

  let elapsed = 0;
  const steps: MotionStep[] = moved.map((entry, index) => {
    const kind = kindFor(entry.from, entry.target.transform, entry.placement);
    const delayMs = index === 0 ? 0 : gapMs;
    elapsed += delayMs + stepMs;
    return {
      id: `step-${index}-${entry.placement.key}`,
      objectId: entry.placement.key,
      label: entry.placement.label,
      kind,
      from: entry.from,
      to: entry.target.transform,
      reason: reasonFor(kind, entry.placement, space),
      evidence: evidenceFor(entry.placement, space, kind),
      durationMs: stepMs,
      delayMs,
      confidence: entry.placement.fragile ? 0.78 : 0.86,
    };
  });

  return { steps, captions: buildCaptions(plan, steps), totalMs: elapsed };
}

/**
 * Milestone 7 — captions.
 *
 * Captions are cut from `plan.explanations`, which the planner produced from
 * the same pack. They are spread across the real steps, so the words on screen
 * always describe movements that are actually happening.
 */
export function buildCaptions(plan: SpacePlan, steps: MotionStep[]): MotionCaption[] {
  const lines = [
    `Reading ${plan.itemCount} item${plan.itemCount === 1 ? "" : "s"} against ${plan.space.width.toFixed(1)}m × ${plan.space.depth.toFixed(1)}m of floor…`,
    ...plan.explanations,
  ];
  if (steps.length === 0) {
    return lines.slice(0, 1).map((text, index) => ({
      id: `caption-${index}`,
      text,
      fromStep: 0,
      toStep: 0,
      confidence: 0.8,
    }));
  }

  const count = Math.min(lines.length, Math.max(2, Math.ceil(steps.length / 2)));
  const span = steps.length / count;
  return Array.from({ length: count }, (_, index) => ({
    id: `caption-${index}`,
    text: lines[index] ?? lines[lines.length - 1]!,
    fromStep: Math.floor(index * span),
    toStep: Math.max(Math.floor(index * span), Math.ceil((index + 1) * span) - 1),
    confidence: 0.84,
  }));
}

/** The caption covering a step index, or null when the plan has none. */
export function captionAt(plan: MotionPlan, stepIndex: number): MotionCaption | null {
  return (
    plan.captions.find(
      (caption) => stepIndex >= caption.fromStep && stepIndex <= caption.toStep,
    ) ?? null
  );
}
