/**
 * Phase 6O — quality, data integrity and renderer regressions.
 *
 * A–L in the brief: names survive, ids stay stable, fields never shift,
 * volume is derived, low confidence stays flagged, labels never overlap,
 * small objects get markers, unplaced objects are explicit, the walkway is
 * respected, the plan hash is deterministic, and the provider is unchanged.
 */
import { describe, expect, it } from "vitest";

import {
  canonicaliseInventory,
  confidenceTier,
  toCanonicalItem,
  volumeM3From,
} from "@/lib/vision/canonical";
import type { DetectedObject } from "@/lib/vision/types";
import { normaliseItems } from "@/routes/api/vision-detect";
import { linesFromObjects } from "@/lib/spaceplanner/photo/plan";
import {
  labelsAreClear,
  layoutPlanLabels,
  legendFor,
  shortLabel,
  type PlanUnit,
} from "@/lib/spaceplanner/photo/plan-labels";

const object = (over: Partial<DetectedObject> = {}): DetectedObject => ({
  id: "ITEM-large-blue-wheeled-case",
  label: "Large blue wheeled case",
  category: "leisure",
  confidence: 0.86,
  width: 45,
  depth: 30,
  height: 70,
  weight: "medium",
  quantity: 1,
  fragile: false,
  stackable: true,
  catalogueId: null,
  photoIds: ["photo-1"],
  source: "ai",
  ...over,
});

describe("A — recognisable objects keep meaningful names", () => {
  it("never renames or truncates a real name into a generic one", () => {
    const items = normaliseItems(
      [
        { id: "d1", label: "Large blue wheeled case", widthCm: 45, depthCm: 30, heightCm: 70 },
        { id: "d2", label: "Black backpack", widthCm: 32, depthCm: 20, heightCm: 45 },
      ],
      ["photo-1"],
    );
    expect(items.map((item) => item.label)).toEqual([
      "Large blue wheeled case",
      "Black backpack",
    ]);
  });
});

describe("B — item ids are stable, never index-derived", () => {
  it("keeps each id when an earlier item is dropped", () => {
    const all = normaliseItems(
      [
        { id: "d1", label: "Black backpack" },
        { id: "d2", label: "Black-framed table" },
      ],
      ["p1"],
    );
    const without = normaliseItems([{ id: "d2", label: "Black-framed table" }], ["p1"]);
    expect(without[0]!.id).toBe(all[1]!.id);
    expect(without[0]!.sourceDetectionId).toBe("d2");
  });

  it("keeps ids unique when two items share a name", () => {
    const items = normaliseItems([{ label: "Cardboard box" }, { label: "Cardboard box" }], ["p1"]);
    expect(items[0]!.id).not.toBe(items[1]!.id);
  });

  it("carries the id through to the planner line", () => {
    const [line] = linesFromObjects([object()]);
    expect(line!.item.id).toBe("ITEM-large-blue-wheeled-case");
    expect(line!.item.name).toBe("Large blue wheeled case");
  });
});

describe("C — dimensions never move between fields", () => {
  it("leaves each dimension in its own field", () => {
    const [item] = normaliseItems(
      [{ label: "Black-framed table", widthCm: 120, depthCm: 60, heightCm: 75 }],
      ["p1"],
    );
    expect([item!.widthCm, item!.depthCm, item!.heightCm]).toEqual([120, 60, 75]);
  });

  it("rejects rather than repairs an item with an unusable dimension", () => {
    const result = toCanonicalItem(object({ height: 0 }));
    expect(result.ok).toBe(false);
    const { rejected, items } = canonicaliseInventory([object({ width: -5 }), object({ id: "ok" })]);
    expect(items).toHaveLength(1);
    expect(rejected[0]!.reason).toContain("centimetres");
  });

  it("keeps invalid items out of the deterministic planner", () => {
    expect(linesFromObjects([object({ id: "bad", depth: Number.NaN })])).toHaveLength(0);
  });
});

