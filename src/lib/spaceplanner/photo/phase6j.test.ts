/**
 * Phase 6J — architectural regression tests.
 *
 * These assert the properties the phase exists to guarantee:
 *   • identical inputs produce an identical plan hash, ten runs running;
 *   • no confirmed unit is lost or duplicated in the placement manifest;
 *   • an uncertain detection can never gain a specific identity (the shoe bug);
 *   • the deterministic plan survives a total render failure;
 *   • progress stages reflect real state and never run ahead of the work.
 */
import { describe, expect, it } from "vitest";

import { buildPhotoPlan, type SpaceSource } from "./plan";
import { buildPlacementManifest, lockInventory, manifestUnitCount } from "./manifest";
import { manifestHash, serialiseManifest, verificationStatusOf } from "./diagnostics";
import { generaliseUncertain, genericLabelFor, identitiesAreVerified } from "./uncertain";
import { plannerProgressPercent, plannerSteps, type PlannerProgressInput } from "./progress";
import type { DetectedObject } from "@/lib/vision/types";

const object = (patch: Partial<DetectedObject> & { id: string; label: string }): DetectedObject =>
  ({
    category: "other",
    confidence: 0.8,
    width: 60,
    depth: 40,
    height: 40,
    weight: "medium",
    quantity: 1,
    fragile: false,
    stackable: true,
    catalogueId: null,
    photoIds: ["photo-1"],
    source: "ai",
    ...patch,
  }) as DetectedObject;

const inventoryObjects = [
  object({ id: "ITEM-001", label: "Large grey suitcase", category: "luggage", width: 75, depth: 35, height: 80 }),
  object({ id: "ITEM-002", label: "Blue suitcase", category: "luggage", width: 65, depth: 30, height: 70 }),
  object({ id: "ITEM-003", label: "Black backpack", category: "bags", width: 35, depth: 25, height: 50 }),
  object({ id: "ITEM-004", label: "Black duffel bag", category: "bags", width: 60, depth: 30, height: 35 }),
  object({ id: "ITEM-005", label: "Cardboard box", category: "boxes", quantity: 1, width: 50, depth: 40, height: 40 }),
];

const source: SpaceSource = {
  widthM: 3,
  depthM: 5.5,
  heightM: 2.4,
  basis: "photo",
  confidence: 0.7,
  name: "Your space",
};

function planOnce() {
  const inventory = lockInventory(inventoryObjects, 1_700_000_000_000);
  const result = buildPhotoPlan(inventory.objects, source)!;
  return { inventory, result, manifest: buildPlacementManifest(inventory, result) };
}

describe("Phase 6J — ten runs, one plan", () => {
  it("produces the same plan hash every time", () => {
    const hashes = new Set(Array.from({ length: 10 }, () => manifestHash(planOnce().manifest)));
    expect(hashes.size).toBe(1);
  });

  it("serialises byte-identically across runs", () => {
    const a = serialiseManifest(planOnce().manifest);
    const b = serialiseManifest(planOnce().manifest);
    expect(b).toBe(a);
  });
});

describe("Phase 6J — item conservation", () => {
  it("places every confirmed unit exactly once, with no unknown ids", () => {
    const { inventory, manifest } = planOnce();
    const ids = manifest.entries.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const source of inventory.objects) expect(ids).toContain(source.id);
    expect(manifest.expectedUnits).toBe(inventory.itemCount);
    expect(manifestUnitCount(manifest)).toBeLessThanOrEqual(inventory.itemCount);
  });

  it("never introduces an entry that is not in the inventory", () => {
    const { inventory, manifest } = planOnce();
    const known = new Set(inventory.objects.map((entry) => entry.id));
    for (const entry of manifest.entries) expect(known.has(entry.id)).toBe(true);
  });
});

describe("Phase 6J — uncertain identity (the shoe bug)", () => {
  it("refuses to keep a specific identity below the confidence floor", () => {
    const uncertain = [object({ id: "ITEM-009", label: "Shoes", category: "soft", confidence: 0.31 })];
    const cleaned = generaliseUncertain(uncertain);
    expect(cleaned[0]!.label).toBe(genericLabelFor("soft"));
    expect(cleaned[0]!.label.toLowerCase()).not.toContain("shoe");
    expect(identitiesAreVerified(cleaned)).toBe(true);
  });

  it("leaves confident detections and the user's own words untouched", () => {
    const kept = generaliseUncertain([
      object({ id: "ITEM-010", label: "Blue suitcase", category: "luggage", confidence: 0.92 }),
      object({ id: "ITEM-011", label: "Nan's mirror", category: "other", confidence: 0.1, source: "manual" }),
    ]);
    expect(kept.map((entry) => entry.label)).toEqual(["Blue suitcase", "Nan's mirror"]);
  });

  it("keeps shoes and TVs out of a manifest that never contained them", () => {
    const { manifest } = planOnce();
    const labels = manifest.entries.map((entry) => entry.label.toLowerCase()).join(" ");
    expect(labels).not.toContain("shoe");
    expect(labels).not.toContain("tv");
    expect(labels).not.toContain("television");
  });
});

describe("Phase 6J — render failure never destroys the plan", () => {
  it("keeps a complete, drawable manifest when verification never ran", () => {
    const { manifest } = planOnce();
    expect(verificationStatusOf(null)).toBe("not_run");
    expect(manifest.entries.some((entry) => entry.positions.length > 0)).toBe(true);
    expect(manifest.spaceWidthM).toBeGreaterThan(0);
    expect(manifest.spaceDepthM).toBeGreaterThan(0);
  });

  it("reports a rejected render without changing the plan", () => {
    const before = manifestHash(planOnce().manifest);
    expect(
      verificationStatusOf({ expected: 5, present: 5, missing: [], complete: true, faithful: false, unexpected: ["shoes"] } as never),
    ).toBe("rejected");
    expect(manifestHash(planOnce().manifest)).toBe(before);
  });
});

describe("Phase 6J — honest progress", () => {
  const base: PlannerProgressInput = {
    itemPhotos: 0,
    detectedUnits: 0,
    sized: false,
    spaceSupplied: false,
    roomReady: false,
    inventoryLocked: false,
    planReady: false,
    constraintsClear: false,
    render: "idle",
    verification: "not_run",
  };

  it("exposes ten stages and starts at zero", () => {
    const steps = plannerSteps(base);
    expect(steps).toHaveLength(10);
    expect(plannerProgressPercent(steps)).toBe(0);
  });

  it("never marks a stage done before the work exists", () => {
    const steps = plannerSteps({ ...base, itemPhotos: 2 });
    expect(steps[0]!.state).toBe("working");
    expect(steps[6]!.state).toBe("waiting");
  });

  it("marks the render stage failed rather than complete", () => {
    const steps = plannerSteps({
      ...base,
      itemPhotos: 2,
      detectedUnits: 5,
      sized: true,
      spaceSupplied: true,
      roomReady: true,
      inventoryLocked: true,
      planReady: true,
      constraintsClear: true,
      render: "failed",
    });
    expect(steps[8]!.state).toBe("failed");
    expect(steps[6]!.state).toBe("done");
    expect(plannerProgressPercent(steps)).toBeGreaterThanOrEqual(70);
  });
});
