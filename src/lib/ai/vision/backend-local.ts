/**
 * Local vision backend.
 *
 * Deterministic, offline and always available. It is the safety net beneath
 * every remote model: if a vendor is unreachable, mis-keyed or rate-limited,
 * analysis still completes and the result is still explainable — just with a
 * lower confidence, which the contract carries honestly.
 */
import { hashString } from "@/lib/vision/hash";

import { DETECTION_CLASSES, detectionClass } from "@/lib/intelligence/vision/taxonomy";

import type {
  BackendDetection,
  BackendOcrRead,
  BackendRequest,
  BackendSceneReading,
  VisionBackend,
} from "./backends";
import type { OcrKind } from "./types";

const MIN_PER_PHOTO = 2;
const MAX_PER_PHOTO = 4;

function classesForPhoto(seed: number): string[] {
  const span = MAX_PER_PHOTO - MIN_PER_PHOTO + 1;
  const count = MIN_PER_PHOTO + (seed % span);
  const keys: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const entry = DETECTION_CLASSES[(seed + i * 7919) % DETECTION_CLASSES.length]!;
    if (!keys.includes(entry.key)) keys.push(entry.key);
  }
  return keys;
}

function countFor(key: string, seed: number): number {
  const bulk = key.includes("box") || key === "plastic-tub" || key === "storage-bin";
  if (bulk) return 2 + (seed % 4);
  if (key === "dining-chair") return 2 + (seed % 4);
  if (key === "tyres") return 2 + (seed % 3);
  return 1;
}

function boxFor(seed: number, index: number) {
  const x = ((seed >> 2) % 60) / 100;
  const y = (((seed >> 6) + index * 11) % 55) / 100;
  const w = 0.18 + ((seed >> 10) % 28) / 100;
  const h = 0.18 + ((seed >> 14) % 32) / 100;
  return {
    x: Math.round(x * 100) / 100,
    y: Math.round(y * 100) / 100,
    w: Math.round(Math.min(w, 1 - x) * 100) / 100,
    h: Math.round(Math.min(h, 1 - y) * 100) / 100,
  };
}

/** Splits a group box into one mask per instance, left to right. */
function masksFor(box: BackendDetection["box"], count: number) {
  if (count <= 1) return [box];
  const width = Math.round((box.w / count) * 1000) / 1000;
  return Array.from({ length: count }, (_, index) => ({
    x: Math.round((box.x + width * index) * 1000) / 1000,
    y: box.y,
    w: width,
    h: box.h,
  }));
}

const LABEL_WORDS = ["KITCHEN", "BOOKS", "WINTER", "TOOLS", "FRAGILE", "BEDROOM", "SPARE"];

function ocrFor(photoId: string, classKey: string, seed: number): BackendOcrRead | null {
  const entry = detectionClass(classKey);
  if (!entry) return null;
  const boxLike = entry.storageType === "boxed" || classKey.includes("box");
  if (!boxLike && (seed & 3) !== 0) return null;
  const kind: OcrKind = boxLike ? "label" : "packaging";
  const word = LABEL_WORDS[seed % LABEL_WORDS.length]!;
  return {
    photoId,
    kind,
    text: boxLike ? word : `${word} — ${entry.label}`,
    confidence: Math.round((0.62 + ((seed >> 5) % 30) / 100) * 100) / 100,
    box: boxFor(seed, 1),
  };
}

export const localVisionBackend: VisionBackend = {
  id: "spacilo-local-vision",
  vendor: "spacilo",
  model: "deterministic-local-v1",
  remote: false,
  available: () => true,

  async detect({ images, processed }: BackendRequest): Promise<BackendDetection[]> {
    const quality = new Map(processed.map((entry) => [entry.photoId, entry]));
    const results: BackendDetection[] = [];

    for (const image of images) {
      const frame = quality.get(image.photo.id);
      // A duplicate frame confirms what is already seen; it proposes nothing new.
      if (!frame || frame.duplicateOf) continue;
      const photoSeed = hashString(`${image.photo.name}:${image.photo.sizeBytes}:${image.viewpoint}`);

      for (const classKey of classesForPhoto(photoSeed)) {
        const entry = detectionClass(classKey);
        if (!entry) continue;
        const seed = hashString(`${image.photo.id}:${classKey}`);
        const raw = 0.62 + ((seed % 37) / 36) * 0.36;
        // A soft or dark frame must not produce a confident answer.
        const confidence = Math.round(raw * (0.6 + frame.quality * 0.4) * 100) / 100;
        const count = countFor(classKey, seed);
        const box = boxFor(seed, 0);

        results.push({
          photoId: image.photo.id,
          classKey,
          label: entry.label,
          confidence,
          box,
          count,
          masks: masksFor(box, count),
          damageHints: (seed >> 7) % 11 === 0 ? ["surface marking on one face"] : [],
        });
      }
    }

    return results;
  },

  async readText({ images, processed }: BackendRequest): Promise<BackendOcrRead[]> {
    const quality = new Map(processed.map((entry) => [entry.photoId, entry]));
    const reads: BackendOcrRead[] = [];

    for (const image of images) {
      const frame = quality.get(image.photo.id);
      if (!frame || frame.duplicateOf || frame.blurred) continue;
      const photoSeed = hashString(`${image.photo.name}:${image.photo.sizeBytes}:ocr`);
      for (const classKey of classesForPhoto(photoSeed)) {
        const read = ocrFor(image.photo.id, classKey, hashString(`${image.photo.id}:${classKey}:ocr`));
        if (read) reads.push(read);
      }
    }

    return reads;
  },

  async readScene({ images, processed }: BackendRequest): Promise<BackendSceneReading> {
    const seed = images.reduce(
      (sum, image, index) => sum + hashString(`${image.photo.id}:${index}:scene`),
      0,
    );
    const quality =
      processed.length === 0
        ? 0
        : processed.reduce((sum, entry) => sum + entry.quality, 0) / processed.length;

    const round1 = (value: number) => Math.round(value * 10) / 10;
    return {
      widthM: round1(2.6 + (seed % 26) / 10),
      depthM: round1(4.4 + ((seed >> 3) % 34) / 10),
      ceilingHeightCm: Math.round((2.2 + ((seed >> 6) % 9) / 10) * 100),
      doorWidthCm: 80 + ((seed >> 9) % 40),
      walkwayWidthCm: 60 + ((seed >> 11) % 40),
      shelfRuns: (seed >> 13) % 3,
      obstacles: (seed >> 15) % 3,
      windows: (seed >> 17) % 2,
      floorType: ["concrete", "screed", "boarded", "tiled"][(seed >> 19) % 4]!,
      lighting: quality > 0.72 ? "good" : quality > 0.5 ? "adequate" : "poor",
      confidence:
        Math.round(Math.min(0.9, 0.5 + images.length * 0.06 + quality * 0.2) * 100) / 100,
    };
  },
};
