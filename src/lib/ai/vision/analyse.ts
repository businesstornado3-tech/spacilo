/**
 * Vision analysis orchestration.
 *
 * The one entry point for production vision. It runs the full pipeline —
 * validate, pre-process, detect, segment, read text, fuse, attribute, score,
 * and optionally read the scene — against whichever backend is configured,
 * falling back down the chain when a hosted model is unavailable.
 *
 * Everything above this file consumes `VisionAnalysis`. Swapping the model
 * behind it changes no contract and no screen.
 */
import { ACCEPTED_IMAGE_TYPES, MAX_SCAN_PHOTOS } from "@/lib/vision/types";

import {
  fallbackChain,
  selectVisionBackend,
  type BackendOcrRead,
  type BackendRequest,
  type BackendSceneReading,
  type VisionBackend,
} from "./backends";
import { buildInstance } from "./attributes";
import { fuseSightings } from "./fusion";
import { recordVisionRun } from "./metrics";
import { averageQuality, preprocessImages } from "./preprocess";
import { buildSceneUnderstanding } from "./scene";
import { segmentDetections } from "./segmentation";
import {
  VISION_PLATFORM_VERSION,
  type OcrRead,
  type SceneUnderstanding,
  type VisionAnalysis,
  type VisionImage,
  type VisionInstance,
} from "./types";

export interface VisionAnalysisRequest {
  images: VisionImage[];
  /** Ask for structural scene reading as well as objects (host flows). */
  scene?: boolean;
  spaceType?: string;
  /** Force a specific backend; otherwise the preferred healthy one is used. */
  backendId?: string;
  signal?: AbortSignal;
}

export class VisionInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VisionInputError";
  }
}

/** Guards what may reach a model: type, count and obvious payload abuse. */
export function validateImages(images: VisionImage[]): void {
  if (images.length === 0) throw new VisionInputError("Add at least one photo to analyse.");
  if (images.length > MAX_SCAN_PHOTOS) {
    throw new VisionInputError(`Up to ${MAX_SCAN_PHOTOS} photos can be analysed at once.`);
  }
  for (const image of images) {
    const mime = image.photo.mimeType.toLowerCase();
    if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(mime)) {
      throw new VisionInputError(`${image.photo.name}: that file type can't be analysed.`);
    }
    if (image.photo.sizeBytes <= 0) {
      throw new VisionInputError(`${image.photo.name}: the file looks empty.`);
    }
  }
}

const round2 = (value: number) => Math.round(value * 100) / 100;

function toOcrReads(reads: BackendOcrRead[]): OcrRead[] {
  return reads.map((read, index) => ({
    id: `ocr-${read.photoId}-${index + 1}`,
    photoId: read.photoId,
    kind: read.kind,
    text: read.text,
    confidence: read.confidence,
    box: read.box,
  }));
}

function groupInstances(instances: VisionInstance[]): VisionAnalysis["groups"] {
  const byClass = new Map<string, { label: string; ids: string[] }>();
  for (const instance of instances) {
    const entry = byClass.get(instance.classKey) ?? {
      label: instance.label.replace(/\s\d+$/, ""),
      ids: [],
    };
    entry.ids.push(instance.id);
    byClass.set(instance.classKey, entry);
  }
  return [...byClass.entries()]
    .map(([classKey, entry]) => ({
      classKey,
      label: entry.label,
      quantity: entry.ids.length,
      instanceIds: entry.ids,
    }))
    .sort((a, b) => b.quantity - a.quantity || a.label.localeCompare(b.label));
}

async function safely<T>(run: () => Promise<T>): Promise<T | null> {
  try {
    return await run();
  } catch {
    return null;
  }
}