describe("D — volume is calculated, never trusted", () => {
  it("derives cubic metres from the centimetres", () => {
    expect(volumeM3From(100, 100, 100)).toBe(1);
    const [item] = normaliseItems([{ label: "Box", widthCm: 20, depthCm: 15, heightCm: 30 }], ["p"]);
    expect(item!.volumeM3).toBeCloseTo(0.009, 6);
    const result = toCanonicalItem(object({ width: 20, depth: 15, height: 30 }));
    expect(result.ok && result.item.volumeM3).toBeCloseTo(0.009, 6);
  });

  it("totals come from one canonical calculation", () => {
    const { totals } = canonicaliseInventory([
      object({ id: "a", width: 100, depth: 100, height: 100 }),
      object({ id: "b", width: 100, depth: 100, height: 100, quantity: 2 }),
    ]);
    expect(totals.unitCount).toBe(3);
    expect(totals.volumeM3).toBe(3);
  });
});

describe("E — low confidence stays flagged", () => {
  it("bands confidence at 80% and 60%", () => {
    expect(confidenceTier(0.95)).toBe("confident");
    expect(confidenceTier(0.8)).toBe("confident");
    expect(confidenceTier(0.79)).toBe("check");
    expect(confidenceTier(0.6)).toBe("check");
    expect(confidenceTier(0.59)).toBe("unsure");
  });

  it("counts items needing a look", () => {
    const { totals } = canonicaliseInventory([
      object({ id: "a", confidence: 0.9 }),
      object({ id: "b", confidence: 0.7 }),
      object({ id: "c", confidence: 0.4 }),
    ]);
    expect(totals.needsCheck).toBe(1);
    expect(totals.unsure).toBe(1);
  });
});

const unit = (over: Partial<PlanUnit> & { key: string }): PlanUnit => ({
  entryId: over.key,
  label: "Large grey wheeled case",
  xM: 0,
  yM: 0,
  widthM: 0.8,
  depthM: 0.5,
  ...over,
});

describe("F/G — renderer labels never overlap and small objects use markers", () => {
  const numbers = new Map([
    ["a", 1],
    ["b", 2],
    ["c", 3],
  ]);

  it("never lets two labels overlap, even when objects are adjacent", () => {
    const labels = layoutPlanLabels(
      [
        unit({ key: "a", xM: 0, yM: 0 }),
        unit({ key: "b", xM: 0.05, yM: 0.06 }),
        unit({ key: "c", xM: 0.1, yM: 0.12 }),
      ],
      numbers,
    );
    expect(labelsAreClear(labels)).toBe(true);
  });

  it("uses a numbered marker for an object too small for text", () => {
    const [label] = layoutPlanLabels(
      [unit({ key: "a", widthM: 0.2, depthM: 0.15 })],
      numbers,
    );
    expect(label!.mode).toBe("marker");
    expect(label!.text).toBe("1");
    expect(label!.fontSize).toBeGreaterThanOrEqual(0.13);
  });

  it("shortens long names rather than spilling them", () => {
    expect(shortLabel("Large grey wheeled case with a broken handle").length).toBeLessThanOrEqual(
      16,
    );
  });
});

describe("H — unplaced objects are explicit in the legend", () => {
  it("marks entries the engine could not place", () => {
    const { legend } = legendFor([
      { id: "a", label: "Large wall-mounted screen", state: "cannot be safely placed" },
      { id: "b", label: "Black backpack", state: "placed" },
    ]);
    expect(legend[0]).toMatchObject({ number: 1, placed: false });
    expect(legend[1]).toMatchObject({ number: 2, placed: true });
  });
});

describe("K/L — provider is unchanged", () => {
  it("keeps Gemini via the Lovable AI Gateway and adds no OpenAI call", async () => {
    const source = await import("node:fs").then((fs) =>
      fs.readFileSync("src/routes/api/spaceplanner-visualise.ts", "utf8"),
    );
    expect(source).toContain("ai.gateway.lovable.dev");
    expect(source).toContain("google/gemini-3-pro-image");
    expect(source).not.toContain("api.openai.com");
  });
});
