/**
 * Generation planning — one core film, many platform renders.
 *
 * GPU time is the real cost of self-hosted generation, so EarnRoom does not
 * generate an independent film for every platform. Assets that share a frame
 * shape and a comparable length share one AI generation; each platform then
 * gets its own branding, safe area, length trim and end card at render time.
 *
 * A genuinely separate generation happens only where the composition really
 * differs — a different aspect ratio, or a materially different runtime.
 */
import type { PlatformAsset } from "./types";

export type GenerationGroup = {
  /** Stable key for the shared core generation. */
  key: string;
  aspect: PlatformAsset["aspect"];
  /** Longest asset in the group; shorter platforms are trimmed from it. */
  seconds: number;
  /** The asset whose prompt drives the core generation. */
  primary: PlatformAsset;
  /** Platform renders derived from the same core footage. */
  derived: readonly PlatformAsset[];
};

/** Assets whose runtimes differ by more than this cannot share a core film. */
const RUNTIME_TOLERANCE_SECONDS = 6;

export function planGenerations(assets: readonly PlatformAsset[]): GenerationGroup[] {
  const groups: GenerationGroup[] = [];

  for (const asset of [...assets].sort((a, b) => b.seconds - a.seconds)) {
    const match = groups.find(
      (group) =>
        group.aspect === asset.aspect &&
        Math.abs(group.seconds - asset.seconds) <= RUNTIME_TOLERANCE_SECONDS,
    );
    if (match) {
      (match.derived as PlatformAsset[]).push(asset);
      continue;
    }
    groups.push({
      key: `${asset.aspect.replace(":", "x")}-${asset.seconds}s`,
      aspect: asset.aspect,
      seconds: asset.seconds,
      primary: asset,
      derived: [],
    });
  }

  return groups;
}

/** The asset a given platform asset should reuse footage from, if any. */
export function coreAssetFor(
  assets: readonly PlatformAsset[],
  assetId: string,
): { coreAssetId: string; shared: boolean } | null {
  for (const group of planGenerations(assets)) {
    if (group.primary.id === assetId) return { coreAssetId: assetId, shared: false };
    if (group.derived.some((entry) => entry.id === assetId)) {
      return { coreAssetId: group.primary.id, shared: true };
    }
  }
  return null;
}

/** How many AI generations a campaign needs, versus one per platform. */
export function generationSavings(assets: readonly PlatformAsset[]): {
  generations: number;
  renders: number;
  saved: number;
} {
  const generations = planGenerations(assets).length;
  return { generations, renders: assets.length, saved: Math.max(0, assets.length - generations) };
}
