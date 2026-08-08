/**
 * Adapters — production vision output to the shapes the product already renders.
 *
 * Phase 6C replaces the intelligence behind vision, not the interface in front
 * of it. Existing review screens, planner handoff and host space analysis keep
 * consuming `DetectedObject`, `DetectedInventory` and `DetectedSpace`; these
 * functions are the only place the new richer contract is narrowed down.
 */
import { CONTRACT_VERSION, type DetectedInventory, type DetectedSpace, type IntelligenceMeta } from "@/lib/intelligence/contracts";
import type { DetectedObject, SpaceScanResult } from "@/lib/vision/types";

import type { VisionAnalysis, VisionInstance } from "./types";

function meta(analysis: VisionAnalysis): IntelligenceMeta {
  return {
    provider: analysis.meta.backendId,
    model: analysis.meta.model,
    contractVersion: CONTRACT_VERSION,
    producedAt: analysis.meta.producedAt,
    latencyMs: analysis.meta.latencyMs,
  };
}

/** One row per individual object, keeping instance-level detail intact. */
export function toDetectedObjects(analysis: VisionAnalysis): DetectedObject[] {
  return analysis.instances.map((instance: VisionInstance) => ({
    id: instance.id,
    label: instance.label,
    category: instance.category,
    confidence: instance.confidence.overall,
    width: instance.dimensions.widthCm,
    depth: instance.dimensions.depthCm,
    height: instance.dimensions.heightCm,
    weight: instance.weightClass,
    quantity: 1,
    fragile: instance.fragility.grade === "fragile" || instance.fragility.grade === "very_fragile",
    stackable: instance.stacking.stackability !== "not_stackable",
    catalogueId: instance.catalogueId,
    photoIds: [...instance.photoIds],
    source: "ai" as const,
  }));
}

export function toDetectedInventory(analysis: VisionAnalysis): DetectedInventory {
  return {
    objects: toDetectedObjects(analysis),
    itemCount: analysis.itemCount,
    volumeM3: analysis.volumeM3,
    weightKg: analysis.weightKg,
    photoIds: [...analysis.photoIds],
    meta: meta(analysis),
  };
}

const round1 = (value: number) => Math.round(value * 10) / 10;

export function toDetectedSpace(analysis: VisionAnalysis): DetectedSpace | null {
  const scene = analysis.scene;
  if (!scene) return null;
  const ceilingHeightM = round1(scene.spatial.ceilingHeightCm / 100);
  // Recovered from area so the width/depth pair stays consistent with it.
  const depthM = round1(Math.sqrt(scene.spatial.floorAreaM2 * 1.6));
  const widthM = depthM === 0 ? 0 : round1(scene.spatial.floorAreaM2 / depthM);

  return {
    widthM,
    depthM,
    ceilingHeightM,
    usableAreaM2: scene.spatial.usableFloorAreaM2,
    usableVolumeM3: round1(
      scene.spatial.usableFloorAreaM2 * Math.min(ceilingHeightM, 2.4) + scene.spatial.verticalStorageM3,
    ),
    observations: [...scene.explanations, ...scene.accessNotes],
    meta: meta(analysis),
  };
}

/** The host space-scan shape, for screens that already render it. */
export function toSpaceScanResult(
  analysis: VisionAnalysis,
  suitability: SpaceScanResult["suitability"],
): SpaceScanResult | null {
  const space = toDetectedSpace(analysis);
  if (!space || !analysis.scene) return null;
  return {
    usableAreaM2: space.usableAreaM2,
    widthM: space.widthM,
    depthM: space.depthM,
    ceilingHeightM: space.ceilingHeightM,
    usableVolumeM3: space.usableVolumeM3,
    suitability,
    observations: space.observations,
    confidence: analysis.scene.confidence,
    provider: analysis.meta.backendId,
    analysedAt: analysis.meta.producedAt,
  };
}
