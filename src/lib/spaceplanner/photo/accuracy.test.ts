/**
 * Root-cause accuracy guarantees.
 *
 * These tests exist to stop the failure the user reported: an inventory that
 * did not come from their photographs.
 */
import { describe, expect, it } from "vitest";

import { normaliseItems, parseJsonObject } from "@/routes/api/vision-detect";
import { toDetectedObject } from "@/lib/vision/ai-provider";
import { linesFromObjects, oversizeItems, toStorageSpace } from "@/lib/spaceplanner/photo/plan";
import type { DetectedObject } from "@/lib/vision/types";

const object = (patch: Partial<DetectedObject> = {}): DetectedObject => ({
  id: "ITEM-001",
  label: "Fabric storage bag",
  category: "boxes",
  confidence: 0.8,
  width: 60,
  depth: 40,
  height: 45,
  weight: "light",
  quantity: 2,
  fragile: false,
  stackable: true,
  catalogueId: null,
  photoIds: ["photo-1"],
  source: "ai",
  ...patch,
});

describe("detection payload", () => {
  it("reads JSON out of a fenced reply", () => {
    expect(parseJsonObject('```json\n{"items":[]}\n```')).toEqual({ items: [] });
  });

  it("drops entries with no label rather than inventing one", () => {
    const items = normaliseItems([{ quantity: 3 }, { label: "Chest of drawers" }], ["photo-1"]);
    expect(items).toHaveLength(1);
    expect(items[0]!.label).toBe("Chest of drawers");
  });

  it("gives every item a stable identity and keeps its photo evidence", () => {
    const items = normaliseItems(
      [
        { label: "Fabric storage bag", quantity: 2, photoIds: ["photo-1", "nope"] },
        { label: "Three-drawer unit", quantity: 1, photoIds: ["photo-2"] },
      ],
      ["photo-1", "photo-2"],
    );
    // Phase 6O: identity comes from the item itself, not its array position.
    expect(items.map((item) => item.id)).toEqual([
      "ITEM-fabric-storage-bag",
      "ITEM-three-drawer-unit",
    ]);
    expect(items[0]!.photoIds).toEqual(["photo-1"]);
  });

  it("never returns items when the model returned none", () => {
    expect(normaliseItems(undefined, ["photo-1"])).toEqual([]);
  });
});

describe("identity through the pipeline", () => {
  it("keeps the detected label and size instead of a catalogue lookalike", () => {
    const detected = toDetectedObject({
      id: "ITEM-001",
      label: "Fabric storage bag",
      category: "boxes",
      quantity: 2,
      widthCm: 60,
      depthCm: 40,
      heightCm: 45,
      weight: "light",
      fragile: false,
      stackable: true,
      confidence: 0.72,
      photoIds: ["photo-1"],
    });
    expect(detected.catalogueId).toBeNull();

    const [line] = linesFromObjects([detected]);
    expect(line!.item.id).toBe("ITEM-001");
    expect(line!.item.name).toBe("Fabric storage bag");
    expect(line!.item.width).toBe(60);
    expect(line!.quantity).toBe(2);
  });

  it("does not collapse distinct items into boxes", () => {
    const lines = linesFromObjects([
      object(),
      object({ id: "ITEM-002", label: "Three-drawer plastic unit", quantity: 1 }),
    ]);
    expect(lines.map((line) => line.item.name)).toEqual([
      "Fabric storage bag",
      "Three-drawer plastic unit",
    ]);
  });
});

describe("spatial feasibility", () => {
  const space = toStorageSpace({ widthM: 2.4, depthM: 3, heightM: 2.2, basis: "photo" });

  it("flags an item taller than the room", () => {
    const lines = linesFromObjects([object({ label: "Tall shelving unit", height: 240 })]);
    expect(oversizeItems(lines, space)).toEqual(["Tall shelving unit"]);
  });

  it("accepts an item that fits", () => {
    expect(oversizeItems(linesFromObjects([object()]), space)).toEqual([]);
  });
});
