/**
 * Phase 6C — production vision platform tests.
 *
 * These lock the behaviour that protects customers: no double counting across
 * angles, no confident answers from poor photos, no damage asserted without
 * evidence, and a working fallback when a hosted model fails.
 */
import { beforeEach, describe, expect, it } from "vitest";

import type { VisionPhoto } from "@/lib/vision/types";

import { localVisionBackend } from "../vision/backend-local";
import { createRemoteVisionBackend, matchClassKey, normaliseRemoteDetections } from "../vision/backend-remote";
import { clearVisionBackends, registerVisionBackend } from "../vision/backends";
import { analyseVision, validateImages, VisionInputError } from "../vision/analyse";
import { toDetectedInventory, toDetectedSpace } from "../vision/adapters";
import { fuseSightings } from "../vision/fusion";
import { preprocessImages } from "../vision/preprocess";
import { segmentDetections } from "../vision/segmentation";
import { clearVisionCorrections, correctionHotspots, recordVisionCorrection } from "../vision/feedback";
import { resetVisionMetrics, visionMetrics } from "../vision/metrics";
import type { VisionImage } from "../vision/types";

function photo(id: string, overrides: Partial<VisionPhoto> = {}): VisionPhoto {
  return {
    id,
    name: `${id}.jpg`,
    url: `blob:${id}`,
    sizeBytes: 640_000,
    mimeType: "image/jpeg",
    rotation: 0,
    addedAt: 1,
    ...overrides,
  };
}

function image(id: string, viewpoint: VisionImage["viewpoint"] = "front", overrides: Partial<VisionPhoto> = {}): VisionImage {
  return { photo: photo(id, overrides), viewpoint };
}

beforeEach(() => {
  clearVisionBackends();
  registerVisionBackend(localVisionBackend);
  resetVisionMetrics();
  clearVisionCorrections();
});

describe("input validation", () => {
  it("rejects an empty set", async () => {
    expect(() => validateImages([])).toThrow(VisionInputError);
  });

  it("rejects an unsupported file type", () => {
    expect(() => validateImages([image("a", "front", { mimeType: "application/pdf" })])).toThrow(
      VisionInputError,
    );
  });

  it("accepts supported photos", () => {
    expect(() => validateImages([image("a")])).not.toThrow();
  });
});

describe("pre-processing", () => {
  it("always strips metadata and keeps the original", () => {
    const [processed] = preprocessImages([image("a")]);
    expect(processed!.metadataStripped).toBe(true);
    expect(processed!.operations).toContain("metadata_stripped");
    expect(processed!.originalUrl).toBe("blob:a");
  });

  it("corrects orientation when a photo is rotated", () => {
    const [processed] = preprocessImages([image("a", "front", { rotation: 90 })]);
    expect(processed!.rotationApplied).toBe(90);
    expect(processed!.operations).toContain("orientation_corrected");
  });

  it("flags near-identical frames as duplicates", () => {
    const first = image("a");
    const second = { ...image("b"), photo: { ...photo("b"), name: "a.jpg", sizeBytes: 640_000 } };
    const processed = preprocessImages([first, second]);
    expect(processed[1]!.duplicateOf).toBe("a");
  });

  it("is deterministic for the same photo", () => {
    const a = preprocessImages([image("a")])[0]!;
    const b = preprocessImages([image("a")])[0]!;
    expect(a.quality).toBe(b.quality);
  });
});

describe("segmentation and fusion", () => {
  it("splits a group detection into individual instances", () => {
    const images = [image("a")];
    const processed = preprocessImages(images);
    const sightings = segmentDetections(
      [
        {
          photoId: "a",
          classKey: "medium-box",
          label: "Medium box",
          confidence: 0.8,
          box: { x: 0, y: 0, w: 0.8, h: 0.4 },
          count: 4,
          damageHints: [],
        },
      ],
      images,
      processed,
    );
    expect(sightings).toHaveLength(4);
    expect(new Set(sightings.map((s) => s.id)).size).toBe(4);
  });

  it("never counts the same objects twice across angles", () => {
    const images = [image("a", "front"), image("b", "left")];
    const processed = preprocessImages(images);
    const detections = images.map((entry) => ({
      photoId: entry.photo.id,
      classKey: "medium-box",
      label: "Medium box",
      confidence: 0.8,
      box: { x: 0, y: 0, w: 0.8, h: 0.4 },
      count: 3,
      damageHints: [],
    }));
    const { instances, duplicatesMerged } = fuseSightings(
      segmentDetections(detections, images, processed),
    );
    expect(instances).toHaveLength(3);
    expect(duplicatesMerged).toBe(3);
    expect(instances[0]!.corroboration).toBe(2);
  });
});

