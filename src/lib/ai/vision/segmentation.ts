/**
 * Stage 3 — instance segmentation.
 *
 * Detection says "four boxes". Segmentation turns that into Box 1, Box 2,
 * Box 3 and Box 4, each with its own mask, its own apparent size and, later,
 * its own dimensions and confidence. Everything downstream reasons about
 * individual objects, which is what packing and pricing actually need.
 */
import { hashString } from "@/lib/vision/hash";

import type { BackendDetection } from "./backends";
import type { ProcessedImage, VisionImage, VisionViewpoint } from "./types";

/** One object, seen once, in one frame. */
export interface InstanceSighting {
  id: string;
  photoId: string;
  viewpoint: VisionViewpoint;
  classKey: string;
  label: string;
  /** Index of this instance within its detection group, from 1. */
  ordinal: number;
  box: { x: number; y: number; w: number; h: number };
  /** Share of the frame this instance occupies — the only visual scale cue. */
  apparentArea: number;
  detectionConfidence: number;
  /** Frame quality at the moment of detection, carried for scoring. */
  frameQuality: number;
  materialHint?: string;
  damageHints: string[];
}

const round3 = (value: number) => Math.round(value * 1000) / 1000;

/**
 * Splits a detection group into individual sightings. When the backend
 * supplied masks they are used verbatim; otherwise the group box is divided
 * evenly, which keeps per-instance sizes plausible rather than identical.
 */
export function segmentDetection(
  detection: BackendDetection,
  viewpoint: VisionViewpoint,
  frameQuality: number,
): InstanceSighting[] {
  const count = Math.max(1, Math.round(detection.count));
  const masks =
    detection.masks && detection.masks.length === count
      ? detection.masks
      : Array.from({ length: count }, (_, index) => {
          const width = detection.box.w / count;
          return {
            x: round3(detection.box.x + width * index),
            y: detection.box.y,
            w: round3(width),
            h: detection.box.h,
          };
        });

  return masks.map((box, index) => {
    const seed = hashString(`${detection.photoId}:${detection.classKey}:${index}`);
    // Instances of the same class vary slightly; identical numbers would be a lie.
    const jitter = 1 + (((seed % 9) - 4) / 100);
    return {
      id: `inst-${detection.photoId}-${detection.classKey}-${index + 1}`,
      photoId: detection.photoId,
      viewpoint,
      classKey: detection.classKey,
      label: detection.label,
      ordinal: index + 1,
      box,
      apparentArea: round3(Math.max(0.001, box.w * box.h * jitter)),
      detectionConfidence: detection.confidence,
      frameQuality,
      ...(detection.materialHint ? { materialHint: detection.materialHint } : {}),
      damageHints: detection.damageHints ?? [],
    };
  });
}

export function segmentDetections(
  detections: BackendDetection[],
  images: VisionImage[],
  processed: ProcessedImage[],
): InstanceSighting[] {
  const viewpoints = new Map<string, VisionViewpoint>(
    images.map((image) => [image.photo.id, image.viewpoint]),
  );
  const quality = new Map(processed.map((entry) => [entry.photoId, entry.quality]));

  return detections.flatMap((detection) =>
    segmentDetection(
      detection,
      viewpoints.get(detection.photoId) ?? "unknown",
      quality.get(detection.photoId) ?? 0.6,
    ),
  );
}
