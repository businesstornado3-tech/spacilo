/**
 * Vision provider contract and registry.
 *
 * Everything above this file consumes `VisionResult` / `SpaceScanResult` and
 * never knows which engine produced them. Swapping the simulation for a real
 * API is a registration change, not a redesign.
 */
import type { PhotoSelection } from "./selection";
import type { SpaceScanResult, VisionPhoto, VisionResult } from "./types";

/** How much of each photograph the user asked us to look at. */
export type InventoryMode = "selected" | "whole";

export interface AnalyseOptions {
  /** "selected" analyses only the regions the user marked. */
  mode?: InventoryMode;
  /** One selection per photo id, when the user marked regions. */
  selections?: PhotoSelection[];
  /** Called as each real pipeline stage begins, for honest progress. */
  onStage?: (stage: string) => void;
}

export interface VisionProvider {
  readonly id: string;
  readonly model: string;
  analyseBelongings(photos: VisionPhoto[], options?: AnalyseOptions): Promise<VisionResult>;
  analyseSpace(
    photos: VisionPhoto[],
    spaceType?: string,
    options?: AnalyseOptions,
  ): Promise<SpaceScanResult>;
}

export type VisionProviderId = "earnroom-vision-ai" | "simulation" | (string & {});

let override: VisionProvider | null = null;

/** Test/host hook — registers a different engine for the whole app. */
export function registerVisionProvider(provider: VisionProvider | null): void {
  override = provider;
}

/**
 * Lazily resolves the active provider. The production engine analyses the
 * user's real photographs; it is code-split so nothing is downloaded until
 * someone actually scans. The simulation remains available for tests and
 * offline demos, but is never the default — a fabricated inventory must never
 * be presented as a real detection.
 */
export async function getVisionProvider(): Promise<VisionProvider> {
  if (override) return override;
  const { aiVisionProvider } = await import("./ai-provider");
  return aiVisionProvider;
}

