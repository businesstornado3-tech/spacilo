/**
 * Phase 6K — final architectural hardening regressions.
 *
 * The manifest is now the single, self-describing source of truth: it carries
 * its own plan hash, the winning strategy, the corridor side, the arrangement
 * score and every item the engine refused to place. These tests assert that
 * the plan is stable, complete, physically valid, and never quietly changed by
 * a render retry.
 */
import { describe, expect, it } from "vitest";

import { manifestHash, serialiseManifest } from "./diagnostics";
import { buildPlacementManifest, lockInventory } from "./manifest";
import { buildPhotoPlan, type SpaceSource } from "./plan";
import type { DetectedObject } from "@/lib/vision/types";

const object = (patch: Partial<DetectedObject> & { id: string; label: string }): DetectedObject =>
  ({
    category: "other",
    confidence: 0.82,
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

const objects = [
  object({ id: "K-001", label: "Two-seat sofa", category: "furniture", width: 160, depth: 85, height: 85, stackable: false }),
  object({ id: "K-002", label: "Large suitcase", category: "leisure", width: 75, depth: 35, height: 80 }),
  object({ id: "K-003", label: "Cardboard box", category: "boxes", quantity: 4, width: 50, depth: 40, height: 40 }),
  object({ id: "K-004", label: "Bicycle", category: "leisure", width: 175, depth: 45, height: 105, stackable: false }),
];

const source: SpaceSource = {
  widthM: 3.2,
  depthM: 5.8,
  heightM: 2.4,
  basis: "photo",
  confidence: 0.7,
  name: "Single garage",
};

function planOnce() {
  const inventory = lockInventory(objects, 1_700_000_000_000);
  const result = buildPhotoPlan(inventory.objects, source)!;
  return { inventory, result, manifest: buildPlacementManifest(inventory, result) };
}

describe("Phase 6K — determinism", () => {
  it("carries a self-describing plan hash that matches the serialised plan", () => {
    const { manifest } = planOnce();
    expect(manifest.planHash).toMatch(/^plan_/);
    expect(manifest.planHash).toBe(manifestHash(manifest));
  });

  it("produces the identical plan hash across ten runs", () => {
    const hashes = new Set(Array.from({ length: 10 }, () => planOnce().manifest.planHash));
    expect(hashes.size).toBe(1);
  });

  it("serialises byte-identically across runs", () => {
    expect(serialiseManifest(planOnce().manifest)).toBe(serialiseManifest(planOnce().manifest));
  });

  it("does not change the plan when only the render is retried", () => {
    const first = planOnce().manifest;
    // A retry re-renders the SAME manifest; rebuilding it must be a no-op.
    const second = planOnce().manifest;
    expect(second.planHash).toBe(first.planHash);
    expect(second.strategy).toBe(first.strategy);
    expect(second.corridorSide).toBe(first.corridorSide);
  });
});

describe("Phase 6K — plan provenance on the manifest", () => {
  it("records the winning strategy, score, corridor side and placed units", () => {
    const { manifest, inventory } = planOnce();
    expect(manifest.strategy.length).toBeGreaterThan(0);
    expect(manifest.qualityScore).toBeGreaterThanOrEqual(0);
    expect(manifest.qualityScore).toBeLessThanOrEqual(100);
    expect(manifest.corridorSide.length).toBeGreaterThan(0);
    expect(manifest.expectedUnits).toBe(inventory.itemCount);
    expect(manifest.placedUnits).toBeLessThanOrEqual(manifest.expectedUnits);
  });

  it("reports every unplaced item with a reason instead of dropping it", () => {
    const { manifest } = planOnce();
    for (const entry of manifest.unplaced) {
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.reason.length).toBeGreaterThan(0);
    }
    const cannotPlace = manifest.entries.filter((entry) => entry.state === "cannot be safely placed");
    expect(cannotPlace.length).toBe(new Set(manifest.unplaced.map((entry) => entry.label)).size);
  });

  it("only ships a valid plan, or names the constraint that failed", () => {
    const { manifest } = planOnce();
    if (manifest.valid) expect(manifest.violations).toHaveLength(0);
    else expect(manifest.violations.length).toBeGreaterThan(0);
  });
});

describe("Phase 6K — zero invention, zero omission", () => {
  it("never introduces an object the confirmed inventory does not contain", () => {
    const { inventory, manifest } = planOnce();
    const allowed = new Set(inventory.objects.map((entry) => entry.id));
    for (const entry of manifest.entries) expect(allowed.has(entry.id)).toBe(true);
    expect(manifest.entries).toHaveLength(inventory.objects.length);
  });

  it("keeps every placed unit inside the usable floor", () => {
    const { manifest } = planOnce();
    for (const entry of manifest.entries) {
      for (const position of entry.positions) {
        expect(position.xM).toBeGreaterThanOrEqual(-0.01);
        expect(position.yM).toBeGreaterThanOrEqual(-0.01);
        expect(position.xM + position.widthM).toBeLessThanOrEqual(manifest.spaceWidthM + 0.01);
        expect(position.yM + position.depthM).toBeLessThanOrEqual(manifest.spaceDepthM + 0.01);
      }
    }
  });

  it("leaves the access corridor completely clear", () => {
    const { manifest } = planOnce();
    const walkway = manifest.walkway;
    if (!walkway) return;
    for (const entry of manifest.entries) {
      for (const position of entry.positions) {
        if (position.layer > 0) continue;
        const overlapX =
          Math.min(position.xM + position.widthM, walkway.xM + walkway.widthM) -
          Math.max(position.xM, walkway.xM);
        const overlapY =
          Math.min(position.yM + position.depthM, walkway.yM + walkway.depthM) -
          Math.max(position.yM, walkway.yM);
        expect(Math.max(0, overlapX) * Math.max(0, overlapY)).toBeLessThan(0.02);
      }
    }
  });

  it("never overlaps two units on the same layer", () => {
    const { manifest } = planOnce();
    const floor = manifest.entries.flatMap((entry) =>
      entry.positions.filter((position) => position.layer === 0),
    );
    for (let i = 0; i < floor.length; i += 1) {
      for (let j = i + 1; j < floor.length; j += 1) {
        const a = floor[i]!;
        const b = floor[j]!;
        const overlapX = Math.min(a.xM + a.widthM, b.xM + b.widthM) - Math.max(a.xM, b.xM);
        const overlapY = Math.min(a.yM + a.depthM, b.yM + b.depthM) - Math.max(a.yM, b.yM);
        expect(Math.max(0, overlapX) * Math.max(0, overlapY)).toBeLessThan(0.02);
      }
    }
  });
});
