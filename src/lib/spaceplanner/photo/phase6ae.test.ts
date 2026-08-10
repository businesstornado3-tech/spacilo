/**
 * Phase 6AE regression tests — preview fidelity and honest waiting.
 *
 * The live failure: a TV appeared in the photographic preview with no stand
 * beneath it. The cause was not the model. It was the shape of the whitelist we
 * handed it — a flat PER-UNIT list, truncated at 20, so twelve cardboard boxes
 * literally pushed the stand off the end. Nothing reported it.
 *
 * These tests hold three lines:
 *   1. Every manifest object reaches the renderer, or is excluded for a NAMED
 *      reason. Structural objects are never the ones dropped.
 *   2. Quantity is expanded breadth-first, so a high-quantity item can never
 *      starve a distinct object of its slot.
 *   3. A preview that is still running is never described as abandoned.
 */
import { describe, expect, it } from "vitest";

import {
  buildRenderProjection,
  exclusionReasonLabel,
  projectionUnits,
  requiredObjectsBlock,
  retryFocusFor,
  structuralBaseIds,
} from "./render-projection";
import type { PlacementManifest } from "./manifest";
import {
  formatElapsed,
  previewProgressMessage,
} from "@/components/spaceplanner/photo/PhotoArrangement";

type Entry = PlacementManifest["entries"][number];

function entry(overrides: Partial<Entry> & { id: string; label: string }): Entry {
  const base = {
    quantity: 1,
    widthCm: 40,
    depthCm: 40,
    heightCm: 40,
    state: "placed",
    orientation: "upright",
    placement: "against the left wall",
    positions: [
      {
        xM: 0.1,
        yM: 0.1,
        baseHeightM: 0,
        widthM: 0.4,
        depthM: 0.4,
        heightM: 0.4,
        units: 1,
        layer: 0,
        rotationDeg: 0,
        orientation: "upright",
        zone: "wall",
        supportSurfaceId: null,
        supportType: "floor",
      },
    ],
  } as unknown as Entry;
  return { ...base, ...overrides } as Entry;
}

function manifestOf(entries: Entry[]): PlacementManifest {
  return {
    inventoryId: "inv-1",
    planHash: "plan-1",
    spaceWidthM: 3,
    spaceDepthM: 4,
    spaceHeightM: 2.4,
    walkway: null,
    roomFeatures: [],
    entries,
  } as unknown as PlacementManifest;
}

/** The exact live shape: a TV on a stand, behind twelve boxes. */
function tvOnStandManifest(): PlacementManifest {
  const stand = entry({ id: "obj_stand", label: "TV stand", widthCm: 120, depthCm: 40, heightCm: 45 });
  const tv = entry({
    id: "obj_tv",
    label: "television",
    widthCm: 110,
    depthCm: 10,
    heightCm: 65,
    positions: [
      {
        ...stand.positions[0]!,
        baseHeightM: 0.45,
        supportSurfaceId: "obj_stand",
        supportType: "surface",
      },
    ],
  });
  const boxes = entry({ id: "obj_boxes", label: "cardboard box", quantity: 12 });
  return manifestOf([boxes, tv, stand]);
}

describe("Phase 6AE — every manifest object reaches the renderer", () => {
  it("projects one row per object, not one per unit", () => {
    const projection = buildRenderProjection(tvOnStandManifest());
    expect(projection.objects).toHaveLength(3);
    expect(projection.objects.find((object) => object.label === "cardboard box")?.quantity).toBe(12);
  });

  it("keeps the TV stand that the old per-unit whitelist dropped", () => {
    const projection = buildRenderProjection(tvOnStandManifest());
    expect(projection.objects.map((object) => object.label)).toContain("TV stand");
    expect(projection.excluded).toHaveLength(0);
  });

  it("marks an object that carries another as structural", () => {
    const manifest = tvOnStandManifest();
    expect(structuralBaseIds(manifest).has("obj_stand")).toBe(true);
    const projection = buildRenderProjection(manifest);
    expect(projection.objects.find((object) => object.id === "obj_stand")?.structural).toBe(true);
    expect(projection.objects.find((object) => object.id === "obj_tv")?.structural).toBe(false);
  });

  it("tells the renderer what the television is standing on", () => {
    const projection = buildRenderProjection(tvOnStandManifest());
    const tv = projection.objects.find((object) => object.id === "obj_tv");
    expect(tv?.supportBaseLabel).toBe("TV stand");
  });
});