describe("analysis", () => {
  it("produces individual instances with reasons and confidence", async () => {
    const analysis = await analyseVision({ images: [image("a"), image("b", "left")] });
    expect(analysis.instances.length).toBeGreaterThan(0);
    for (const instance of analysis.instances) {
      expect(instance.quantity).toBe(1);
      expect(instance.explanations.length).toBeGreaterThan(0);
      expect(instance.confidence.overall).toBeGreaterThan(0);
      expect(instance.confidence.overall).toBeLessThanOrEqual(1);
      expect(instance.dimensions.minCm.width).toBeLessThanOrEqual(instance.dimensions.widthCm);
      expect(instance.dimensions.maxCm.width).toBeGreaterThanOrEqual(instance.dimensions.widthCm);
    }
  });

  it("never asserts damage below the assertion threshold", async () => {
    const analysis = await analyseVision({ images: [image("a"), image("b"), image("c")] });
    for (const observation of analysis.damage) {
      if (!observation.asserted) expect(observation.note).toMatch(/may show/i);
      else expect(observation.confidence).toBeGreaterThanOrEqual(0.8);
    }
  });

  it("reads a scene and maps zones when asked", async () => {
    const analysis = await analyseVision({
      images: [image("a"), image("b", "left")],
      scene: true,
      spaceType: "single-garage",
    });
    expect(analysis.scene).not.toBeNull();
    expect(analysis.scene!.spatial.zones.length).toBeGreaterThan(0);
    expect(analysis.scene!.spatial.usableFloorAreaM2).toBeLessThanOrEqual(
      analysis.scene!.spatial.floorAreaM2,
    );
  });

  it("falls back to another backend when the preferred one fails", async () => {
    clearVisionBackends();
    registerVisionBackend({
      id: "broken",
      vendor: "test",
      model: "broken-1",
      remote: true,
      available: () => true,
      detect: async () => {
        throw new Error("upstream down");
      },
    });
    registerVisionBackend(localVisionBackend);

    const analysis = await analyseVision({ images: [image("a")] });
    expect(analysis.meta.fallbackUsed).toBe(true);
    expect(analysis.meta.backendId).toBe(localVisionBackend.id);
    expect(analysis.warnings.some((warning) => /backup/i.test(warning))).toBe(true);
  });

  it("records a metric per run", async () => {
    await analyseVision({ images: [image("a")] });
    const snapshot = visionMetrics();
    expect(snapshot.runs).toBe(1);
    expect(snapshot.failures).toBe(0);
  });
});

describe("adapters", () => {
  it("keeps the shapes the existing screens render", async () => {
    const analysis = await analyseVision({ images: [image("a")], scene: true });
    const inventory = toDetectedInventory(analysis);
    expect(inventory.objects).toHaveLength(analysis.itemCount);
    expect(inventory.objects.every((object) => object.source === "ai")).toBe(true);
    expect(toDetectedSpace(analysis)?.usableAreaM2).toBeGreaterThan(0);
  });
});

describe("remote backend normalisation", () => {
  it("maps vendor labels onto the taxonomy", () => {
    expect(matchClassKey("Medium Box")).toBe("medium-box");
    expect(matchClassKey("completely unknown thing")).toBeTruthy();
  });

  it("survives malformed vendor payloads", () => {
    const detections = normaliseRemoteDetections(
      { objects: [{ name: "medium box", score: 0.9 }, { label: "" }, {}] },
      "a",
    );
    expect(detections).toHaveLength(1);
    expect(detections[0]!.photoId).toBe("a");
  });

  it("builds a working backend from a transport", async () => {
    const backend = createRemoteVisionBackend({
      id: "test-remote",
      vendor: "test",
      model: "test-1",
      transport: async () => ({ objects: [{ label: "medium box", confidence: 0.9, count: 2 }] }),
    });
    const images = [image("a")];
    const detections = await backend.detect({ images, processed: preprocessImages(images) });
    expect(detections[0]!.count).toBe(2);
  });
});

describe("correction feedback", () => {
  it("stores anonymised class-level signal only", async () => {
    const analysis = await analyseVision({ images: [image("a")] });
    const instance = analysis.instances[0]!;
    const correction = recordVisionCorrection({
      instance,
      field: "dimensions",
      from: instance.dimensions.widthCm,
      to: 180,
      backendId: analysis.meta.backendId,
    });

    expect(correction.classKey).toBe(instance.classKey);
    expect(correction.to).toBe("100-200");
    expect(JSON.stringify(correction)).not.toContain("blob:");
    expect(correctionHotspots()[0]!.count).toBe(1);
  });
});
