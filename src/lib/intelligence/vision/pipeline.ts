/**
 * The Vision Processing Pipeline.
 *
 *   Image → Pre-processing → Detection → Classification → Dimensions →
 *   Volume → Weight → Fragility → Inventory → Confidence
 *
 * and, through the Intelligence Platform, onward into Planner →
 * Recommendations → Booking.
 *
 * Every stage is a named, independently replaceable function held in one
 * registry. Swapping detection for a real model is `setVisionStage("detect",
 * fn)`; nothing else in the codebase changes, because callers only ever see
 * `VisionInventory`.
 */
import type {
  VisionDetection,
  VisionDiagnostics,
  VisionImage,
  VisionInventory,
  VisionObject,
  VisionPhoto,
  VisionRelationship,
  VisionScene,
  VisionViewpoint,
} from "./contracts";
import { VISION_CONTRACT_VERSION } from "./contracts";
import { inventoryConfidence } from "./confidence";
import { detectObjects } from "./detect";
import { fuseDetections, type FusedDetection } from "./fusion";
import {
  buildObject,
  inventoryExplanations,
  totalsFor,
  viewpointsIn,
} from "./inventory";
import { preprocessImages } from "./preprocess";
import { buildRelationships } from "./relationships";
import { analyseScene } from "./scene";

export const VISION_ENGINE_ID = "spacilo-vision-engine-v1";
export const VISION_ENGINE_VERSION = "1.0.0";

/* -------------------------------------------------------- stage registry */

export interface VisionStages {
  preprocess: (images: VisionImage[]) => VisionDiagnostics[];
  detect: (images: VisionImage[], diagnostics: VisionDiagnostics[]) => VisionDetection[];
  fuse: (detections: VisionDetection[], diagnostics: VisionDiagnostics[]) => FusedDetection[];
  /** Classification, dimensions, volume, weight and fragility for one object. */
  buildObject: (detection: FusedDetection) => VisionObject;
  relationships: (
    objects: VisionObject[],
    detections: Map<string, FusedDetection>,
  ) => VisionRelationship[];
  scene: (
    images: VisionImage[],
    diagnostics: VisionDiagnostics[],
    spaceType?: string,
  ) => VisionScene;
}

const defaults: VisionStages = {
  preprocess: preprocessImages,
  detect: detectObjects,
  fuse: fuseDetections,
  buildObject,
  relationships: buildRelationships,
  scene: analyseScene,
};

let stages: VisionStages = { ...defaults };

export function setVisionStage<K extends keyof VisionStages>(
  stage: K,
  implementation: VisionStages[K],
): void {
  stages = { ...stages, [stage]: implementation };
}

export function resetVisionStages(): void {
  stages = { ...defaults };
}

export function visionStageNames(): string[] {
  return Object.keys(stages);
}

/* ------------------------------------------------------------- viewpoint */

const VIEWPOINT_HINTS: Array<[RegExp, VisionViewpoint]> = [
  [/front/i, "front"],
  [/(rear|back)/i, "rear"],
  [/left/i, "left"],
  [/right/i, "right"],
  [/garage/i, "garage"],
  [/loft|attic/i, "loft"],
  [/garden|shed/i, "garden"],
  [/room[\s_-]?1|bedroom/i, "room-1"],
  [/room[\s_-]?2|living/i, "room-2"],
];

/** Reads a viewpoint from the file name when the caller has not supplied one. */
export function inferViewpoint(photo: VisionPhoto): VisionViewpoint {
  for (const [pattern, viewpoint] of VIEWPOINT_HINTS) {
    if (pattern.test(photo.name)) return viewpoint;
  }
  return "unknown";
}

export function toVisionImages(
  photos: VisionPhoto[],
  viewpoints?: Partial<Record<string, VisionViewpoint>>,
): VisionImage[] {
  return photos.map((photo) => ({
    photo,
    viewpoint: viewpoints?.[photo.id] ?? inferViewpoint(photo),
  }));
}

/* ------------------------------------------------------------------- run */

export interface VisionRunInput {
  photos: VisionPhoto[];
  /** Optional explicit viewpoint per photo id. Inferred when omitted. */
  viewpoints?: Partial<Record<string, VisionViewpoint>>;
  signal?: AbortSignal;
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Vision run cancelled", "AbortError");
}

/** Runs the whole pipeline and returns one intelligent inventory. */
export function runVisionPipeline(input: VisionRunInput): VisionInventory {
  const startedAt = Date.now();
  const images = toVisionImages(input.photos, input.viewpoints);

  assertNotAborted(input.signal);
  const diagnostics = stages.preprocess(images);

  assertNotAborted(input.signal);
  const detections = stages.detect(images, diagnostics);

  assertNotAborted(input.signal);
  const fused = stages.fuse(detections, diagnostics);

  assertNotAborted(input.signal);
  const objects = fused.map((detection) => stages.buildObject(detection));

  const byClass = new Map(fused.map((entry) => [entry.classKey, entry] as const));
  const relationships = stages.relationships(objects, byClass);

  const totals = totalsFor(objects);

  return {
    objects,
    relationships,
    diagnostics,
    ...totals,
    confidence: inventoryConfidence(objects),
    photoIds: input.photos.map((photo) => photo.id),
    viewpoints: viewpointsIn(objects),
    explanations: inventoryExplanations(objects, input.photos.length),
    metadata: {
      engine: VISION_ENGINE_ID,
      engineVersion: VISION_ENGINE_VERSION,
      detector: "simulation",
      contractVersion: VISION_CONTRACT_VERSION,
      producedAt: startedAt,
      latencyMs: Date.now() - startedAt,
      photoCount: input.photos.length,
      stages: visionStageNames(),
    },
  };
}

/** Structural read of a space. Prepared for host analysis; no UI consumes it yet. */
export function runSceneAnalysis(input: {
  photos: VisionPhoto[];
  spaceType?: string;
  signal?: AbortSignal;
}): VisionScene {
  const images = toVisionImages(input.photos);
  assertNotAborted(input.signal);
  const diagnostics = stages.preprocess(images);
  assertNotAborted(input.signal);
  return stages.scene(images, diagnostics, input.spaceType);
}
