import { describe, expect, it } from "vitest";

import { element, elementsForText, hasElement } from "./library";
import { applyBranding, brandRules } from "./platform-branding";
import { buildAnimatedPlan, planDigest } from "./plan";
import { FRAME_SIZES } from "./types";
import type { CampaignStory, PlatformAsset, PlatformId } from "../types";

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

function asset(platform: PlatformId, seconds = 12): PlatformAsset {
  return {
    id: `asset-${platform}`,
    platform,
    aspect: platform === "youtube" ? "16:9" : "9:16",
    hook: story.hook,
    title: "Storage between completion dates",
    description: "What to do when the dates do not line up.",
    caption: "Spare space near you",
    hashtags: ["#storage"],
    cta: "Find storage near you",
    seconds,
    state: "GENERATED",
    videoUrl: null,
    thumbnailUrl: null,
    videoStatus: "NOT_REQUESTED",
  };
}

describe("animated scene planning", () => {
  it("turns every story scene into an animated scene and adds a closing card", () => {
    const plan = buildAnimatedPlan({ campaignId: "c1", asset: asset("instagram"), story });
    expect(plan.scenes.length).toBe(story.scenes.length + 1);
    expect(plan.scenes.at(-1)?.caption.emphasis).toBe("brand");
    expect(plan.scenes.every((scene) => scene.seconds >= 1)).toBe(true);
  });

  it("uses the story's own words — it never invents a message", () => {
    const plan = buildAnimatedPlan({ campaignId: "c1", asset: asset("instagram"), story });
    // On screen the line is shortened to its opening clause, but every word of
    // it comes from the campaign copy: nothing new is written here.
    const hook = plan.scenes[0]!.caption.text;
    expect(hook.length).toBeGreaterThan(0);
    expect(story.hook.startsWith(hook)).toBe(true);
    const second = plan.scenes[1]!.caption.text;
    expect(story.scenes[1]!.caption.startsWith(second)).toBe(true);
    const last = plan.scenes[story.scenes.length - 1];
    expect(last?.subCaption?.text).toBe("Find storage near you");
  });


  it("matches the platform's frame shape", () => {
    const vertical = buildAnimatedPlan({ campaignId: "c1", asset: asset("tiktok"), story });
    const wide = buildAnimatedPlan({ campaignId: "c1", asset: asset("youtube"), story });
    expect(vertical.width).toBe(FRAME_SIZES["9:16"].width);
    expect(vertical.height).toBe(FRAME_SIZES["9:16"].height);
    expect(wide.width).toBeGreaterThan(wide.height);
  });

  it("never plans a video longer than the platform allows", () => {
    const plan = buildAnimatedPlan({ campaignId: "c1", asset: asset("tiktok", 300), story });
    expect(plan.seconds).toBeLessThanOrEqual(brandRules("tiktok").maxSeconds + 0.5);
  });

  it("is deterministic — the same story always plans the same video", () => {
    const first = buildAnimatedPlan({ campaignId: "c1", asset: asset("instagram"), story });
    const second = buildAnimatedPlan({ campaignId: "c1", asset: asset("instagram"), story });
    expect(first.digest).toBe(second.digest);
    expect(planDigest({ a: 1 })).not.toBe(planDigest({ a: 2 }));
  });

  it("draws something for every scene, so no frame is ever blank", () => {
    const plan = buildAnimatedPlan({ campaignId: "c1", asset: asset("instagram"), story });
    for (const scene of plan.scenes.slice(0, story.scenes.length)) {
      expect(scene.items.length).toBeGreaterThan(0);
      for (const item of scene.items) expect(hasElement(item.element)).toBe(true);
    }
  });
});

describe("platform branding rules", () => {
  it("applies full EarnRoom branding where the platform allows it", () => {
    const branding = applyBranding({
      platform: "youtube",
      tagline: "Make space earn.",
      website: "earnroom.co.uk",
      cta: "Find storage",
    });
    expect(branding.showWatermark).toBe(true);
    expect(branding.website).toBe("earnroom.co.uk");
    expect(branding.notes).toHaveLength(0);
  });

  it("produces a compliant TikTok version and says what it left out", () => {
    const branding = applyBranding({
      platform: "tiktok",
      tagline: "Make space earn.",
      website: "earnroom.co.uk",
      cta: "Find storage",
    });
    expect(branding.showWatermark).toBe(false);
    expect(branding.website).toBeNull();
    expect(branding.notes.join(" ")).toMatch(/watermark/i);

    const plan = buildAnimatedPlan({ campaignId: "c1", asset: asset("tiktok"), story });
    expect(plan.branding.showWatermark).toBe(false);
    expect(JSON.stringify(plan.scenes)).not.toContain("earnroom.co.uk");
  });
});

describe("illustration library", () => {
  it("picks illustrations from the story's own words", () => {
    expect(elementsForText("A spare garage sitting empty")).toContain("garage");
    expect(elementsForText("boxes and clutter everywhere")).toContain("box-stack");
    expect(elementsForText("students leaving at the end of term")).toContain("university");
  });

  it("always returns a drawable illustration, even for unfamiliar words", () => {
    expect(elementsForText("zzzz")).toHaveLength(1);
    expect(element("not-a-real-element").shapes.length).toBeGreaterThan(0);
  });

  it("every illustration stays inside its own box", () => {
    for (const id of ["garage", "house", "uk-map", "earning", "family", "calendar"]) {
      for (const shape of element(id).shapes) {
        const points =
          shape.kind === "path"
            ? shape.points
            : shape.kind === "circle"
              ? [{ x: shape.x, y: shape.y }]
              : [
                  { x: shape.x, y: shape.y },
                  { x: shape.x + shape.w, y: shape.y + shape.h },
                ];
        for (const point of points) {
          expect(point.x).toBeGreaterThanOrEqual(-0.01);
          expect(point.x).toBeLessThanOrEqual(1.01);
          expect(point.y).toBeGreaterThanOrEqual(-0.01);
          expect(point.y).toBeLessThanOrEqual(1.01);
        }
      }
    }
  });
});
