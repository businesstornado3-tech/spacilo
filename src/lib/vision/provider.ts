/**
 * Vision provider contract and registry.
 *
 * Everything above this file consumes `VisionResult` / `SpaceScanResult` and
 * never knows which engine produced them. Swapping the simulation for a real
 * API is a registration change, not a redesign.
 */
import type { SpaceScanResult, VisionPhoto, VisionResult } from "./types";

export interface VisionProvider {
  readonly id: string;
  readonly model: string;
  analyseBelongings(photos: VisionPhoto[]): Promise<VisionResult>;
  analyseSpace(photos: VisionPhoto[], spaceType?: string): Promise<SpaceScanResult>;
}

export type VisionProviderId = "simulation" | (string & {});

let override: VisionProvider | null = null;

/** Test/host hook — registers a different engine for the whole app. */
export function registerVisionProvider(provider: VisionProvider | null): void {
  override = provider;
}

/**
 * Lazily resolves the active provider. The simulation is code-split so the
 * planner and homepage stay fast until someone actually scans something.
 */
export async function getVisionProvider(): Promise<VisionProvider> {
  if (override) return override;
  const { simulationVisionProvider } = await import("./simulation-provider");
  return simulationVisionProvider;
}