describe("Phase 6AE — no silent exclusion", () => {
  it("names the reason an unplaceable object was left out", () => {
    const projection = buildRenderProjection(
      manifestOf([
        entry({ id: "obj_1", label: "wardrobe", state: "cannot be safely placed" as Entry["state"] }),
      ]),
    );
    expect(projection.objects).toHaveLength(0);
    expect(projection.excluded[0]).toMatchObject({ label: "wardrobe", reason: "not_placeable" });
    expect(exclusionReasonLabel("not_placeable")).toContain("could not fit");
  });

  it("never drops a structural object to satisfy the capacity cap", () => {
    const filler = Array.from({ length: 40 }, (_, index) =>
      entry({ id: `obj_f${index}`, label: `crate ${index}` }),
    );
    const manifest = manifestOf([...filler, ...tvOnStandManifest().entries]);
    const projection = buildRenderProjection(manifest, { maxObjects: 5 });
    const kept = projection.objects.map((object) => object.label);
    expect(kept).toContain("TV stand");
    expect(kept).toContain("television");
    // And every drop is accounted for — nothing simply disappears.
    expect(projection.objects.length + projection.excluded.length).toBe(manifest.entries.length);
    expect(projection.excluded.every((exclusion) => exclusion.reason === "capacity_limit")).toBe(true);
  });
});

describe("Phase 6AE — the prompt states the structural pair", () => {
  it("writes one required line per object with size and support", () => {
    const block = requiredObjectsBlock(buildRenderProjection(tvOnStandManifest()));
    expect(block).toContain("12 × cardboard box");
    expect(block).toContain("standing on the TV stand");
    expect(block).toContain("STRUCTURAL");
  });

  it("says nothing at all when there is nothing to render", () => {
    expect(requiredObjectsBlock({ objects: [], excluded: [] })).toBe("");
  });
});

describe("Phase 6AE — quantity never starves a distinct object", () => {
  it("gives every object its first unit before any object gets a second", () => {
    const units = projectionUnits(buildRenderProjection(tvOnStandManifest()), 20);
    const firstThree = units.slice(0, 3).map((unit) => unit.label);
    expect(new Set(firstThree).size).toBe(3);
    expect(firstThree).toContain("TV stand");
  });

  it("still expands the full legitimate quantity when there is room", () => {
    const units = projectionUnits(buildRenderProjection(tvOnStandManifest()), 40);
    expect(units.filter((unit) => unit.label === "cardboard box")).toHaveLength(12);
    expect(units).toHaveLength(14);
  });

  it("keeps the stand present even under a tight unit cap", () => {
    const units = projectionUnits(buildRenderProjection(tvOnStandManifest()), 4);
    expect(units.map((unit) => unit.label)).toContain("TV stand");
  });
});

describe("Phase 6AE — a corrective pass is told what actually broke", () => {
  it("explains that a missing structural base carries other objects", () => {
    const focus = retryFocusFor(buildRenderProjection(tvOnStandManifest()), ["TV stand"]);
    expect(focus[0]).toContain("beneath the objects resting on it");
  });

  it("names the base an object should be resting on", () => {
    const focus = retryFocusFor(buildRenderProjection(tvOnStandManifest()), ["television"]);
    expect(focus[0]).toContain("resting on top of the TV stand");
  });

  it("asks for nothing when nothing is missing", () => {
    expect(retryFocusFor(buildRenderProjection(tvOnStandManifest()), [])).toEqual([]);
  });
});

describe("Phase 6AE — waiting is described honestly", () => {
  it("shows a real elapsed clock rather than an estimate", () => {
    expect(formatElapsed(0)).toBe("00:00");
    expect(formatElapsed(9_400)).toBe("00:09");
    expect(formatElapsed(75_000)).toBe("01:15");
  });

  it("still says the work is happening once it runs long", () => {
    expect(previewProgressMessage(3_000)).toContain("Creating your photographic preview");
    const long = previewProgressMessage(45_000);
    expect(long).toContain("Still creating");
    // The one thing it must never say while the request is alive.
    expect(long.toLowerCase()).not.toContain("stopped waiting");
  });
});
