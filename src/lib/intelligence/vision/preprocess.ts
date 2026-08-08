/**
 * Stage 1 — image pre-processing.
 *
 * Deterministic diagnostics derived from the photo's own metadata, so the same
 * photo always scores the same way. A real provider replaces this file with
 * pixel analysis and every later stage is unaffected: they consume
 * `VisionDiagnostics`, not pixels.
 */
import { hashString } from "@/lib/vision/hash";

import type { VisionDiagnostics, VisionImage, VisionImageIssue } from "./contracts";

/** Below this, detection confidence is discounted rather than trusted. */
export const MIN_USABLE_QUALITY = 0.45;

const unit = (seed: number, offset: number) => ((seed >> offset) % 1000) / 1000;

function normaliseRotation(rotation: number): number {
  const value = ((Math.round(rotation / 90) * 90) % 360 + 360) % 360;
  return value;
}

/** Signature used for duplicate detection — same shot, same signature. */
export function photoSignature(image: VisionImage): string {
  const { photo } = image;
  // Size bucketed to 4KB so a re-encode of the same shot still matches.
  return `${photo.name.toLowerCase().replace(/\s+/g, "")}:${Math.round(photo.sizeBytes / 4096)}`;
}

export function preprocessImage(
  image: VisionImage,
  seenSignatures: Map<string, string>,
): VisionDiagnostics {
  const seed = hashString(`${image.photo.id}:${image.photo.name}:${image.photo.sizeBytes}`);
  const rotation = normaliseRotation(image.photo.rotation);

  // Larger files carry more detail; the seed adds stable per-photo variation.
  const detail = Math.min(1, image.photo.sizeBytes / 900_000);
  const sharpness = Math.round((0.45 + detail * 0.35 + unit(seed, 0) * 0.2) * 100) / 100;
  const brightness = Math.round((0.3 + unit(seed, 4) * 0.65) * 100) / 100;
  const shadow = Math.round(unit(seed, 8) * 0.5 * 100) / 100;
  const subjectSeparation = Math.round((0.5 + unit(seed, 12) * 0.45) * 100) / 100;

  const issues: VisionImageIssue[] = [];
  const notes: string[] = [];

  if (sharpness < 0.55) {
    issues.push("blurred");
    notes.push("Looks soft — a steadier shot would raise confidence.");
  }
  if (brightness < 0.42) {
    issues.push("low_light");
    notes.push("Low light detected; brightness normalised before detection.");
  }
  if (brightness > 0.88) {
    issues.push("over_exposed");
    notes.push("Bright highlights flattened before detection.");
  }
  if (shadow > 0.38) {
    issues.push("heavy_shadow");
    notes.push("Strong shadow reduced so edges stay readable.");
  }
  if (subjectSeparation < 0.6) {
    issues.push("tight_crop");
    notes.push("Subject sits close to the frame edge — step back if you can.");
  }

  const signature = photoSignature(image);
  const duplicateOf = seenSignatures.get(signature) ?? null;
  if (duplicateOf) {
    issues.push("duplicate");
    notes.push("Near-identical to an earlier photo; used only to confirm, not to count twice.");
  } else {
    seenSignatures.set(signature, image.photo.id);
  }

  // Perspective correction only helps when the frame is sharp enough to warp.
  const perspectiveCorrected = sharpness >= 0.6 && rotation % 180 === 0;

  const quality =
    Math.round(
      (sharpness * 0.4 +
        (1 - Math.abs(brightness - 0.62) * 1.4) * 0.25 +
        (1 - shadow) * 0.15 +
        subjectSeparation * 0.2) *
        100,
    ) / 100;

  return {
    photoId: image.photo.id,
    quality: Math.min(1, Math.max(0, quality)),
    sharpness,
    brightness,
    shadow,
    subjectSeparation,
    rotation,
    perspectiveCorrected,
    issues,
    duplicateOf,
    notes,
  };
}

/** Diagnostics for a whole set, with duplicates resolved across the set. */
export function preprocessImages(images: VisionImage[]): VisionDiagnostics[] {
  const seen = new Map<string, string>();
  return images.map((image) => preprocessImage(image, seen));
}
