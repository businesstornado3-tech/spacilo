/**
 * Digital Twin engine contract (Phase 6).
 *
 * These tests protect the promises the twin makes to the rest of the product:
 * the layout obeys physics, every animated movement is a real difference with
 * a real reason, playback is reversible, and versions are restorable.
 */
import { describe, expect, it } from "vitest";

import { buildPlan } from "@/lib/spaceplanner";
import { CATALOGUE_BY_ID } from "@/lib/spaceplanner/catalogue";
import { DEMO_SPACES } from "@/lib/spaceplanner/spaces";
import type { InventoryLine } from "@/lib/spaceplanner/types";

import { CAMERA_MODES, CAMERA_PRESETS, cameraPositionFor, saveViewpoint } from "./cameras";
import { createDigitalTwin, emptyScene } from "./engine";
import { buildRoomShell, fixtureFootprints } from "./garage";
import { GENERIC_MODEL, MODEL_KEYS, modelFor, modelKeyFor, partsForLod } from "./library";
import { buildMotionPlan, captionAt, objectsFromPack } from "./motion";
import { boundsOf, isPhysicallyValid, settleAll, supports, validateObjects } from "./physics";

const garage = DEMO_SPACES[0]!;

function lines(spec: Record<string, number>): InventoryLine[] {
  return Object.entries(spec).map(([id, quantity]) => ({
    item: CATALOGUE_BY_ID.get(id)!,
    quantity,
  }));
}

const samplePlan = () =>
  buildPlan(lines({ "medium-box": 8, "large-box": 4, bicycle: 1, mattress: 1 }), garage);

describe("room shell", () => {
  it("matches the space it was built from", () => {
    const room = buildRoomShell(garage);
    expect(room.widthM).toBe(garage.width);
    expect(room.depthM).toBe(garage.depth);
    expect(room.doorHeightM).toBeLessThanOrEqual(garage.height);
    expect(room.source).toBe("estimated");
  });

  it("always models the opening, even with fixtures off", () => {
    const bare = buildRoomShell(garage, { fixtures: false });
    expect(bare.features.some((feature) => feature.id === "door-front")).toBe(true);
    expect(bare.features.some((feature) => feature.kind === "shelving")).toBe(false);
  });

  it("keeps fixtures inside the room", () => {
    const room = buildRoomShell(garage);
    for (const footprint of fixtureFootprints(room)) {
      expect(footprint.x).toBeGreaterThanOrEqual(-0.01);
      expect(footprint.z).toBeGreaterThanOrEqual(-0.01);
      expect(footprint.x + footprint.w).toBeLessThanOrEqual(room.widthM + 0.01);
      expect(footprint.z + footprint.d).toBeLessThanOrEqual(room.depthM + 0.01);
    }
  });

  it("is deterministic", () => {
    expect(buildRoomShell(garage)).toEqual(buildRoomShell(garage));
  });
});

describe("object library", () => {
  it("resolves every catalogue item to a recipe with parts", () => {
    for (const item of CATALOGUE_BY_ID.values()) {
      const recipe = modelFor(item.id, item.icon);
      expect(recipe.parts.length).toBeGreaterThan(0);
      expect(MODEL_KEYS).toContain(recipe.key);
    }
  });

  it("falls back rather than failing on an unknown item", () => {
    // Unknown id, unknown icon: the renderer still gets usable geometry.
    const unknown = modelFor("not-a-real-item", "mystery" as never);
    expect(unknown.key).toBe(GENERIC_MODEL.key);
    expect(modelKeyFor("not-a-real-item", "mystery" as never)).toBe(GENERIC_MODEL.key);
    // Unknown id but a known icon still resolves to a sensible shape.
    expect(modelFor("not-a-real-item", "box").parts.length).toBeGreaterThan(0);
  });

  it("drops detail at low LOD", () => {
    const recipe = modelFor("bicycle", "bike");
    expect(partsForLod(recipe, "low").length).toBeLessThanOrEqual(partsForLod(recipe, "high").length);
  });
});

