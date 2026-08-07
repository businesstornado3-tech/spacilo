/**
 * Vision Engine → Intelligence Platform providers.
 *
 * The engine only ever reaches the product through the platform's provider
 * slots, so no component, hook or route knows the engine exists. Registering a
 * real vendor later replaces these two objects and nothing else.
 */
import { summariseDetections } from "@/lib/vision/inventory";

import type { DetectedInventory, DetectedSpace } from "../contracts";
import { IntelligenceError } from "../errors";
import { buildMeta, throwIfAborted } from "../meta";
import type {
  ProviderRequest,
  SpaceAnalysisProvider,
  VisionProvider as PlatformVisionProvider,
} from "../providers";
import { registerProvider } from "../registry";
import { isAcceptedImage } from "@/lib/vision/types";

import { toDetectedObjects } from "./inventory";
import {
  VISION_ENGINE_ID,
  VISION_ENGINE_VERSION,
  runSceneAnalysis,
  runVisionPipeline,
} from "./pipeline";
import { sceneGeometry } from "./scene";
import type { VisionPhoto } from "./contracts";

const IDENTITY = {
  id: VISION_ENGINE_ID,
  label: "Spacilo Vision Engine",
  model: `vision-engine-${VISION_ENGINE_VERSION}`,
  remote: false,
} as const;

function assertPhotos(photos: VisionPhoto[]): void {
  if (photos.length === 0) throw new IntelligenceError("vision_failed", "Add at least one photo.");
  for (const photo of photos) {
    if (!isAcceptedImage({ type: photo.mimeType, name: photo.name })) {
      throw new IntelligenceError("unsupported_image");
    }
  }
}

export const visionEngineProvider: PlatformVisionProvider = {
  ...IDENTITY,
  capabilities: ["vision"],

  async analyseBelongings(photos, request?: ProviderRequest): Promise<DetectedInventory> {
    const startedAt = Date.now();
    throwIfAborted(request?.signal);
    assertPhotos(photos);

    const inventory = runVisionPipeline(
      request?.signal ? { photos, signal: request.signal } : { photos },
    );
    throwIfAborted(request?.signal);

    const objects = toDetectedObjects(inventory);
    const summary = summariseDetections(objects);

    return {
      objects,
      itemCount: summary.itemCount,
      volumeM3: summary.volumeM3,
      weightKg: summary.weightKg,
      photoIds: inventory.photoIds,
      meta: buildMeta(IDENTITY, startedAt),
    };
  },
};

export const visionEngineSpaceProvider: SpaceAnalysisProvider = {
  ...IDENTITY,
  id: `${VISION_ENGINE_ID}-space`,
  label: "Spacilo Vision Engine (space)",
  capabilities: ["space-analysis", "dimensions"],

  async analyseSpace(photos, spaceType, request?: ProviderRequest): Promise<DetectedSpace> {
    const startedAt = Date.now();
    throwIfAborted(request?.signal);
    assertPhotos(photos);

    const scene = runSceneAnalysis({
      photos,
      ...(spaceType ? { spaceType } : {}),
      ...(request?.signal ? { signal: request.signal } : {}),
    });
    throwIfAborted(request?.signal);
    const geometry = sceneGeometry(scene);

    return {
      widthM: geometry.widthM,
      depthM: geometry.depthM,
      ceilingHeightM: geometry.ceilingHeightM,
      usableAreaM2: scene.usableAreaM2,
      usableVolumeM3: geometry.usableVolumeM3,
      observations: scene.notes,
      meta: buildMeta(
        { id: `${VISION_ENGINE_ID}-space`, model: IDENTITY.model },
        startedAt,
      ),
    };
  },
};

/**
 * Makes the engine the platform's active vision intelligence. Called once at
 * start-up; a future vendor provider is registered the same way.
 */
export function installVisionEngine(): void {
  registerProvider("vision", visionEngineProvider);
  registerProvider("spaceAnalysis", visionEngineSpaceProvider);
}
