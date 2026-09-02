/**
 * Vision Intelligence Engine — deterministic tests.
 *
 * The engine's whole value rests on two properties: the same photos always
 * produce the same answer, and the answer explains itself. Both are asserted
 * here, alongside the multi-image reasoning that stops one wardrobe being
 * counted as three.
 */
import { beforeEach, describe, expect, it } from "vitest";

import type { VisionPhoto } from "@/lib/vision/types";
import { classifyDetection } from "./classify";
import { buildConfidence, REVIEW_THRESHOLD } from "./confidence";
import { estimateDimensions } from "./dimensions";
import { analyseFragility } from "./fragility";
import { fuseDetections } from "./fusion";
import { toDetectedObjects, toInventoryLines } from "./inventory";
import { preprocessImages } from "./preprocess";
import {
  inferViewpoint,
  resetVisionStages,
  runSceneAnalysis,
  runVisionPipeline,
  setVisionStage,
  toVisionImages,
} from "./pipeline";
import { DETECTION_CLASSES, DETECTION_CLASS_BY_KEY } from "./taxonomy";
import { estimateWeight } from "./weight";
import { visionEngineProvider } from "./provider";

const photo = (name: string, sizeBytes = 480_000, rotation = 0): VisionPhoto => ({
  id: `photo-${name}`,
  name,
  url: `blob:${name}`,
  sizeBytes,
  mimeType: "image/jpeg",
  rotation,
  addedAt: 0,
});

const PHOTOS = [
  photo("garage-front.jpg"),
  photo("garage-left.jpg", 620_000),
  photo("loft-room-1.jpg", 310_000),
];

beforeEach(() => {
  resetVisionStages();
});

describe("taxonomy", () => {
  it("covers every requested detection class with unique keys", () => {
    expect(DETECTION_CLASSES.length).toBe(DETECTION_CLASS_BY_KEY.size);
    for (const key of [
      "medium-box",
      "suitcase",
      "plastic-tub",
      "storage-bin",
      "wardrobe",
      "chest-drawers",
      "bed-frame",
      "double-mattress",
      "two-seater-sofa",
      "dining-table",
      "coffee-table",
      "television",
      "monitor",
      "desktop-pc",
      "office-chair",
      "desk",
      "bicycle",
      "motorcycle",
      "scooter",
      "golf-clubs",
      "camping-gear",
      "sports-equipment",
      "garden-tools",
      "pushchair",
      "childrens-toys",
      "guitar",
      "fridge-freezer",
      "freezer",
      "microwave",
      "washing-machine",
      "tumble-dryer",
      "shelving-unit",
      "toolbox",
      "ladder",
      "tyres",
      "archive-box",
      "retail-stock",
      "office-storage",
    ]) {
      expect(DETECTION_CLASS_BY_KEY.has(key)).toBe(true);
    }
  });

  it("gives every class a visual cue so detections can be explained", () => {
    for (const entry of DETECTION_CLASSES) {
      expect(entry.cue.length).toBeGreaterThan(0);
      expect(entry.subcategory.length).toBeGreaterThan(0);
    }
  });
});

describe("pre-processing", () => {
  it("scores quality and flags duplicates once", () => {
    const images = toVisionImages([photo("a.jpg"), photo("a.jpg", 480_100), photo("b.jpg")]);
    const diagnostics = preprocessImages(images);
    expect(diagnostics).toHaveLength(3);
    expect(diagnostics[0]!.duplicateOf).toBeNull();
    expect(diagnostics[1]!.duplicateOf).toBe(diagnostics[0]!.photoId);
    expect(diagnostics[1]!.issues).toContain("duplicate");
    expect(diagnostics[2]!.duplicateOf).toBeNull();
    for (const entry of diagnostics) {
      expect(entry.quality).toBeGreaterThanOrEqual(0);
      expect(entry.quality).toBeLessThanOrEqual(1);
    }
  });

  it("normalises rotation to quarter turns", () => {
    const [diagnostics] = preprocessImages(toVisionImages([photo("r.jpg", 400_000, 450)]));
    expect(diagnostics!.rotation).toBe(90);
  });
});

