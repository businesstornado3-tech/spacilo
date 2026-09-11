import { describe, expect, it } from "vitest";

import { brand } from "@/config/brand";

import type { CampaignStory, MarketingAudience, PlatformAsset, PlatformId } from "../types";
import {
  CHARACTER_IDS,
  character,
  characterForRole,
  expression,
  hasCharacter,
  isExpression,
  isPose,
  pose,
} from "./characters";
import { ENVIRONMENT_IDS, environment, hasEnvironment } from "./environments";
import { buildAnimatedPlan } from "./plan";
import {
  STORY_TEMPLATE_IDS,
  beatsOf,
  buildStoryboard,
  compressBeats,
  selectTemplate,
  sideForAudience,
  template,
} from "./story";
import { scorePlan, validatePlan, validateRender } from "./validation";

function story(lines: string[], seconds = 4): CampaignStory {
  return {
    format: "PROBLEM_SOLUTION",
    hook: lines[0] ?? "Nowhere to put it all",
    scenes: lines.map((caption, index) => ({
      index,
      visual: caption,
      voiceover: caption,
      caption,
      seconds,
    })),
    renterCta: "Find storage near you",
    hostCta: "List your space",
    illustrative: true,
    seconds: lines.length * seconds,
  };
}

function asset(platform: PlatformId, aspect: PlatformAsset["aspect"] = "9:16"): PlatformAsset {
  return {
    id: `asset-${platform}-${aspect}`,
    platform,
    aspect,
    hook: "Moving house?",
    title: "Storage while you move house",
    description: "Somewhere local to keep things between dates.",
    caption: "Spare space near you",
    hashtags: ["#storage"],
    cta: "Find storage near you",
    seconds: 18,
    state: "GENERATED",
    videoUrl: null,
    thumbnailUrl: null,
    videoStatus: "NOT_REQUESTED",
  };
}

const movingStory = story([
  "Boxes arrive but the new place is not ready",
  "There is nowhere left to put anything",
  "Looking for storage nearby",
  "A neighbour has a spare garage",
  "Everything is stored safely",
]);

function plan(overrides: Partial<Parameters<typeof buildAnimatedPlan>[0]> = {}) {
  return buildAnimatedPlan({
    campaignId: "campaign-1",
    asset: asset("instagram"),
    story: movingStory,
    audience: "renter" as MarketingAudience,
    topic: "moving house storage",
    ...overrides,
  });
}

