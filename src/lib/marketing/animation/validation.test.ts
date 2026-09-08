import { describe, expect, it } from "vitest";

import { buildAnimatedPlan, castForStory, rolesForStory } from "./plan";
import { COMPOSITIONS, type AnimatedPlan } from "./types";
import { qualityStatus, validatePlan, validateRender, type RenderOutcome } from "./validation";
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
      visual: "Boxes and clutter fill the hallway",
      voiceover: "There is nowhere to put any of it.",
      caption: "Nowhere to put it",
      seconds: 4,
    },
    {
      index: 2,
      visual: "A map of nearby spare garages",
      voiceover: "Someone near you has a garage sitting empty.",
      caption: "Spare space near you",
      seconds: 4,
    },
    {
      index: 3,
      visual: "Boxes safely stored, handover complete",
      voiceover: "Book the dates you need and move on.",
      caption: "Book only the weeks you need",
      seconds: 4,
    },
  ],
  renterCta: "Find storage near you",
  hostCta: "List your space",
  illustrative: true,
  seconds: 16,
};

function asset(platform: PlatformId, aspect: PlatformAsset["aspect"] = "9:16"): PlatformAsset {
  return {
    id: `asset-${platform}-${aspect}`,
    platform,
    aspect,
    hook: story.hook,
    title: "Storage between completion dates",
    description: "What to do when the dates do not line up.",
    caption: "Spare space near you",
    hashtags: ["#storage"],
    cta: "Find storage near you",
    seconds: 20,
    state: "GENERATED",
    videoUrl: null,
    thumbnailUrl: null,
    videoStatus: "NOT_REQUESTED",
  };
}

const plan = () => buildAnimatedPlan({ campaignId: "c1", asset: asset("instagram"), story });

function goodRender(input: AnimatedPlan): RenderOutcome {
  return {
    width: input.width,
    height: input.height,
    seconds: input.seconds,
    bytes: 900_000,
    frames: Math.round(input.seconds * input.fps),
    logoFrames: Math.round(input.seconds * input.fps),
    smallestLogoPx: 136,
    artworkLoaded: true,
  };
}