describe("viewpoints and fusion", () => {
  it("infers viewpoints from photo names", () => {
    expect(inferViewpoint(photo("garage-front.jpg"))).toBe("front");
    expect(inferViewpoint(photo("back-of-shed.jpg"))).toBe("rear");
    expect(inferViewpoint(photo("IMG_2201.jpg"))).toBe("unknown");
  });

  it("never counts the same object twice across angles", () => {
    const images = toVisionImages([photo("front.jpg"), photo("left.jpg")]);
    const diagnostics = preprocessImages(images);
    const detections = [
      {
        id: "d1",
        photoId: images[0]!.photo.id,
        viewpoint: "front" as const,
        classKey: "wardrobe",
        label: "Wardrobe",
        detectionConfidence: 0.8,
        box: { x: 0.1, y: 0.1, w: 0.4, h: 0.6 },
        count: 1,
      },
      {
        id: "d2",
        photoId: images[1]!.photo.id,
        viewpoint: "left" as const,
        classKey: "wardrobe",
        label: "Wardrobe",
        detectionConfidence: 0.9,
        box: { x: 0.2, y: 0.1, w: 0.3, h: 0.6 },
        count: 1,
      },
    ];
    const fused = fuseDetections(detections, diagnostics);
    expect(fused).toHaveLength(1);
    expect(fused[0]!.quantity).toBe(1);
    // Keeps the best evidence and adds a small agreement bonus.
    expect(fused[0]!.detectionConfidence).toBeGreaterThanOrEqual(0.9);
    expect(fused[0]!.viewpoints).toEqual(["front", "left"]);
  });
});

describe("estimation engines", () => {
  const fused = {
    classKey: "double-mattress",
    label: "Double mattress",
    quantity: 1,
    detectionConfidence: 0.9,
    photoIds: ["p1", "p2"],
    viewpoints: ["front", "left"] as const,
    detectionIds: ["d1"],
    sightings: 2,
    boxes: [{ x: 0.1, y: 0.1, w: 0.5, h: 0.4 }],
  };

  it("estimates dimensions with a plausible range", () => {
    const dimensions = estimateDimensions({ ...fused, viewpoints: [...fused.viewpoints] });
    expect(dimensions.minCm.width).toBeLessThan(dimensions.widthCm);
    expect(dimensions.maxCm.width).toBeGreaterThan(dimensions.widthCm);
    expect(dimensions.volumeM3).toBeGreaterThan(0);
    expect(dimensions.surfaceAreaM2).toBeGreaterThan(0);
    expect(dimensions.footprintM2).toBeGreaterThan(0);
    expect(dimensions.basis).toContain("angles");
  });

  it("classifies handling, orientation and hazard prompts", () => {
    const classification = classifyDetection({
      id: "d",
      photoId: "p",
      viewpoint: "front",
      classKey: "motorcycle",
      label: "Motorcycle",
      detectionConfidence: 0.9,
      box: { x: 0, y: 0, w: 0.5, h: 0.5 },
      count: 1,
    });
    expect(classification.hazard).toBe("check_fuel");
    expect(classification.storageType).toBe("wheeled");
    expect(classification.handling).toContain("confirm");
  });

  it("derives lift class and stack load from weight", () => {
    const dimensions = estimateDimensions({ ...fused, viewpoints: [...fused.viewpoints] });
    const classification = classifyDetection({
      id: "d",
      photoId: "p",
      viewpoint: "front",
      classKey: "double-mattress",
      label: "Double mattress",
      detectionConfidence: 0.9,
      box: { x: 0, y: 0, w: 0.5, h: 0.5 },
      count: 1,
    });
    const weight = estimateWeight(dimensions, classification, 2);
    expect(weight.totalKg).toBe(weight.perUnitKg * 2);
    expect(["one_person", "two_person", "heavy_lift", "fragile_lift"]).toContain(weight.liftClass);
  });

  it("recommends protection for screens", () => {
    const classification = classifyDetection({
      id: "d",
      photoId: "p",
      viewpoint: "front",
      classKey: "television",
      label: "Television",
      detectionConfidence: 0.9,
      box: { x: 0, y: 0, w: 0.5, h: 0.5 },
      count: 1,
    });
    const fragility = analyseFragility("television", classification);
    expect(fragility.level).toBe("high");
    expect(fragility.measures).toContain("vertical_storage");
    expect(fragility.reasons.length).toBeGreaterThan(0);
  });
});

describe("confidence engine", () => {
  it("weights detection above weight and bands consistently", () => {
    const strongDetection = buildConfidence({
      detection: 1,
      classification: 1,
      dimension: 0.5,
      weight: 0.5,
    });
    const weakDetection = buildConfidence({
      detection: 0.5,
      classification: 0.5,
      dimension: 1,
      weight: 1,
    });
    expect(strongDetection.overall).toBeGreaterThan(weakDetection.overall);
    expect(strongDetection.band).toBe("good");
    expect(buildConfidence({ detection: 0.4, classification: 0.4, dimension: 0.4, weight: 0.4 }).needsReview).toBe(true);
    expect(REVIEW_THRESHOLD).toBe(0.75);
  });
});

