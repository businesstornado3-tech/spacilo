/**
 * Stage 2 — object detection.
 *
 * Deterministic proposals drawn from the taxonomy. Detection confidence is
 * scaled by the pre-processing quality of the frame it came from, because a
 * blurred photo should never produce a confident answer.
 *
 * Replaceable: a real detector returns the same `VisionDetection[]` and no
 * later stage changes.
 */
import { hashString } from "@/lib/vision/hash";

import type { VisionDetection, VisionDiagnostics, VisionImage } from "./contracts";
import { DETECTION_CLASSES } from "./taxonomy";

/** Classes proposed per frame, before fusion. */
const MIN_PER_PHOTO = 2;
const MAX_PER_PHOTO = 4;

function classesForImage(image: VisionImage): string[] {
  const seed = hashString(`${image.photo.name}:${image.photo.sizeBytes}:${image.viewpoint}`);
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
  if (bulk) return 2 + (seed % 5);
  if (key === "dining-chair") return 2 + (seed % 4);
  if (key === "tyres") return 2 + (seed % 3);
  return 1;
}

function boxFor(seed: number): VisionDetection["box"] {
  const x = ((seed >> 2) % 60) / 100;
  const y = ((seed >> 6) % 55) / 100;
  const w = 0.2 + ((seed >> 10) % 30) / 100;
  const h = 0.2 + ((seed >> 14) % 35) / 100;
  return {
    x: Math.round(x * 100) / 100,
    y: Math.round(y * 100) / 100,
    w: Math.round(Math.min(w, 1 - x) * 100) / 100,
    h: Math.round(Math.min(h, 1 - y) * 100) / 100,
  };
}

export function detectInImage(
  image: VisionImage,
  diagnostics: VisionDiagnostics,
): VisionDetection[] {
  return classesForImage(image).map((key) => {
    const seed = hashString(`${image.photo.id}:${key}`);
    // 0.62–0.98 before quality, then discounted by how usable the frame is.
    const raw = 0.62 + ((seed % 37) / 36) * 0.36;
    const detectionConfidence =
      Math.round(raw * (0.6 + diagnostics.quality * 0.4) * 100) / 100;

    return {
      id: `det-${image.photo.id}-${key}`,
      photoId: image.photo.id,
      viewpoint: image.viewpoint,
      classKey: key,
      label: DETECTION_CLASSES.find((entry) => entry.key === key)!.label,
      detectionConfidence,
      box: boxFor(seed),
      count: countFor(key, seed),
    };
  });
}

/** Detections across a whole set of photos, duplicates included. */
export function detectObjects(
  images: VisionImage[],
  diagnostics: VisionDiagnostics[],
): VisionDetection[] {
  const byPhoto = new Map(diagnostics.map((entry) => [entry.photoId, entry]));
  return images.flatMap((image) => {
    const entry = byPhoto.get(image.photo.id);
    return entry ? detectInImage(image, entry) : [];
  });
}