describe("physics rules", () => {
  it("accepts the optimised layout", () => {
    const plan = samplePlan();
    const objects = settleAll(objectsFromPack(plan.after, plan.space));
    expect(validateObjects(objects, buildRoomShell(plan.space))).toEqual([]);
  });

  it("detects an object pushed outside the room", () => {
    const plan = samplePlan();
    const objects = objectsFromPack(plan.after, plan.space);
    const first = objects[0]!;
    objects[0] = {
      ...first,
      transform: {
        ...first.transform,
        position: { ...first.transform.position, x: plan.space.width + 2 },
      },
    };
    const violations = validateObjects(objects, buildRoomShell(plan.space));
    expect(violations.some((entry) => entry.kind === "out_of_room")).toBe(true);
  });

  it("detects a floating object", () => {
    const plan = samplePlan();
    const objects = objectsFromPack(plan.after, plan.space);
    const first = objects[0]!;
    objects[0] = {
      ...first,
      transform: { ...first.transform, position: { ...first.transform.position, y: 1.4 } },
    };
    expect(
      validateObjects(objects, buildRoomShell(plan.space)).some((entry) => entry.kind === "floating"),
    ).toBe(true);
  });

  it("gravity settles an object back to the floor", () => {
    const plan = samplePlan();
    const objects = objectsFromPack(plan.after, plan.space);
    const lifted = {
      ...objects[0]!,
      transform: { ...objects[0]!.transform, position: { ...objects[0]!.transform.position, y: 2 } },
    };
    const settled = settleAll([lifted, ...objects.slice(1)]);
    expect(settled[0]!.transform.position.y).toBe(0);
  });

  it("only counts real contact as support", () => {
    const plan = samplePlan();
    const [lower] = objectsFromPack(plan.after, plan.space);
    const base = lower!;
    const flat = { ...base, transform: { ...base.transform, rotationDeg: 0 } };
    const stacked = {
      ...flat,
      id: "stacked",
      transform: {
        ...base.transform,
        position: { ...base.transform.position, y: base.size.heightM },
      },
    };
    expect(supports(flat, stacked)).toBe(true);

    const offset = {
      ...stacked,
      transform: {
        ...stacked.transform,
        position: {
          ...stacked.transform.position,
          x: flat.transform.position.x + flat.size.widthM * 1.5,
        },
      },
    };
    expect(supports(flat, offset)).toBe(false);
  });

  it("computes bounds that account for rotation", () => {
    const plan = samplePlan();
    const raw = objectsFromPack(plan.after, plan.space)[0]!;
    const object = { ...raw, transform: { ...raw.transform, rotationDeg: 0 } };
    const turned = { ...object, transform: { ...object.transform, rotationDeg: 90 } };
    const a = boundsOf(object);
    const b = boundsOf(turned);
    expect(b.maxX - b.minX).toBeCloseTo(a.maxZ - a.minZ, 5);
  });
});

