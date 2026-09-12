import { describe, expect, it } from "vitest";

import { buildAudioPlan, validateAudioPlan } from "./audio";
import { buildAnimatedPlan } from "./plan";
import type { CampaignStory, PlatformAsset } from "../types";

const story: CampaignStory = {
  format: "PROBLEM_SOLUTION",
  hook: "Your move completes on Friday. The new place isn't ready until the 20th.",
  scenes: [
    {
      index: 0,
      visual: "A family stands beside boxes in an empty house",
      voiceover: "Completion moved. Everything you own has nowhere to go.",
      caption: "The keys go back on Friday",
      seconds: 4,
    },
    {
      index: 1,
      visual: "A map of nearby spare garages",
      voiceover: "Someone near you has a garage sitting empty.",
      caption: "Spare space near you",
      seconds: 4,
    },
    {
      index: 2,
      visual: "Boxes safely stored, handover complete",
      voiceover: "Book the dates you need and move on.",
      caption: "Book only the weeks you need",
      seconds: 4,
    },
  ],
  renterCta: "Find storage near you",
  hostCta: "List your space",
  illustrative: true,
  seconds: 12,
};

const asset: PlatformAsset = {
  id: "asset-instagram",
  platform: "instagram",
  aspect: "9:16",
  hook: story.hook,
  title: "Storage between completion dates",
  description: "What to do when the dates do not line up.",
  caption: "Spare space near you",
  hashtags: ["#storage"],
  cta: "Find storage near you",
  seconds: 12,
  state: "GENERATED",
  videoUrl: null,
  thumbnailUrl: null,
  videoStatus: "NOT_REQUESTED",
};

describe("browser video soundtrack", () => {
  const plan = buildAnimatedPlan({ campaignId: "c1", asset, story });

  it("runs for the whole film and never past the end of it", () => {
    const check = validateAudioPlan(plan.audio, plan.seconds);
    expect(check.passed).toBe(true);
    expect(plan.audio.seconds).toBeCloseTo(plan.seconds, 1);
    expect(plan.audio.sfx.every((cue) => cue.at <= plan.seconds)).toBe(true);
  });

  it("has music and sound effects, and never claims a spoken voice", () => {
    expect(plan.audio.music.length).toBe(plan.scenes.length);
    expect(plan.audio.sfx.length).toBeGreaterThan(0);
    expect(plan.audio.spokenNarration).toBe(false);
  });

  it("keeps the music under the sound effects so nothing is buried", () => {
    expect(plan.audio.mix.music).toBeLessThan(plan.audio.mix.sfx);
  });

  it("lands on the brand chord at the closing card", () => {
    const last = plan.audio.music.at(-1)!;
    expect(last.root).toBe(48);
    expect(plan.audio.sfx.some((cue) => cue.kind === "brandResolve")).toBe(true);
  });

  it("refuses a soundtrack that does not match the film", () => {
    const short = buildAudioPlan(plan.scenes.slice(0, 1));
    expect(validateAudioPlan(short, plan.seconds).passed).toBe(false);
  });
});

describe("browser video length and frame", () => {
  it("makes a thirty second film at the full vertical frame", () => {
    const plan = buildAnimatedPlan({ campaignId: "c1", asset, story });
    expect(plan.seconds).toBeGreaterThanOrEqual(29);
    expect(plan.seconds).toBeLessThanOrEqual(31);
    expect(plan.width).toBe(1080);
    expect(plan.height).toBe(1920);
    expect(plan.frameQuality).toBe("TARGET");
  });

  it("keeps everything the same in the smaller fallback frame", () => {
    const full = buildAnimatedPlan({ campaignId: "c1", asset, story });
    const small = buildAnimatedPlan({ campaignId: "c1", asset, story, frameQuality: "FALLBACK" });
    expect(small.width).toBe(720);
    expect(small.height).toBe(1280);
    expect(small.seconds).toBeCloseTo(full.seconds, 2);
    expect(small.scenes.length).toBe(full.scenes.length);
    expect(small.scenes.map((scene) => scene.caption.text)).toEqual(
      full.scenes.map((scene) => scene.caption.text),
    );
  });

  it("varies how scenes arrive instead of cutting the same way every time", () => {
    const plan = buildAnimatedPlan({ campaignId: "c1", asset, story });
    const arrivals = new Set(plan.scenes.slice(1).map((scene) => scene.transition));
    expect(arrivals.size).toBeGreaterThan(1);
  });

  it("keeps the exact campaign and video identity", () => {
    const plan = buildAnimatedPlan({ campaignId: "c1", asset, story });
    expect(plan.campaignId).toBe("c1");
    expect(plan.assetId).toBe(asset.id);
  });
});
