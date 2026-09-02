import { describe, expect, it } from "vitest";

import { CATALOGUE_BY_ID } from "@/lib/spaceplanner/catalogue";
import { buildPlan } from "@/lib/spaceplanner";
import { earnroomScore } from "@/lib/spaceplanner/score";
import { SPACE_BY_ID } from "@/lib/spaceplanner/spaces";
import {
  applySuggestions,
  buildBookingConfidence,
  buildSuggestions,
  compareInventories,
  ctaFor,
  toneForScore,
} from "@/lib/spaceplanner/booking-confidence";
import { listingConstraints, listingStorageSpace } from "@/lib/spaceplanner/listing";
import type { InventoryLine } from "@/lib/spaceplanner";

const garage = SPACE_BY_ID.get("garage")!;
const loft = SPACE_BY_ID.get("loft")!;

const line = (id: string, quantity: number): InventoryLine => ({
  item: CATALOGUE_BY_ID.get(id)!,
  quantity,
});

/** A few catalogue ids that definitely exist, whatever the catalogue holds. */
const ids = [...CATALOGUE_BY_ID.keys()];
const small: InventoryLine[] = [line(ids[0]!, 2)];
const heavy: InventoryLine[] = ids.slice(0, 6).map((id) => line(id, 6));

describe("listing geometry", () => {
  it("uses published dimensions when the host gave them", () => {
    const result = listingStorageSpace({
      id: "s1",
      title: "Dry lock-up",
      space_type: "garage",
      width_m: 3,
      length_m: 6,
      height_m: 2.4,
      door_width_cm: 220,
    });
    expect(result?.space.width).toBe(3);
    expect(result?.space.depth).toBe(6);
    expect(result?.space.doorWidth).toBe(2.2);
    expect(result?.derivedFootprint).toBe(false);
    expect(result?.space.kind).toBe("garage");
  });

  it("derives a cautious footprint from floor area", () => {
    const result = listingStorageSpace({ space_type: "loft", floor_area_m2: 9 });
    expect(result?.derivedFootprint).toBe(true);
    expect(result?.space.width).toBeCloseTo(3, 1);
    expect(result?.derivedHeight).toBe(true);
  });

  it("returns null when a listing has no size information", () => {
    expect(listingStorageSpace({ space_type: "shed" })).toBeNull();
  });

  it("surfaces access restrictions and host rules", () => {
    const row = {
      space_type: "spare_room",
      width_m: 3,
      length_m: 3,
      height_m: 2.4,
      door_width_cm: 80,
      stairs_required: true,
      host_restrictions: ["no_hazardous_items"],
    };
    const labels = listingConstraints(row, listingStorageSpace(row)).map((c) => c.value);
    expect(labels).toContain("Stairs on the route in");
    expect(labels).toContain("No hazardous items");
  });
});

describe("booking confidence", () => {
  it("renders every required row", () => {
    const plan = buildPlan(small, garage);
    const confidence = buildBookingConfidence(plan, earnroomScore(plan));
    const rowIds = confidence.rows.map((row) => row.id);
    expect(rowIds).toEqual([
      "compatibility",
      "fit",
      "door",
      "walkway",
      "ceiling",
      "weight",
      "complexity",
      "free",
      "recommendation",
    ]);
    expect(confidence.rows.every((row) => ["green", "amber", "red"].includes(row.tone))).toBe(true);
  });

  it("maps score bands to the three booking CTAs", () => {
    expect(toneForScore(90)).toBe("green");
    expect(toneForScore(60)).toBe("amber");
    expect(toneForScore(20)).toBe("red");
    const plan = buildPlan(small, garage);
    const score = earnroomScore(plan);
    expect(["book", "review", "browse"]).toContain(ctaFor(score).intent);
    expect(ctaFor({ ...score, value: 95 }).label).toBe("Book this space");
    expect(ctaFor({ ...score, value: 60 }).label).toBe("Review packing suggestions");
    expect(ctaFor({ ...score, value: 10 }).label).toBe("Browse larger spaces");
  });
});

describe("suggestions", () => {
  it("only suggests changes for checks that are not passing", () => {
    const plan = buildPlan(heavy, loft);
    const score = earnroomScore(plan);
    const suggestions = buildSuggestions(plan, score);
    for (const suggestion of suggestions) {
      if (suggestion.kind !== "technique" || !suggestion.resolves) continue;
      const check = score.checks.find((c) => c.id === suggestion.resolves);
      expect(check?.state).not.toBe("passed");
    }
  });

  it("applying a technique never lowers the score", () => {
    const plan = buildPlan(heavy, loft);
    const score = earnroomScore(plan);
    const suggestions = buildSuggestions(plan, score).filter((s) => s.kind === "technique");
    if (!suggestions.length) return;
    const adjusted = applySuggestions(
      heavy,
      loft,
      suggestions,
      suggestions.map((s) => s.id),
    );
    expect(adjusted.score!.value).toBeGreaterThanOrEqual(score.value);
    expect(adjusted.delta).toBeGreaterThanOrEqual(0);
  });

  it("removing an item re-runs the engine with fewer lines", () => {
    const plan = buildPlan(heavy, loft);
    const suggestions = buildSuggestions(plan, earnroomScore(plan));
    const remove = suggestions.find((s) => s.kind === "remove");
    if (!remove) return;
    const adjusted = applySuggestions(heavy, loft, suggestions, [remove.id]);
    expect(adjusted.plan!.lines.length).toBe(heavy.length - 1);
  });

  it("is deterministic", () => {
    const a = applySuggestions(heavy, garage, [], []);
    const b = applySuggestions(heavy, garage, [], []);
    expect(a.score!.value).toBe(b.score!.value);
  });
});

describe("comparison", () => {
  it("ranks inventories best first and skips empty ones", () => {
    const results = compareInventories(
      [
        { id: "a", name: "Student move", lines: small },
        { id: "b", name: "Garage clearout", lines: heavy },
        { id: "c", name: "Empty", lines: [] },
      ],
      garage,
    );
    expect(results.map((r) => r.id)).not.toContain("c");
    expect(results[0]!.score).toBeGreaterThanOrEqual(results[1]!.score);
  });
});
