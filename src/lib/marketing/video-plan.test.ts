import { describe, expect, it } from "vitest";

import { coreAssetFor, generationSavings, planGenerations } from "./video-plan";
import type { PlatformAsset } from "./types";

const asset = (
  id: string,
  platform: PlatformAsset["platform"],
  aspect: PlatformAsset["aspect"],
  seconds: number,
): PlatformAsset =>
  ({
    id,
    platform,
    aspect,
    seconds,
    title: "t",
    description: "d",
    caption: "c",
    cta: "See spare space near you",
    hashtags: [],
    scenes: [],
  }) as unknown as PlatformAsset;

const assets = [
  asset("a-tiktok", "tiktok", "9:16", 15),
  asset("a-reels", "instagram", "9:16", 12),
  asset("a-shorts", "youtube_shorts", "9:16", 16),
  asset("a-youtube", "youtube", "16:9", 30),
];

describe("shared-core generation planning", () => {
  it("groups same-shape, same-length assets into one generation", () => {
    const groups = planGenerations(assets);
    expect(groups).toHaveLength(2);
    const vertical = groups.find((group) => group.aspect === "9:16")!;
    expect(vertical.primary.id).toBe("a-shorts");
    expect(vertical.derived.map((entry) => entry.id).sort()).toEqual(["a-reels", "a-tiktok"]);
  });

  it("keeps a different frame shape as its own generation", () => {
    const groups = planGenerations(assets);
    expect(groups.some((group) => group.aspect === "16:9" && group.derived.length === 0)).toBe(
      true,
    );
  });

  it("splits runtimes that differ too much to share footage", () => {
    const groups = planGenerations([
      asset("short", "tiktok", "9:16", 6),
      asset("long", "instagram", "9:16", 30),
    ]);
    expect(groups).toHaveLength(2);
  });

  it("reports which asset carries the core film", () => {
    expect(coreAssetFor(assets, "a-shorts")).toEqual({ coreAssetId: "a-shorts", shared: false });
    expect(coreAssetFor(assets, "a-tiktok")).toEqual({ coreAssetId: "a-shorts", shared: true });
    expect(coreAssetFor(assets, "missing")).toBeNull();
  });

  it("counts the generations saved against one film per platform", () => {
    expect(generationSavings(assets)).toEqual({ generations: 2, renders: 4, saved: 2 });
  });
});
