/**
 * Mock vision + space-analysis providers.
 *
 * Deterministic by design: the same photos always produce the same proposals,
 * so the product is honest, demoable offline and unit-testable. These wrap the
 * existing EarnRoom Vision simulation rather than reimplementing it — one
 * detection engine, one taxonomy, one set of numbers.
 */
import { summariseDetections } from "@/lib/vision/inventory";
import { simulationVisionProvider } from "@/lib/vision/simulation-provider";
import { isAcceptedImage } from "@/lib/vision/types";

import type { DetectedInventory, DetectedSpace, VisionPhoto } from "../contracts";
import { IntelligenceError } from "../errors";
import { buildMeta, throwIfAborted } from "../meta";
import type { ProviderRequest, SpaceAnalysisProvider, VisionProvider } from "../providers";

const IDENTITY = {
  id: "mock-vision-v1",
  label: "EarnRoom AI (simulation)",
  model: "earnroom-simulation",
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

export const mockVisionProvider: VisionProvider = {
  ...IDENTITY,
  capabilities: ["vision"],

  async analyseBelongings(photos, request?: ProviderRequest): Promise<DetectedInventory> {
    const startedAt = Date.now();
    throwIfAborted(request?.signal);
    assertPhotos(photos);

    const result = await simulationVisionProvider.analyseBelongings(photos);
    throwIfAborted(request?.signal);
    const summary = summariseDetections(result.objects);

    return {
      objects: result.objects,
      itemCount: summary.itemCount,
      volumeM3: summary.volumeM3,
      weightKg: summary.weightKg,
      photoIds: result.photoIds,
      meta: buildMeta(IDENTITY, startedAt),
    };
  },
};

export const mockSpaceAnalysisProvider: SpaceAnalysisProvider = {
  ...IDENTITY,
  id: "mock-space-analysis-v1",
  label: "EarnRoom AI space analysis (simulation)",
  capabilities: ["space-analysis", "dimensions"],

  async analyseSpace(photos, spaceType, request?: ProviderRequest): Promise<DetectedSpace> {
    const startedAt = Date.now();
    throwIfAborted(request?.signal);
    assertPhotos(photos);

    const scan = await simulationVisionProvider.analyseSpace(photos, spaceType);
    throwIfAborted(request?.signal);

    return {
      widthM: scan.widthM,
      depthM: scan.depthM,
      ceilingHeightM: scan.ceilingHeightM,
      usableAreaM2: scan.usableAreaM2,
      usableVolumeM3: scan.usableVolumeM3,
      observations: scan.observations,
      meta: buildMeta({ id: "mock-space-analysis-v1", model: IDENTITY.model }, startedAt),
    };
  },
};

/** Mean AI confidence behind a set of detections, on the platform scale. */
export function detectionConfidence(inventory: DetectedInventory): number {
  return summariseDetections(inventory.objects).averageConfidence;
}