export async function analyseVision(request: VisionAnalysisRequest): Promise<VisionAnalysis> {
  validateImages(request.images);
  const startedAt = Date.now();

  const processed = preprocessImages(request.images);
  const usable = processed.filter((entry) => !entry.duplicateOf);
  const stages = ["validate", "preprocess"];

  const primary = selectVisionBackend(request.backendId);
  if (!primary) throw new VisionInputError("No vision backend is configured.");

  const backendRequest: BackendRequest = {
    images: request.images,
    processed,
    ...(request.spaceType ? { spaceType: request.spaceType } : {}),
    ...(request.scene ? { scene: true } : {}),
    ...(request.signal ? { signal: request.signal } : {}),
  };

  // Try the preferred backend, then each fallback, before giving up.
  let backend: VisionBackend = primary;
  let detections = await safely(() => primary.detect(backendRequest));
  let fallbackUsed = false;

  if (!detections) {
    for (const candidate of fallbackChain(primary.id)) {
      const attempt = await safely(() => candidate.detect(backendRequest));
      if (attempt) {
        backend = candidate;
        detections = attempt;
        fallbackUsed = true;
        break;
      }
    }
  }

  if (!detections) {
    recordVisionRun({
      backendId: primary.id,
      vendor: primary.vendor,
      photoCount: request.images.length,
      instanceCount: 0,
      latencyMs: Date.now() - startedAt,
      confidence: 0,
      fallbackUsed: true,
      failed: true,
      at: Date.now(),
    });
    throw new VisionInputError("Analysis is unavailable right now — please try again.");
  }
  stages.push("detect");

  const sightings = segmentDetections(detections, request.images, processed);
  stages.push("segment");

  const ocrRaw = backend.readText ? await safely(() => backend.readText!(backendRequest)) : null;
  const ocr = toOcrReads(ocrRaw ?? []);
  if (ocrRaw) stages.push("ocr");

  const { instances: fused, duplicatesMerged } = fuseSightings(sightings);
  stages.push("fuse");

  const instances = fused.map((instance) => buildInstance(instance, ocr));
  stages.push("attributes");

  let scene: SceneUnderstanding | null = null;
  if (request.scene && backend.readScene) {
    const reading: BackendSceneReading | null = await safely(() => backend.readScene!(backendRequest));
    if (reading) {
      scene = buildSceneUnderstanding(reading, usable, request.spaceType);
      stages.push("scene");
    }
  }

  const volumeM3 = Math.round(
    instances.reduce((sum, instance) => sum + instance.dimensions.volumeM3, 0) * 1000,
  ) / 1000;
  const weightKg =
    Math.round(instances.reduce((sum, instance) => sum + instance.weight.totalKg, 0) * 10) / 10;
  const damage = instances.flatMap((instance) => instance.damage);
  const reviewCount = instances.filter((instance) => instance.confidence.needsReview).length;

  const quality = averageQuality(usable);
  const confidence =
    instances.length === 0
      ? 0
      : round2(
          (instances.reduce((sum, instance) => sum + instance.confidence.overall, 0) /
            instances.length) *
            (0.85 + quality * 0.15) *
            (fallbackUsed ? 0.9 : 1),
        );

  const warnings: string[] = [];
  const blurred = processed.filter((entry) => entry.blurred).length;
  if (blurred > 0) warnings.push(`${blurred} photo${blurred === 1 ? "" : "s"} looked soft — steadier shots raise confidence.`);
  if (processed.length - usable.length > 0) {
    warnings.push(`${processed.length - usable.length} near-duplicate photo${processed.length - usable.length === 1 ? "" : "s"} used to confirm rather than to count again.`);
  }
  if (fallbackUsed) warnings.push("A backup analysis engine was used, so confidence is held lower.");
  if (reviewCount > 0) warnings.push(`${reviewCount} item${reviewCount === 1 ? "" : "s"} need a quick check before they count.`);

  const explanations = [
    `${instances.length} individual item${instances.length === 1 ? "" : "s"} proposed from ${usable.length} usable photo${usable.length === 1 ? "" : "s"}.`,
    duplicatesMerged > 0
      ? `${duplicatesMerged} repeat sighting${duplicatesMerged === 1 ? "" : "s"} merged so nothing is counted twice.`
      : "No repeat sightings to merge.",
    `Everything here is an estimate you can edit — nothing has been measured.`,
  ];

  const latencyMs = Date.now() - startedAt;
  recordVisionRun({
    backendId: backend.id,
    vendor: backend.vendor,
    photoCount: request.images.length,
    instanceCount: instances.length,
    latencyMs,
    confidence,
    fallbackUsed,
    failed: false,
    at: Date.now(),
  });

  return {
    instances,
    groups: groupInstances(instances),
    images: processed,
    ocr,
    damage,
    scene,
    itemCount: instances.length,
    volumeM3,
    weightKg,
    fragileCount: instances.filter((instance) =>
      instance.fragility.grade === "fragile" || instance.fragility.grade === "very_fragile",
    ).length,
    reviewCount,
    duplicatesMerged,
    confidence,
    photoIds: processed.map((entry) => entry.photoId),
    explanations,
    warnings,
    meta: {
      platformVersion: VISION_PLATFORM_VERSION,
      backendId: backend.id,
      vendor: backend.vendor,
      model: backend.model,
      remote: backend.remote,
      producedAt: Date.now(),
      latencyMs,
      photoCount: request.images.length,
      stages,
      fallbackUsed,
    },
  };
}