describe("character library", () => {
  it("keeps a compact cast of fictional characters", () => {
    expect(CHARACTER_IDS.length).toBeGreaterThanOrEqual(3);
    expect(CHARACTER_IDS.length).toBeLessThanOrEqual(8);
  });

  it("gives every character a fixed look, so continuity is automatic", () => {
    for (const id of CHARACTER_IDS) {
      const design = character(id);
      expect(design.skin).toMatch(/^#/);
      expect(design.top).toMatch(/^#/);
      expect(design.hair).toMatch(/^#/);
    }
  });

  it("selects a character by the side of the market", () => {
    expect(character(characterForRole("renter")).role).toBe("renter");
    expect(character(characterForRole("host")).role).toBe("host");
  });

  it("rejects poses and expressions that do not exist", () => {
    expect(isPose("carryingBoxes")).toBe(true);
    expect(isPose("breakdancing")).toBe(false);
    expect(isExpression("relieved")).toBe(true);
    expect(isExpression("furious")).toBe(false);
    expect(hasCharacter("NOT_A_CHARACTER")).toBe(false);
    expect(pose("standing").carry).toBe("none");
    expect(expression("happy").mouthCurve).toBeGreaterThan(0);
  });
});

describe("environment library", () => {
  it("gives every environment three depth layers and a floor", () => {
    for (const id of ENVIRONMENT_IDS) {
      const env = environment(id);
      expect(env.ground).toBeGreaterThan(0.5);
      expect(env.ground).toBeLessThan(1);
      expect(Array.isArray(env.back)).toBe(true);
      expect(Array.isArray(env.mid)).toBe(true);
      expect(Array.isArray(env.fore)).toBe(true);
    }
    expect(hasEnvironment("ENV_GARAGE")).toBe(true);
    expect(hasEnvironment("ENV_MOON_BASE")).toBe(false);
  });
});

describe("story engine", () => {
  it("reads the side of the market from the campaign audience", () => {
    expect(sideForAudience("host" as MarketingAudience)).toBe("host");
    expect(sideForAudience("renter" as MarketingAudience)).toBe("renter");
    expect(sideForAudience(null)).toBe("renter");
  });

  it("chooses the moving-house template for a moving campaign", () => {
    expect(selectTemplate({ text: "moving house next month", side: "renter" })).toBe(
      "MOVING_HOUSE",
    );
  });

  it("chooses a host template for an unused garage campaign", () => {
    expect(selectTemplate({ text: "your garage is sitting empty", side: "host" })).toBe(
      "GARAGE_EARNING",
    );
  });

  it("is deterministic: the same campaign always picks the same template", () => {
    const first = buildStoryboard({ story: movingStory, asset: asset("instagram"), sceneCount: 5 });
    const second = buildStoryboard({
      story: movingStory,
      asset: asset("instagram"),
      sceneCount: 5,
    });
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it("keeps the beginning and the ending when it compresses a story", () => {
    const beats = template("MOVING_HOUSE").beats;
    const short = compressBeats(beats, 3);
    expect(short).toHaveLength(3);
    expect(short[0]).toBe(beats[0]);
    expect(short.at(-1)).toBe(beats.at(-1));
  });

  it("keeps the same characters throughout a campaign", () => {
    const board = buildStoryboard({ story: movingStory, asset: asset("instagram"), sceneCount: 5 });
    expect(board.characters.length).toBeGreaterThan(0);
    expect(board.characters.length).toBeLessThanOrEqual(2);
    for (const scene of board.scenes) {
      for (const member of scene.cast) expect(board.characters).toContain(member.character);
    }
  });

  it("gives every template a beginning, a middle and an end", () => {
    for (const id of STORY_TEMPLATE_IDS) {
      const beats = template(id).beats.map((beat) => beat.beat);
      expect(beats[0] === "hook" || beats[0] === "problem").toBe(true);
      expect(beats).toContain("brand");
      expect(beats.some((beat) => ["discovery", "solution", "connection"].includes(beat))).toBe(
        true,
      );
    }
  });

  it("puts people in the story board it hands to the renderer", () => {
    const board = buildStoryboard({ story: movingStory, asset: asset("instagram"), sceneCount: 5 });
    expect(board.scenes.some((scene) => scene.cast.length > 0)).toBe(true);
    expect(beatsOf(board).length).toBe(5);
  });
});

describe("planned advertisement", () => {
  it("casts characters and sets every scene somewhere real", () => {
    const built = plan();
    expect(built.storyboard.characters.length).toBeGreaterThan(0);
    for (const scene of built.scenes) {
      expect(hasEnvironment(scene.environment)).toBe(true);
      for (const member of scene.cast) expect(hasCharacter(member.character)).toBe(true);
    }
    expect(built.scenes.some((scene) => scene.cast.length > 0)).toBe(true);
  });

  it("closes on the approved tagline, never typed-out branding", () => {
    const built = plan();
    const card = built.scenes.at(-1)!;
    expect(card.role).toBe("endcard");
    expect(card.caption.text).toBe("Make space earn.");
    expect(built.brand.tagline).toBe(brand.tagline);
    expect(built.brand.logoUrl).toBeTruthy();
  });

  it("recomposes for each aspect rather than cropping one master", () => {
    const tall = plan({ asset: asset("instagram", "9:16") });
    const square = plan({ asset: asset("instagram", "1:1") });
    const wide = plan({ asset: asset("youtube", "16:9") });
    expect(tall.width).toBe(720);
    expect(square.width).toBe(720);
    expect(wide.width).toBe(1280);
    expect(
      new Set([tall.composition.captionY, square.composition.captionY, wide.composition.captionY])
        .size,
    ).toBe(3);
  });

  it("passes the deterministic quality gate", () => {
    const built = plan();
    const check = validatePlan(built);
    expect(check.failures).toEqual([]);
    const scores = scorePlan(built);
    expect(scores.BRAND_ACCURACY).toBe(100);
    expect(scores.CHARACTER_CONTINUITY).toBe(100);
    expect(scores.STORY_CONTINUITY).toBe(100);
    expect(scores.SAFE_AREA_COMPLIANCE).toBe(100);
  });

  it("fails when the closing card does not carry the exact tagline", () => {
    const built = plan();
    const broken = {
      ...built,
      scenes: built.scenes.map((scene) =>
        scene.role === "endcard"
          ? { ...scene, caption: { ...scene.caption, text: "Make your space earn" } }
          : scene,
      ),
    };
    expect(validatePlan(broken).passed).toBe(false);
  });

  it("fails when a character stands outside the safe area", () => {
    const built = plan();
    const broken = {
      ...built,
      scenes: built.scenes.map((scene) =>
        scene.cast.length
          ? { ...scene, cast: scene.cast.map((member) => ({ ...member, x: 0.01 })) }
          : scene,
      ),
    };
    expect(validatePlan(broken).failures.join(" ")).toContain("safe area");
  });

  it("fails when the people in the story were never drawn", () => {
    const built = plan();
    const outcome = {
      width: built.width,
      height: built.height,
      seconds: built.seconds,
      bytes: 900_000,
      frames: Math.round(built.seconds * built.fps),
      logoFrames: 40,
      characterFrames: 0,
      smallestLogoPx: 120,
      artworkLoaded: true,
    };
    expect(validateRender(built, outcome).passed).toBe(false);
    expect(validateRender(built, { ...outcome, characterFrames: 300 }).passed).toBe(true);
  });
});

describe("premium advertising qualities", () => {
  it("changes framing across the film instead of holding one shot", () => {
    const built = plan();
    const framings = new Set(
      built.scenes.filter((scene) => scene.role !== "endcard").map((scene) => scene.framing),
    );
    expect(framings.size).toBeGreaterThanOrEqual(3);
    expect(scorePlan(built).SHOT_VARIETY).toBeGreaterThanOrEqual(75);
  });

  it("travels from an unsettled feeling to a settled one", () => {
    const built = plan();
    const moods = built.scenes.map((scene) => scene.mood);
    expect(new Set(moods).size).toBeGreaterThanOrEqual(3);
    expect(["relief", "delight"]).toContain(moods.at(-1));
    expect(scorePlan(built).EMOTIONAL_ARC).toBe(100);
  });

  it("keeps the burned-in line short and takes every word from the campaign", () => {
    const built = plan();
    const source = `${movingStory.hook} ${movingStory.scenes.map((s) => s.caption).join(" ")}`;
    for (const scene of built.scenes) {
      if (scene.role === "endcard") continue;
      expect(scene.caption.text.split(/\s+/).length).toBeLessThanOrEqual(8);
      expect(source).toContain(scene.caption.text);
    }
    expect(scorePlan(built).VISUAL_STORYTELLING).toBe(100);
  });

  it("lets the people act rather than crowding them with badges", () => {
    const built = plan();
    for (const scene of built.scenes) {
      if (!scene.cast.length) continue;
      expect(scene.items.length).toBeLessThanOrEqual(1);
      expect(scene.items.map((item) => item.element)).not.toContain("warning");
    }
  });

  it("fails a plan that holds the same shot and feeling all the way through", () => {
    const built = plan();
    const flat = {
      ...built,
      scenes: built.scenes.map((scene) => ({
        ...scene,
        framing: "medium" as const,
        mood: "tension" as const,
      })),
    };
    const failures = validatePlan(flat).failures.join(" ");
    expect(failures).toContain("framed the same way");
    expect(failures).toContain("emotional change");
  });
});
