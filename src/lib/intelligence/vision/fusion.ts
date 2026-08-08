/**
 * Stage 4 — multi-image fusion.
 *
 * The same wardrobe photographed from the front and the left is one wardrobe.
 * Fusion merges detections of the same class across viewpoints, keeps the
 * highest confidence rather than averaging it away, and takes the largest
 * count seen in any single frame instead of adding frames together — adding
 * would double-count the same objects.
 *
 * Photos flagged as duplicates confirm an object but never raise its count.
 */
import type { VisionDetection, VisionDiagnostics, VisionViewpoint } from "./contracts";

export interface FusedDetection {
  classKey: string;
  label: string;
  quantity: number;
  detectionConfidence: number;
  photoIds: string[];
  viewpoints: VisionViewpoint[];
  detectionIds: string[];
  /** Frames the class appeared in, duplicates excluded. */
  sightings: number;
  boxes: VisionDetection["box"][];
}

/** Agreement across independent frames is real evidence — worth a small lift. */
const AGREEMENT_BONUS = 0.03;
const MAX_CONFIDENCE = 0.99;

export function fuseDetections(
  detections: VisionDetection[],
  diagnostics: VisionDiagnostics[],
): FusedDetection[] {
  const duplicatePhotoIds = new Set(
    diagnostics.filter((entry) => entry.duplicateOf !== null).map((entry) => entry.photoId),
  );

  const byClass = new Map<string, FusedDetection>();

  for (const detection of detections) {
    const isDuplicateFrame = duplicatePhotoIds.has(detection.photoId);
    const existing = byClass.get(detection.classKey);

    if (!existing) {
      byClass.set(detection.classKey, {
        classKey: detection.classKey,
        label: detection.label,
        quantity: detection.count,
        detectionConfidence: detection.detectionConfidence,
        photoIds: [detection.photoId],
        viewpoints: [detection.viewpoint],
        detectionIds: [detection.id],
        sightings: isDuplicateFrame ? 0 : 1,
        boxes: [detection.box],
      });
      continue;
    }

    existing.detectionConfidence = Math.max(
      existing.detectionConfidence,
      detection.detectionConfidence,
    );
    // Largest count in any one frame — never the sum across frames.
    existing.quantity = Math.max(existing.quantity, detection.count);
    if (!existing.photoIds.includes(detection.photoId)) existing.photoIds.push(detection.photoId);
    if (!existing.viewpoints.includes(detection.viewpoint)) {
      existing.viewpoints.push(detection.viewpoint);
    }
    existing.detectionIds.push(detection.id);
    existing.boxes.push(detection.box);
    if (!isDuplicateFrame) existing.sightings += 1;
  }

  return [...byClass.values()]
    .map((entry) => ({
      ...entry,
      detectionConfidence:
        Math.round(
          Math.min(
            MAX_CONFIDENCE,
            entry.detectionConfidence + Math.max(0, entry.sightings - 1) * AGREEMENT_BONUS,
          ) * 100,
        ) / 100,
    }))
    .sort((a, b) => b.detectionConfidence - a.detectionConfidence);
}
