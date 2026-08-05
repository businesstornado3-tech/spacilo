/**
 * SpaceFit Vision — provider abstraction.
 *
 * Everything outside this folder consumes `VisionResult` and never knows which
 * vision provider produced it. Adding OpenAI (or anything else) later means
 * implementing this interface and registering it below — no changes anywhere
 * in the renter experience.
 */
import type { VisionErrorCategory, VisionResult } from "@/lib/spacefit-vision/schema";
import type { SpaceScanResult } from "@/lib/spacefit-vision/space-schema";

export interface VisionImage {
  /** Stable id used only to map detections back to photos. Not sent verbatim. */
  id: string;
  mimeType: string;
  /** Base64 image bytes, already downscaled by the upload pipeline. */
  base64: string;
}

export interface AnalyseRequest {
  images: VisionImage[];
  /** Catalogue keys the provider may suggest. */
  catalogueKeys: string[];
  categories: readonly string[];
}

export interface AnalyseResponse {
  result: VisionResult;
  model: string;
  provider: string;
  promptVersion: string;
  schemaVersion: string;
}

export class VisionProviderError extends Error {
  constructor(
    readonly category: VisionErrorCategory,
    message: string,
  ) {
    super(message);
    this.name = "VisionProviderError";
  }
}

/** Host-side space scan. Carries no catalogue — a room isn't an item list. */
export interface AnalyseSpaceRequest {
  images: VisionImage[];
  /** Optional host-declared space type, used only as context for the model. */
  spaceType?: string | null;
}

export interface AnalyseSpaceResponse {
  result: SpaceScanResult;
  model: string;
  provider: string;
  promptVersion: string;
  schemaVersion: string;
}

export interface SpaceFitVisionProvider {
  readonly id: string;
  readonly model: string;
  analyseInventoryPhotos(request: AnalyseRequest): Promise<AnalyseResponse>;
  /** Estimates room geometry and obstacles. Results are proposals only. */
  analyseSpacePhotos(request: AnalyseSpaceRequest): Promise<AnalyseSpaceResponse>;
}

/**
 * Chooses the configured provider. `SPACEFIT_VISION_PROVIDER` defaults to
 * gemini; the model is configurable through `SPACEFIT_VISION_MODEL`.
 */
export async function getVisionProvider(): Promise<SpaceFitVisionProvider> {
  const id = (process.env["SPACEFIT_VISION_PROVIDER"] ?? "gemini").toLowerCase();
  switch (id) {
    case "gemini": {
      const { createGeminiVisionProvider } = await import("@/lib/spacefit-vision/gemini.server");
      return createGeminiVisionProvider();
    }
    default:
      throw new VisionProviderError("not_configured", `Unknown vision provider "${id}".`);
  }
}
