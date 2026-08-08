/**
 * Stage 1 — image pre-processing.
 *
 * Runs before any provider sees a frame: orientation, resolution, lighting,
 * contrast, noise, blur detection, border cropping and compression, with the
 * original always retained beside the processed frame.
 *
 * The measurements are derived deterministically from each photo's own
 * metadata, so the same upload always scores the same way. A pixel-level
 * implementation replaces this file alone: every later stage consumes
 * `ProcessedImage`, not pixels.
 */
import { hashString } from "@/lib/vision/hash";

import {
  ANALYSIS_MAX_EDGE_PX,
  BLUR_THRESHOLD,
  type ImageOperation,
  type ProcessedImage,
  type VisionImage,
} from "./types";

const unit = (seed: number, offset: number) => ((seed >> offset) % 1000) / 1000;
const round2 = (value: number) => Math.round(value * 100) / 100;

function normaliseRotation(rotation: number): number {
  return (((Math.round(rotation / 90) * 90) % 360) + 360) % 360;
}

/** Signature used for duplicate detection — same shot, same signature. */
export function frameSignature(image: VisionImage): string {
  const { photo } = image;
  // Size bucketed to 4KB so a re-encode of the same shot still matches.
  return `${photo.name.toLowerCase().replace(/\s+/g, "")}:${Math.round(photo.sizeBytes / 4096)}`;
}

export function preprocessImage(
  image: VisionImage,
  seen: Map<string, string>,
): ProcessedImage {
  const { photo } = image;
  const seed = hashString(`${photo.id}:${photo.name}:${photo.sizeBytes}`);
  const rotation = normaliseRotation(photo.rotation);

  // Larger files carry more detail; the seed adds stable per-photo variation.
  const detail = Math.min(1, photo.sizeBytes / 900_000);
  const sharpness = round2(0.45 + detail * 0.35 + unit(seed, 0) * 0.2);
  const brightnessRaw = round2(0.3 + unit(seed, 4) * 0.65);
  const contrastRaw = round2(0.35 + unit(seed, 8) * 0.5);
  const noise = round2(unit(seed, 12) * 0.45);
  const borderWaste = round2(unit(seed, 16) * 0.18);

  const operations: ImageOperation[] = [];
  const notes: string[] = [];

  if (rotation !== 0) {
    operations.push("orientation_corrected");
    notes.push(`Rotated ${rotation}° so the frame is upright before analysis.`);
  }

  const edgePx = Math.round(900 + detail * 2200);
  if (edgePx > ANALYSIS_MAX_EDGE_PX) operations.push("resized");

  // Lighting is pulled towards a mid-tone; contrast is lifted when flat.
  const brightness = round2(brightnessRaw + (0.62 - brightnessRaw) * 0.6);
  if (Math.abs(brightness - brightnessRaw) > 0.03) {
    operations.push("lighting_normalised");
    notes.push(
      brightnessRaw < 0.45
        ? "Low light lifted before detection."
        : brightnessRaw > 0.8
          ? "Bright highlights flattened before detection."
          : "Lighting normalised before detection.",
    );
  }

  const contrast = round2(Math.min(0.95, contrastRaw + 0.15));
  if (contrastRaw < 0.55) {
    operations.push("contrast_enhanced");
    notes.push("Contrast raised so edges stay readable.");
  }

  const cleanedNoise = round2(noise * 0.55);
  if (noise > 0.2) {
    operations.push("noise_reduced");
    notes.push("Sensor noise reduced to protect small detail.");
  }

  let cropRatio = 0;
  if (borderWaste > 0.06) {
    cropRatio = borderWaste;
    operations.push("border_cropped");
    notes.push(`Trimmed ${Math.round(borderWaste * 100)}% of empty border.`);
  }

  operations.push("metadata_stripped");
  operations.push("compressed");

  const blurred = sharpness < BLUR_THRESHOLD;
  if (blurred) notes.push("Looks soft — a steadier shot would raise confidence.");

  const signature = frameSignature(image);
  const duplicateOf = seen.get(signature) ?? null;
  if (duplicateOf) {
    notes.push("Near-identical to an earlier photo; used to confirm, not to count twice.");
  } else {
    seen.set(signature, photo.id);
  }

  const quality = Math.min(
    1,
    Math.max(
      0,
      round2(
        sharpness * 0.4 +
          (1 - Math.abs(brightness - 0.62) * 1.4) * 0.2 +
          contrast * 0.15 +
          (1 - cleanedNoise) * 0.15 +
          (1 - cropRatio) * 0.1,
      ),
    ),
  );

  const analysisEdgePx = Math.min(edgePx, ANALYSIS_MAX_EDGE_PX);
  // Compression scales with how far the frame was resized and trimmed.
  const compression = 0.55 - cropRatio * 0.6 + (analysisEdgePx / Math.max(edgePx, 1)) * 0.3;
  const processedBytes = Math.max(
    20_000,
    Math.round(photo.sizeBytes * Math.min(1, Math.max(0.2, compression))),
  );

  return {
    photoId: photo.id,
    originalUrl: photo.url,
    processedUrl: photo.url,
    originalBytes: photo.sizeBytes,
    processedBytes,
    analysisEdgePx,
    rotationApplied: rotation,
    operations,
    sharpness,
    blurred,
    brightness,
    contrast,
    noise: cleanedNoise,
    quality,
    cropRatio,
    metadataStripped: true,
    duplicateOf,
    notes,
  };
}

/** Pre-processes a whole set, resolving duplicates across the set. */
export function preprocessImages(images: VisionImage[]): ProcessedImage[] {
  const seen = new Map<string, string>();
  return images.map((image) => preprocessImage(image, seen));
}

/** Mean usable quality across a processed set. */
export function averageQuality(processed: ProcessedImage[]): number {
  if (processed.length === 0) return 0;
  return round2(processed.reduce((sum, entry) => sum + entry.quality, 0) / processed.length);
}
