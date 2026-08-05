/**
 * Raw model class → SpaceFit taxonomy.
 *
 * One mapping layer, no class names in components, and no forcing an unknown
 * class into an incorrect SpaceFit category.
 */
import { describe, expect, it } from "vitest";

import { CATALOGUE } from "@/lib/inventory-catalogue";
import { CATEGORY_LABELS } from "@/lib/inventory-model";
import {
  LIVE_CLASS_TAXONOMY,
  isLiveClassRelevant,
  liveDetectionLabel,
  mapLiveClass,
} from "@/lib/livescan/taxonomy";

describe("live taxonomy", () => {
  it("maps a bicycle onto the bicycles category", () => {
    expect(mapLiveClass("bicycle")).toMatchObject({
      label: "Bicycle",
      category: "bicycles",
      catalogueKey: "bicycle",
    });
  });

  it("maps a suitcase onto bags", () => {
    expect(mapLiveClass("suitcase")?.category).toBe("bags");
  });

  it("is case and whitespace insensitive", () => {
    expect(mapLiveClass("  Dining Table ")?.category).toBe("furniture");
  });

  it("returns null for an unknown class", () => {
    expect(mapLiveClass("giraffe")).toBeNull();
    expect(isLiveClassRelevant("giraffe")).toBe(false);
  });

  it("ignores classes that are never stored", () => {
    expect(mapLiveClass("person")).toBeNull();
    expect(mapLiveClass("cell phone")).toBeNull();
  });

  it("only uses categories the inventory model knows", () => {
    for (const entry of Object.values(LIVE_CLASS_TAXONOMY)) {
      expect(Object.keys(CATEGORY_LABELS)).toContain(entry.category);
    }
  });

  it("only references catalogue keys that exist", () => {
    const keys = new Set(CATALOGUE.map((item) => item.key));
    for (const entry of Object.values(LIVE_CLASS_TAXONOMY)) {
      if (entry.catalogueKey) expect(keys.has(entry.catalogueKey)).toBe(true);
    }
  });

  it("hedges the label until a detection is confirmed", () => {
    expect(liveDetectionLabel("Bicycle", false)).toBe("Possible bicycle");
    expect(liveDetectionLabel("Bicycle", true)).toBe("Bicycle");
  });
});
