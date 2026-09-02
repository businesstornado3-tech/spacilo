/**
 * Mock dimension provider.
 *
 * Estimates room geometry from photos and reports each measurement with its
 * own plausible range and confidence. Nothing here measures anything — the
 * numbers are proposals a human confirms, which is exactly the contract.
 */
import { simulationVisionProvider } from "@/lib/vision/simulation-provider";

import type { DimensionEstimate, SpaceEstimate, VisionPhoto } from "../contracts";
import { IntelligenceError } from "../errors";
import { buildMeta, throwIfAborted } from "../meta";
import type { DimensionProvider, ProviderRequest } from "../providers";

const IDENTITY = {
  id: "mock-dimensions-v1",
  label: "EarnRoom AI measurements (simulation)",
  model: "earnroom-simulation",
  remote: false,
} as const;

/** More angles, steadier estimate — and a tighter band around it. */
function toleranceFor(photoCount: number): number {
  if (photoCount >= 4) return 0.06;
  if (photoCount >= 2) return 0.1;
  return 0.16;
}

function estimate(
  id: string,
  label: string,
  valueCm: number,
  tolerance: number,
  basis: string,
): DimensionEstimate {
  return {
    id,
    label,
    valueCm: Math.round(valueCm),
    minCm: Math.round(valueCm * (1 - tolerance)),
    maxCm: Math.round(valueCm * (1 + tolerance)),
    confidence: Math.round((1 - tolerance * 2) * 100) / 100,
    basis,
  };
}

export const mockDimensionProvider: DimensionProvider = {
  ...IDENTITY,
  capabilities: ["dimensions"],

  async estimateDimensions({ photos, spaceType }, request?: ProviderRequest): Promise<SpaceEstimate> {
    const startedAt = Date.now();
    throwIfAborted(request?.signal);
    if (photos.length === 0) throw new IntelligenceError("dimension_unknown");

    const scan = await simulationVisionProvider.analyseSpace(photos, spaceType);
    throwIfAborted(request?.signal);
    const tolerance = toleranceFor(photos.length);
    const basis = `${photos.length} photo${photos.length === 1 ? "" : "s"} of the space`;

    return {
      dimensions: [
        estimate("width", "Width", scan.widthM * 100, tolerance, basis),
        estimate("depth", "Depth", scan.depthM * 100, tolerance, basis),
        estimate("ceilingHeight", "Ceiling height", scan.ceilingHeightM * 100, tolerance, basis),
        estimate("doorWidth", "Door opening", Math.min(scan.widthM * 100, 240) * 0.42, tolerance + 0.04, basis),
      ],
      usableVolumeM3: scan.usableVolumeM3,
      meta: buildMeta(IDENTITY, startedAt),
    };
  },

  async estimateOne(id: string, photos: VisionPhoto[]): Promise<DimensionEstimate> {
    const result = await this.estimateDimensions({ photos });
    const match = result.dimensions.find((dimension) => dimension.id === id);
    if (!match) throw new IntelligenceError("dimension_unknown");
    return match;
  },
};
