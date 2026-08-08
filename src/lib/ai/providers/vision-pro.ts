/**
 * Production vision providers.
 *
 * Wraps the Phase 6C vision platform behind the AI provider contract so the
 * orchestrator, cache, queue, rate limits and metrics all apply unchanged.
 * These providers sit ahead of the legacy engine in configuration; if a
 * backend is unavailable the platform's own fallback chain handles it, and if
 * the whole provider fails the orchestrator falls through to the old engine.
 *
 * The outputs are the same `DetectedInventory` and `DetectedSpace` the product
 * already renders, so no screen changes.
 */
import type { DetectedInventory, DetectedSpace, VisionPhoto } from "@/lib/intelligence/contracts";
import type { VisionViewpoint } from "@/lib/intelligence/vision/contracts";

import { explain, factor } from "../core/explain";
import { registerAiProvider } from "../core/provider-manager";
import type { AiProvider } from "../core/types";

import { analyseVision } from "../vision/analyse";
import { toDetectedInventory, toDetectedSpace } from "../vision/adapters";
import { installVisionBackends } from "../vision/install";
import { VISION_PLATFORM_VERSION, type VisionAnalysis, type VisionImage } from "../vision/types";

const MODEL = `spacilo-vision-${VISION_PLATFORM_VERSION}`;

export interface VisionProInput {
  photos: VisionPhoto[];
  /** Where each photo was taken from, keyed by photo id. */
  viewpoints?: Record<string, VisionViewpoint>;
  spaceType?: string;
  backendId?: string;
}

function toImages(input: VisionProInput): VisionImage[] {
  return input.photos.map((photo) => ({
    photo,
    viewpoint: input.viewpoints?.[photo.id] ?? "unknown",
  }));
}

function visionExplanation(analysis: VisionAnalysis, headline: string) {
  return explain({
    reason: headline,
    confidence: analysis.confidence,
    factors: [
      factor("Photos analysed", `${analysis.images.length} supplied, ${analysis.images.filter((image) => !image.duplicateOf).length} usable`, 0.35),
      factor("Repeat sightings merged", `${analysis.duplicatesMerged}`, 0.2),
      factor("Items needing a check", `${analysis.reviewCount}`, 0.2),
      factor("Engine", `${analysis.meta.vendor} · ${analysis.meta.model}`, 0.25),
    ],
  });
}

export const visionProProvider: AiProvider<VisionProInput, DetectedInventory> = {
  id: "spacilo-vision-pro",
  kind: "vision",
  model: MODEL,
  remote: false,
  capabilities: ["vision"],
  async run(input, context) {
    context.onProgress?.(0.15);
    const analysis = await analyseVision({
      images: toImages(input),
      ...(input.backendId ? { backendId: input.backendId } : {}),
      ...(context.signal ? { signal: context.signal } : {}),
    });
    context.onProgress?.(1);

    return {
      result: toDetectedInventory(analysis),
      confidence: analysis.confidence,
      explanation: visionExplanation(
        analysis,
        `Recognised ${analysis.itemCount} individual item${analysis.itemCount === 1 ? "" : "s"} across ${analysis.images.length} photo${analysis.images.length === 1 ? "" : "s"}.`,
      ),
    };
  },
};

export const scenePro: AiProvider<VisionProInput, DetectedSpace> = {
  id: "spacilo-scene-pro",
  kind: "image-analysis",
  model: MODEL,
  remote: false,
  capabilities: ["space-analysis"],
  async run(input, context) {
    context.onProgress?.(0.2);
    const analysis = await analyseVision({
      images: toImages(input),
      scene: true,
      ...(input.spaceType ? { spaceType: input.spaceType } : {}),
      ...(input.backendId ? { backendId: input.backendId } : {}),
      ...(context.signal ? { signal: context.signal } : {}),
    });
    const space = toDetectedSpace(analysis);
    if (!space) throw new Error("scene reading unavailable");
    context.onProgress?.(1);

    return {
      result: space,
      confidence: analysis.scene?.confidence ?? analysis.confidence,
      explanation: visionExplanation(
        analysis,
        `Read the structure of the space from ${analysis.images.length} photo${analysis.images.length === 1 ? "" : "s"}.`,
      ),
    };
  },
};

export function installVisionProProviders(): void {
  installVisionBackends();
  registerAiProvider(visionProProvider);
  registerAiProvider(scenePro);
}
