/**
 * Phase 6 Part 2 — the cinematic director's contract.
 *
 * These assertions exist so the story can never drift from the plan: every
 * beat has to land on a real engine cursor, the observation beats have to
 * happen before anything moves, and the score has to start low and finish at
 * the planner's real reading.
 */
import { describe, expect, it } from "vitest";

import { buildPlan } from "@/lib/spaceplanner";
import { CATALOGUE_BY_ID } from "@/lib/spaceplanner/catalogue";
import { SPACE_BY_ID } from "@/lib/spaceplanner/spaces";
import type { InventoryLine } from "@/lib/spaceplanner/types";
import { buildMotionPlan } from "@/lib/twin/motion";
import {
  beatAt,
  buildExperience,
  floorGainPercent,
  freeFloorPercent,
  liveMetrics,
} from "@/lib/twin/experience";

const garage = SPACE_BY_ID.get("garage")!;

const lines = (spec: Record<string, number>): InventoryLine[] =>
  Object.entries(spec).map(([itemId, quantity]) => ({
    item: CATALOGUE_BY_ID.get(itemId)!,
    quantity,
  }));

const demo = () =>
  buildPlan(
    lines({ "large-box": 6, "medium-box": 4, bicycle: 1, mattress: 1, television: 1, suitcase: 2 }),
    garage,
  );

describe("experience beats", () => {
  const plan = demo();
  const motion = buildMotionPlan(plan);
  const experience = buildExperience(plan, motion);

  it("opens on the room, then observes before anything moves", () => {
    const kinds = experience.beats.map((beat) => beat.kind);
    expect(kinds.slice(0, 5)).toEqual(["load", "analyse", "space", "access", "group"]);
    const firstMove = kinds.indexOf("move");
    expect(firstMove === -1 || firstMove >= 5).toBe(true);
  });

  it("gives every real movement exactly one beat", () => {
    const moves = experience.beats.filter((beat) => beat.kind === "move");
    expect(moves).toHaveLength(motion.steps.length);
    moves.forEach((beat, index) => {
      expect(beat.cursor).toBe(index + 1);
      expect(beat.detail).toBe(motion.steps[index]!.reason);
    });
  });

  it("ends on the outcome, at the end of the plan", () => {
    const last = experience.beats[experience.beats.length - 1]!;
    expect(last.kind).toBe("final");
    expect(last.cursor).toBe(motion.steps.length);
  });

  it("keeps the observation beats parked at cursor zero", () => {
    experience.beats
      .filter((beat) => beat.kind !== "move" && beat.kind !== "final")
      .forEach((beat) => expect(beat.cursor).toBe(0));
  });

  it("lays beats out on a continuous, gap-free timeline", () => {
    let at = 0;
    for (const beat of experience.beats) {
      expect(beat.startMs).toBe(at);
      expect(beat.durationMs).toBeGreaterThan(0);
      at += beat.durationMs;
    }
    expect(experience.totalMs).toBe(at);
    expect(experience.loopMs).toBe(at + experience.holdMs);
  });

  it("highlights the object each movement beat is about", () => {
    experience.beats
      .filter((beat) => beat.kind === "move")
      .forEach((beat) => expect(beat.highlightIds).toHaveLength(1));
  });

  it("flags the access beat so the doorway can be lit", () => {
    const access = experience.beats.filter((beat) => beat.highlightAccess);
    expect(access).toHaveLength(1);
    expect(access[0]!.kind).toBe("access");
  });
});

describe("beatAt", () => {
  const plan = demo();
  const experience = buildExperience(plan, buildMotionPlan(plan));

  it("returns the opening beat at time zero", () => {
    expect(beatAt(experience, 0).kind).toBe("load");
  });

  it("resolves a mid-timeline moment to the beat containing it", () => {
    const target = experience.beats[3]!;
    expect(beatAt(experience, target.startMs + target.durationMs / 2).id).toBe(target.id);
  });

  it("holds the final beat past the end of the timeline", () => {
    expect(beatAt(experience, experience.totalMs + 5_000).kind).toBe("final");
  });
});

describe("live score", () => {
  const plan = demo();

  it("starts below the optimised reading and lands exactly on it", () => {
    const start = liveMetrics(plan, 0);
    const end = liveMetrics(plan, 1);
    const fitStart = start.find((m) => m.key === "compatibility")!;
    const fitEnd = end.find((m) => m.key === "compatibility")!;
    expect(fitStart.value).toBeLessThan(fitEnd.value);
    expect(fitEnd.value).toBe(plan.metrics.compatibility);
  });

  it("never leaves the 0–100 range at any point in the replay", () => {
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      for (const metric of liveMetrics(plan, t)) {
        expect(metric.value).toBeGreaterThanOrEqual(0);
        expect(metric.value).toBeLessThanOrEqual(100);
      }
    }
  });

  it("reports free floor from the real packs", () => {
    expect(freeFloorPercent(plan, "after")).toBeGreaterThanOrEqual(
      freeFloorPercent(plan, "before"),
    );
    expect(floorGainPercent(plan)).toBeGreaterThanOrEqual(0);
  });
});