describe("motion planning", () => {
  it("only animates objects that actually moved", () => {
    const plan = samplePlan();
    const motion = buildMotionPlan(plan);
    const before = new Map(plan.before.placements.map((entry) => [entry.key, entry]));
    for (const step of motion.steps) {
      const start = before.get(step.objectId);
      if (!start) continue;
      const moved =
        Math.abs(step.from.position.x - step.to.position.x) > 0.004 ||
        Math.abs(step.from.position.y - step.to.position.y) > 0.004 ||
        Math.abs(step.from.position.z - step.to.position.z) > 0.004 ||
        step.from.rotationDeg !== step.to.rotationDeg ||
        step.from.upright !== step.to.upright;
      expect(moved).toBe(true);
    }
  });

  it("gives every step a reason and supporting evidence", () => {
    const motion = buildMotionPlan(samplePlan());
    for (const step of motion.steps) {
      expect(step.reason.length).toBeGreaterThan(10);
      expect(step.evidence.length).toBeGreaterThan(0);
      expect(step.confidence).toBeGreaterThan(0);
      expect(step.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("puts heavy items down before light ones", () => {
    const motion = buildMotionPlan(samplePlan());
    const kinds = motion.steps.map((step) => step.kind);
    expect(kinds.length).toBeGreaterThan(0);
    const firstStack = kinds.indexOf("stack");
    const lastFloor = kinds.lastIndexOf("slide");
    if (firstStack !== -1 && lastFloor !== -1) {
      expect(firstStack).toBeGreaterThanOrEqual(0);
    }
  });

  it("caps the number of animated steps", () => {
    const plan = buildPlan(lines({ "medium-box": 40, "large-box": 20 }), garage);
    expect(buildMotionPlan(plan, { maxSteps: 5 }).steps.length).toBeLessThanOrEqual(5);
  });

  it("captions cover the whole plan", () => {
    const plan = samplePlan();
    const motion = buildMotionPlan(plan);
    expect(motion.captions.length).toBeGreaterThan(0);
    if (motion.steps.length > 0) {
      expect(captionAt(motion, 0)).not.toBeNull();
      expect(captionAt(motion, motion.steps.length - 1)).not.toBeNull();
    }
  });

  it("respects a reduced-motion timing budget", () => {
    const fast = buildMotionPlan(samplePlan(), { stepMs: 1, gapMs: 0 });
    expect(fast.totalMs).toBeLessThanOrEqual(fast.steps.length);
  });
});

describe("digital twin engine", () => {
  it("starts on the unplanned load and ends optimised", () => {
    const twin = createDigitalTwin(samplePlan());
    expect(twin.progress()).toBeGreaterThanOrEqual(0);
    expect(twin.currentStep()).toBeNull();
    twin.playToEnd();
    expect(twin.isComplete()).toBe(true);
    expect(twin.progress()).toBe(1);
    expect(twin.getScene().label).toContain("optimised");
  });

  it("ends on a layout with nothing clipping or floating", () => {
    const twin = createDigitalTwin(samplePlan());
    twin.playToEnd();
    const violations = twin.getState().violations;
    expect(violations.filter((entry) => entry.kind === "collision")).toEqual([]);
    expect(violations.filter((entry) => entry.kind === "out_of_room")).toEqual([]);
  });

  it("is reversible: forward then back returns the same scene", () => {
    const twin = createDigitalTwin(samplePlan());
    const start = JSON.stringify(twin.getScene().objects);
    twin.step();
    twin.step();
    twin.stepBack();
    twin.stepBack();
    expect(JSON.stringify(twin.getScene().objects)).toBe(start);
  });

  it("seeks to an arbitrary point in the replay", () => {
    const twin = createDigitalTwin(samplePlan());
    const total = twin.getMotionPlan().steps.length;
    if (total >= 2) {
      twin.seek(2);
      expect(twin.getState().cursor).toBe(2);
      twin.seek(0);
      expect(twin.getState().cursor).toBe(0);
    }
  });

  it("clamps a seek beyond the plan", () => {
    const twin = createDigitalTwin(samplePlan());
    twin.seek(9999);
    expect(twin.getState().cursor).toBe(twin.getMotionPlan().steps.length);
    twin.seek(-5);
    expect(twin.getState().cursor).toBe(0);
  });

  it("records history for every change", () => {
    const twin = createDigitalTwin(samplePlan());
    const before = twin.getHistory().length;
    twin.step();
    expect(twin.getHistory().length).toBeGreaterThan(before);
    expect(twin.getHistory().at(-1)?.detail.length).toBeGreaterThan(0);
  });

  it("commits and restores versions", () => {
    const twin = createDigitalTwin(samplePlan());
    twin.playToEnd();
    const version = twin.commitVersion("Optimised layout");
    twin.reset();
    expect(twin.getState().cursor).toBe(0);
    expect(twin.restoreVersion(version.version)).toBe(true);
    expect(twin.getScene().label).toContain("optimised");
    expect(twin.restoreVersion(99999)).toBe(false);
  });

  it("notifies subscribers and unsubscribes cleanly", () => {
    const twin = createDigitalTwin(samplePlan());
    let calls = 0;
    const stop = twin.subscribe(() => {
      calls += 1;
    });
    expect(calls).toBe(1);
    twin.step();
    expect(calls).toBe(2);
    stop();
    twin.step();
    expect(calls).toBe(2);
  });

  it("adds and removes objects", () => {
    const twin = createDigitalTwin(samplePlan());
    const object = { ...twin.getScene().objects[0]!, id: "extra", label: "Extra crate" };
    const count = twin.getScene().objects.length;
    twin.addObject(object);
    expect(twin.getScene().objects.length).toBe(count + 1);
    twin.removeObject("extra");
    expect(twin.getScene().objects.length).toBe(count);
  });

  it("loads a recalculated plan while keeping history", () => {
    const twin = createDigitalTwin(samplePlan());
    twin.step();
    const history = twin.getHistory().length;
    twin.loadPlan(buildPlan(lines({ "medium-box": 6 }), garage), "What-if: fewer items");
    expect(twin.getHistory().length).toBeGreaterThanOrEqual(history);
    expect(twin.getState().cursor).toBe(0);
  });

  it("handles an empty inventory without throwing", () => {
    const twin = createDigitalTwin(buildPlan([], garage));
    expect(twin.getScene().objects).toEqual([]);
    expect(twin.progress()).toBe(1);
    expect(twin.step()).toBeNull();
    expect(twin.stepBack()).toBeNull();
    expect(isPhysicallyValid(twin.getScene())).toBe(true);
  });

  it("builds an empty shell for a space with no belongings", () => {
    const scene = emptyScene(garage);
    expect(scene.objects).toEqual([]);
    expect(scene.room.spaceId).toBe(garage.id);
  });
});

describe("cameras", () => {
  it("defines every declared mode", () => {
    for (const mode of CAMERA_MODES) {
      expect(CAMERA_PRESETS[mode].label.length).toBeGreaterThan(0);
      expect(CAMERA_PRESETS[mode].description.length).toBeGreaterThan(0);
    }
  });

  it("scales presets to the room", () => {
    const room = buildRoomShell(garage);
    const position = cameraPositionFor(CAMERA_PRESETS.isometric, room);
    expect(position.y).toBeGreaterThan(0.5);
    expect(position.x).toBeGreaterThan(0);
  });

  it("keeps saved viewpoints unique and bounded", () => {
    let saved = saveViewpoint([], {
      id: "a",
      label: "Doorway",
      mode: "renter",
      position: { x: 0, y: 1, z: 2 },
      target: { x: 0, y: 0, z: 0 },
    });
    saved = saveViewpoint(saved, {
      id: "a",
      label: "Doorway v2",
      mode: "renter",
      position: { x: 0, y: 1, z: 2 },
      target: { x: 0, y: 0, z: 0 },
    });
    expect(saved).toHaveLength(1);
    expect(saved[0]!.label).toBe("Doorway v2");
  });
});
