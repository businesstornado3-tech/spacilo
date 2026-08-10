/**
 * Phase 6AC — the three measured defects, pinned.
 *
 * 1. A base's own load takes area away from its top surface (TV on a stand).
 * 2. Stacking stops being free once it leaves comfortable reach.
 * 3. Noun-phrase variants across photographs are one physical object.
 */
import { describe, expect, it } from "vitest";

import {
  COMFORTABLE_STACK_M,
  FLOOR_OCCUPATION_PENALTY,
  MAX_STACK_M,
  packOnSurface,
  scoreSurfaceCandidate,
  stackHeightPenalty,
  surfaceObstructions,
  tallestStack,
  usableSurfaceRect,
} from "./surfaces";
import type { PlanningItem } from "./types";
import {
  headNounOf,
  headNounsAgree,
  labelsDescribeSameObject,
  qualifiersOf,
} from "@/lib/vision/merge";

const stand = { key: "stand", x: 0, y: 0, w: 1.2, d: 0.45, topHeightM: 0.5 };

describe("Phase 6AC — a base's own load occupies its surface", () => {
  it("treats a television standing on the stand as occupied area", () => {
    const blocked = surfaceObstructions(stand, [
      { key: "tv", x: 0.1, y: 0.05, w: 1.0, d: 0.2, heightM: 0.7, baseHeightM: 0.5 },
    ]);
    expect(blocked).toHaveLength(1);
    expect(blocked[0]!.w).toBeGreaterThan(0.9);
  });

  it("ignores objects that end below the surface", () => {
    expect(
      surfaceObstructions(stand, [
        { key: "rug", x: 0, y: 0, w: 1.2, d: 0.45, heightM: 0.02, baseHeightM: 0 },
      ]),
    ).toHaveLength(0);
  });

  it("ignores wall-mounted objects", () => {
    expect(
      surfaceObstructions(stand, [
        { key: "tv", x: 0.1, y: 0, w: 1, d: 0.1, heightM: 0.7, baseHeightM: 1.1, mounted: true },
      ]),
    ).toHaveLength(0);
  });

  it("never places a small object where the television already stands", () => {
    const surface = usableSurfaceRect(stand);
    const blocked = surfaceObstructions(stand, [
      { key: "tv", x: 0.05, y: 0.05, w: 1.1, d: 0.2, heightM: 0.7, baseHeightM: 0.5 },
    ]);
    const fit = packOnSurface(surface, blocked, 0.2, 0.15);
    expect(fit).not.toBeNull();
    const rect = fit!.rect;
    const clash = blocked.some(
      (other) =>
        rect.x < other.x + other.w &&
        other.x < rect.x + rect.w &&
        rect.y < other.y + other.d &&
        other.y < rect.y + rect.d,
    );
    expect(clash).toBe(false);
  });

  it("reports no fit when the base's load consumes the whole top", () => {
    const surface = usableSurfaceRect(stand);
    const blocked = surfaceObstructions(stand, [
      { key: "tv", x: 0, y: 0, w: 1.2, d: 0.45, heightM: 0.7, baseHeightM: 0.5 },
    ]);
    expect(packOnSurface(surface, blocked, 0.4, 0.3)).toBeNull();
  });
});

describe("Phase 6AC — stacking is bounded", () => {
  const base: PlanningItem = {
    id: "stand",
    label: "TV stand",
    category: "furniture",
    quantity: 1,
    widthCm: 120,
    depthCm: 45,
    heightCm: 50,
    weight: "medium",
    stackable: false,
    fragile: false,
    compressible: false,
    allowUpright: false,
    wallMounted: false,
    components: [],
    confidence: 0.9,
    dimensionBasis: "estimated",
    photoIds: ["p1"],
  };

  const fit = { rect: { x: 0, y: 0, w: 0.3, d: 0.3 }, rotationDeg: 0 as const, utilisation: 0.4 };

  it("prefers the lower of two identical placements", () => {
    const low = scoreSurfaceCandidate({
      baseItem: base,
      baseTopHeightM: 0.5,
      fit,
      related: false,
      objectHeightM: 0.3,
    });
    const high = scoreSurfaceCandidate({
      baseItem: base,
      baseTopHeightM: 1.4,
      fit,
      related: false,
      objectHeightM: 0.3,
    });
    expect(low).toBeGreaterThan(high);
  });

  it("penalises anything that ends above the safe limit decisively", () => {
    const safe = scoreSurfaceCandidate({
      baseItem: base,
      baseTopHeightM: 0.5,
      fit,
      related: false,
      objectHeightM: 0.3,
    });
    const unsafe = scoreSurfaceCandidate({
      baseItem: base,
      baseTopHeightM: 1.6,
      fit,
      related: false,
      objectHeightM: 0.5,
    });
    expect(safe - unsafe).toBeGreaterThan(60);
  });

  it("charges nothing while everything stays within reach", () => {
    expect(stackHeightPenalty([{ heightM: 0.4, baseHeightM: 0.5 }])).toBe(0);
  });

  it("charges for a tower", () => {
    expect(stackHeightPenalty([{ heightM: 0.6, baseHeightM: 1.4 }])).toBeGreaterThan(0);
  });

  it("measures the tallest stack", () => {
    expect(
      tallestStack([
        { heightM: 0.4, baseHeightM: 0 },
        { heightM: 0.35, baseHeightM: 0.5 },
      ]),
    ).toBe(0.85);
  });

  it("keeps the floor penalty material but no longer overwhelming", () => {
    expect(FLOOR_OCCUPATION_PENALTY).toBeGreaterThanOrEqual(10);
    expect(FLOOR_OCCUPATION_PENALTY).toBeLessThan(20);
  });

  it("states sane stacking limits", () => {
    expect(COMFORTABLE_STACK_M).toBeLessThan(MAX_STACK_M);
    expect(MAX_STACK_M).toBeLessThanOrEqual(1.8);
  });
});

describe("Phase 6AC — noun-phrase identity across photographs", () => {
  it("reads the head noun of a phrase", () => {
    expect(headNounOf("water bottle")).toBe("bottle");
    expect(qualifiersOf("water bottle")).toEqual(["water"]);
  });

  it("merges a detailed name with its plain form", () => {
    expect(headNounsAgree("water bottle", "bottle")).toBe(true);
    expect(labelsDescribeSameObject("water bottle", "bottle")).toBe(true);
  });

  it("keeps genuinely different qualifiers apart", () => {
    expect(headNounsAgree("water bottle", "milk bottle")).toBe(false);
    expect(labelsDescribeSameObject("water bottle", "milk bottle")).toBe(false);
  });

  it("never merges different nouns that share a qualifier", () => {
    expect(headNounsAgree("water bottle", "water tank")).toBe(false);
    expect(labelsDescribeSameObject("TV stand", "TV")).toBe(false);
  });

  it("still refuses a contradicting descriptor", () => {
    expect(labelsDescribeSameObject("blue water bottle", "red bottle")).toBe(false);
  });
});
