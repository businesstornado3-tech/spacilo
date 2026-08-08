/**
 * Phase 6I — determinism, inventory whitelist and render-verification tests.
 *
 * These lock the architectural principle of this phase: the deterministic
 * planner owns the plan, the verified inventory owns the objects, and a render
 * that invents belongings is rejected rather than shown.
 */
import { describe, expect, it } from "vitest";

import { buildPhotoPlan, type SpaceSource } from "./plan";
import {
  buildPlacementManifest,
  coverageFrom,
  formatManifestForModel,
  lockInventory,
  requiredLabels,
} from "./manifest";
import { manifestHash, runDiagnostics, serialiseManifest, verificationStatusOf } from "./diagnostics";
import { manifestPayload } from "./visualise";
import { coverageOf, parseCheckReply } from "@/routes/api/spaceplanner-visualise";
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

/** The real-world regression case: mixed luggage, bags and boxes. */
const inventoryObjects = [
  object({ id: "ITEM-001", label: "Large grey suitcase", width: 75, depth: 35, height: 80 }),
  object({ id: "ITEM-002", label: "Blue suitcase", width: 65, depth: 30, height: 70 }),
  object({ id: "ITEM-003", label: "Black backpack", width: 35, depth: 25, height: 50 }),
  object({ id: "ITEM-004", label: "Black duffel bag", width: 60, depth: 30, height: 35 }),
  object({ id: "ITEM-005", label: "White bedding bag", width: 70, depth: 45, height: 30 }),
  object({ id: "ITEM-006", label: "Cardboard box", quantity: 2, width: 50, depth: 40, height: 40 }),
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

describe("Phase 6I — same input, same plan", () => {
  it("produces an identical manifest across five runs", () => {
    const runs = Array.from({ length: 5 }, () => planOnce());
    const [first, ...rest] = runs;
    for (const run of rest) {
      expect(serialiseManifest(run.manifest)).toBe(serialiseManifest(first!.manifest));
      expect(manifestHash(run.manifest)).toBe(manifestHash(first!.manifest));
    }
  });

  it("keeps the arrangement, score and corridor stable", () => {
    const a = planOnce().result.arrangement;
    const b = planOnce().result.arrangement;
    expect(b.entries.length).toBe(a.entries.length);
    expect(b.corridorSide).toBe(a.corridorSide);
    expect(b.score.total).toBe(a.score.total);
    expect(b.quality.score).toBe(a.quality.score);
    expect(b.walkway).toEqual(a.walkway);
  });

  it("changes the plan hash when the inventory genuinely changes", () => {
    const base = planOnce().manifest;
    const changed = lockInventory([...inventoryObjects, object({ id: "ITEM-007", label: "Bike" })]);
    const other = buildPlacementManifest(changed, buildPhotoPlan(changed.objects, source)!);
    expect(manifestHash(other)).not.toBe(manifestHash(base));
  });
});

describe("Phase 6I — inventory is the source of truth", () => {
  const { manifest } = planOnce();

  it("renders only items that exist in the verified inventory", () => {
    const labels = requiredLabels(manifest);
    for (const label of labels) {
      expect(inventoryObjects.some((entry) => entry.label === label)).toBe(true);
    }
    expect(manifestPayload(manifest).length).toBe(labels.length);
  });

  it("states the exact object count and forbids invention in the rendering order", () => {
    const text = formatManifestForModel(manifest);
    expect(text).toContain("TOTAL OBJECTS TO DRAW: exactly");
    expect(text).toContain("DO NOT INVENT STORAGE FURNITURE");
  });

  it("keeps the walkway out of the drawable area", () => {
    expect(formatManifestForModel(manifest)).toContain("KEEP CLEAR");
  });
});

describe("Phase 6I — render verification rejects hallucinations", () => {
  it("flags objects the user does not own", () => {
    const report = coverageFrom(["Blue suitcase"], ["Blue suitcase"], ["Wooden chair", "Shoes"]);
    expect(report.complete).toBe(true);
    expect(report.faithful).toBe(false);
    expect(report.unexpected).toEqual(["Wooden chair", "Shoes"]);
  });

  it("does not count a whitelisted item as unexpected", () => {
    const report = coverageFrom(["Blue suitcase"], ["Blue suitcase"], ["blue suitcase"]);
    expect(report.faithful).toBe(true);
  });

  it("matches the endpoint's verifier", () => {
    expect(coverageOf(["TV"], ["TV"], ["Lamp"])).toEqual(coverageFrom(["TV"], ["TV"], ["Lamp"]));
  });

  it("parses the verifier's structured reply", () => {
    expect(parseCheckReply('{"present":["TV"],"unexpected":["Lamp"]}')).toEqual({
      present: ["TV"],
      unexpected: ["Lamp"],
    });
  });

  it("still accepts the older bare-array reply", () => {
    expect(parseCheckReply('["TV","Crib"]')).toEqual({ present: ["TV", "Crib"], unexpected: [] });
  });

  it("reports a rejected verification status", () => {
    expect(verificationStatusOf(coverageFrom(["TV"], ["TV"], ["Lamp"]))).toBe("rejected");
    expect(verificationStatusOf(coverageFrom(["TV"], ["TV"]))).toBe("passed");
    expect(verificationStatusOf(coverageFrom(["TV"], []))).toBe("incomplete");
    expect(verificationStatusOf(null)).toBe("not_run");
  });
});

describe("Phase 6I — run diagnostics", () => {
  it("records hashes, timings and verification outcome", () => {
    const { manifest, result } = planOnce();
    const diagnostics = runDiagnostics({
      manifest,
      coverage: coverageFrom(requiredLabels(manifest), requiredLabels(manifest)),
      plannerDurationMs: 12,
      renderDurationMs: 4000,
      verificationDurationMs: 800,
      renderAttempts: 1,
      qualityScore: result.arrangement.quality.score,
      clusterCount: 1,
      walkwayClearanceM: 0.9,
    });
    expect(diagnostics.verificationStatus).toBe("passed");
    expect(diagnostics.totalDurationMs).toBe(4812);
    expect(diagnostics.unexpectedObjectCount).toBe(0);
    expect(diagnostics.manifestHash).toBe(manifestHash(manifest));
  });

  it("is stable for identical runs", () => {
    const a = planOnce().manifest;
    const b = planOnce().manifest;
    const of = (manifest: typeof a) =>
      runDiagnostics({
        manifest,
        coverage: null,
        plannerDurationMs: 1,
        renderDurationMs: 1,
        verificationDurationMs: 1,
        renderAttempts: 1,
        qualityScore: 80,
        clusterCount: 1,
        walkwayClearanceM: 0.9,
      });
    expect(of(a)).toEqual(of(b));
  });
});