describe("real EarnRoom branding", () => {
  it("carries the official artwork files, not a text stand-in", () => {
    const built = plan();
    expect(built.brand.logoUrl).toMatch(/^\/__l5e\/assets-v1\//);
    expect(built.brand.wordmarkUrl).toMatch(/^\/__l5e\/assets-v1\//);
    expect(built.scenes.some((scene) => scene.logo === "endcard")).toBe(true);
  });

  it("spells EarnRoom correctly everywhere and never invents a brand", () => {
    const built = plan();
    const text = JSON.stringify(built.scenes).split(built.brand.website).join(" ");
    for (const match of text.match(/earnroom/gi) ?? []) expect(match).toBe("EarnRoom");
    expect(validatePlan(built).passed).toBe(true);
  });

  it("rejects a misspelled brand name", () => {
    const built = plan();
    const broken = {
      ...built,
      scenes: built.scenes.map((scene, index) =>
        index === 0 ? { ...scene, caption: { ...scene.caption, text: "Earnroom helps" } } : scene,
      ),
    } as AnimatedPlan;
    expect(validatePlan(broken).failures.join(" ")).toMatch(/misspelled/i);
  });

  it("keeps the call to action and the web address", () => {
    const built = plan();
    expect(built.branding.cta).toBe("Find storage near you");
    expect(built.brand.website).toContain("earnroom");
    expect(JSON.stringify(built.scenes)).toContain(built.branding.cta);
  });
});

describe("campaign story ordering", () => {
  it("runs problem, middle, both sides, then the branded card", () => {
    const roles = plan().scenes.map((scene) => scene.role);
    expect(roles[0]).toBe("problem");
    expect(roles.at(-1)).toBe("endcard");
    expect(roles.at(-2)).toBe("both");
    expect(roles.slice(0, -1)).not.toContain("endcard");
  });

  it("always opens on the problem and closes on both sides", () => {
    expect(rolesForStory(3)).toEqual(["problem", "pain", "both"]);
    expect(rolesForStory(6).at(-1)).toBe("both");
    expect(rolesForStory(8)[0]).toBe("problem");
  });

  it("keeps the same cast across the campaign, so scenes belong together", () => {
    const lead = castForStory(story)[0]!;
    const built = plan();
    const storyScenes = built.scenes.slice(0, story.scenes.length);
    expect(storyScenes.every((scene) => scene.items.some((i) => i.element === lead))).toBe(true);
  });

  it("rejects a plan that does not open on the problem", () => {
    const built = plan();
    const broken = {
      ...built,
      scenes: built.scenes.map((scene, index) =>
        index === 0 ? { ...scene, role: "host" as const } : scene,
      ),
    } as AnimatedPlan;
    expect(validatePlan(broken).failures.join(" ")).toMatch(/open on the campaign's problem/i);
  });
});

describe("aspect ratio composition", () => {
  it("recomposes each shape rather than cropping one master", () => {
    const tall = buildAnimatedPlan({ campaignId: "c1", asset: asset("instagram", "9:16"), story });
    const square = buildAnimatedPlan({ campaignId: "c1", asset: asset("facebook", "1:1"), story });
    const wide = buildAnimatedPlan({ campaignId: "c1", asset: asset("youtube", "16:9"), story });

    expect(tall.composition.captionY).not.toBe(wide.composition.captionY);
    expect(tall.composition.hookScale).toBeGreaterThan(wide.composition.hookScale);
    expect(square.composition).toEqual(COMPOSITIONS["1:1"]);
    // The illustration stage is placed differently in each shape.
    const stageY = (p: AnimatedPlan) => p.scenes[0]!.items[0]!.y;
    expect(new Set([stageY(tall), stageY(square), stageY(wide)]).size).toBeGreaterThan(1);
  });

  it("fails when the frame does not match the requested shape", () => {
    const broken = { ...plan(), width: 400 } as AnimatedPlan;
    expect(validatePlan(broken).passed).toBe(false);
  });
});

describe("placeholder and empty content", () => {
  it("refuses placeholder wording", () => {
    const built = plan();
    const broken = {
      ...built,
      scenes: built.scenes.map((scene, index) =>
        index === 1 ? { ...scene, caption: { ...scene.caption, text: "TODO caption" } } : scene,
      ),
    } as AnimatedPlan;
    expect(validatePlan(broken).failures.join(" ")).toMatch(/placeholder wording/i);
  });

  it("refuses an empty scene", () => {
    const built = plan();
    const broken = {
      ...built,
      scenes: built.scenes.map((scene, index) =>
        index === 1 ? { ...scene, items: [] } : scene,
      ),
    } as AnimatedPlan;
    expect(validatePlan(broken).failures.join(" ")).toMatch(/nothing in it/i);
  });
});

describe("finished file checks", () => {
  it("passes a real branded render", () => {
    const built = plan();
    expect(validateRender(built, goodRender(built)).passed).toBe(true);
  });

  it("fails when the real logo never made it into the frames", () => {
    const built = plan();
    const check = validateRender(built, { ...goodRender(built), logoFrames: 0 });
    expect(check.failures.join(" ")).toMatch(/logo does not appear/i);
  });

  it("fails when the artwork could not be loaded", () => {
    const built = plan();
    const check = validateRender(built, { ...goodRender(built), artworkLoaded: false });
    expect(check.passed).toBe(false);
  });

  it("fails an unreadably small logo, a wrong size, or an empty file", () => {
    const built = plan();
    expect(validateRender(built, { ...goodRender(built), smallestLogoPx: 12 }).passed).toBe(false);
    expect(validateRender(built, { ...goodRender(built), width: 100 }).passed).toBe(false);
    expect(validateRender(built, { ...goodRender(built), bytes: 900 }).passed).toBe(false);
  });
});

describe("quality status", () => {
  it("is only production ready once both checks pass", () => {
    const built = plan();
    const planCheck = validatePlan(built);
    expect(qualityStatus({ plan: planCheck })).toBe("DRAFT");
    expect(
      qualityStatus({ plan: planCheck, render: validateRender(built, goodRender(built)) }),
    ).toBe("PRODUCTION_READY");
  });

  it("never calls a failed render production ready", () => {
    const built = plan();
    const bad = validateRender(built, { ...goodRender(built), logoFrames: 0 });
    expect(qualityStatus({ plan: validatePlan(built), render: bad })).toBe("VALIDATION_FAILED");
    expect(qualityStatus({ plan: { passed: false, failures: ["x"] } })).toBe("VALIDATION_FAILED");
  });
});