describe("pipeline", () => {
  it("is deterministic for the same photos", () => {
    const a = runVisionPipeline({ photos: PHOTOS });
    const b = runVisionPipeline({ photos: PHOTOS });
    expect(b.objects.map((object) => object.id)).toEqual(a.objects.map((object) => object.id));
    expect(b.itemCount).toBe(a.itemCount);
    expect(b.volumeM3).toBe(a.volumeM3);
    expect(b.confidence.overall).toBe(a.confidence.overall);
  });

  it("builds one intelligent inventory with grouped quantities", () => {
    const inventory = runVisionPipeline({ photos: PHOTOS });
    expect(inventory.objects.length).toBeGreaterThan(0);
    expect(inventory.objectCount).toBe(inventory.objects.length);
    expect(inventory.itemCount).toBeGreaterThanOrEqual(inventory.objectCount);
    // One line per class — no duplicates survive fusion.
    const keys = inventory.objects.map((object) => object.classKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(inventory.weightKg).toBeGreaterThan(0);
  });

  it("explains every object it proposes", () => {
    const inventory = runVisionPipeline({ photos: PHOTOS });
    for (const object of inventory.objects) {
      expect(object.explanations.length).toBeGreaterThan(0);
      expect(object.explanations[0]).toMatch(/Detected as .* because .* confidence\.$/);
      expect(object.confidence.overall).toBeGreaterThan(0);
      expect(object.dimensions.widthCm).toBeGreaterThan(0);
    }
    expect(inventory.explanations.length).toBeGreaterThan(0);
  });

  it("records diagnostics, metadata and viewpoints", () => {
    const inventory = runVisionPipeline({ photos: PHOTOS });
    expect(inventory.diagnostics).toHaveLength(PHOTOS.length);
    expect(inventory.metadata.photoCount).toBe(PHOTOS.length);
    expect(inventory.metadata.contractVersion).toBe("vision-1");
    expect(inventory.viewpoints.length).toBeGreaterThan(0);
  });

  it("lets any stage be replaced without touching callers", () => {
    setVisionStage("detect", () => [
      {
        id: "custom-1",
        photoId: PHOTOS[0]!.id,
        viewpoint: "front",
        classKey: "bicycle",
        label: "Bicycle",
        detectionConfidence: 0.95,
        box: { x: 0, y: 0, w: 0.5, h: 0.5 },
        count: 1,
      },
    ]);
    const inventory = runVisionPipeline({ photos: PHOTOS });
    expect(inventory.objects).toHaveLength(1);
    expect(inventory.objects[0]!.label).toBe("Bicycle");
  });

  it("stops when the run is cancelled", () => {
    const controller = new AbortController();
    controller.abort();
    expect(() => runVisionPipeline({ photos: PHOTOS, signal: controller.signal })).toThrow();
  });
});

describe("planner integration", () => {
  it("converts to detected objects and planner lines", () => {
    const inventory = runVisionPipeline({ photos: PHOTOS });
    const detected = toDetectedObjects(inventory);
    expect(detected).toHaveLength(inventory.objects.length);
    for (const object of detected) {
      expect(object.source).toBe("ai");
      expect(object.quantity).toBeGreaterThan(0);
    }

    const lines = toInventoryLines(inventory);
    for (const line of lines) {
      expect(line.item.id.length).toBeGreaterThan(0);
      expect(line.quantity).toBeGreaterThan(0);
    }
    // Only objects with a catalogue equivalent are planned; none are invented.
    expect(lines.length).toBeLessThanOrEqual(inventory.objects.length);
  });

  it("reaches the platform through the vision provider contract", async () => {
    const result = await visionEngineProvider.analyseBelongings(PHOTOS);
    expect(result.objects.length).toBeGreaterThan(0);
    expect(result.itemCount).toBeGreaterThan(0);
    expect(result.meta.provider).toBe("earnroom-vision-engine-v1");
  });
});

describe("scene analysis", () => {
  it("proposes structural features for a space", () => {
    const scene = runSceneAnalysis({ photos: PHOTOS, spaceType: "single-garage" });
    const kinds = scene.features.map((feature) => feature.kind);
    for (const kind of ["floor", "ceiling", "door", "wall", "walkway"]) {
      expect(kinds).toContain(kind);
    }
    expect(scene.usableAreaM2).toBeLessThan(scene.floorAreaM2);
    expect(scene.confidence).toBeGreaterThan(0);
    for (const feature of scene.features) {
      expect(feature.explanation.length).toBeGreaterThan(0);
    }
  });

  it("is deterministic", () => {
    expect(runSceneAnalysis({ photos: PHOTOS })).toEqual(runSceneAnalysis({ photos: PHOTOS }));
  });
});
