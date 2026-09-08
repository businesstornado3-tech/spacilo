/**
 * Turns an existing campaign story into a fully specified animated scene plan.
 *
 * The story, hook, captions and calls to action all come from the Marketing
 * Intelligence that already exists — nothing here decides what to say. This
 * module decides only what moves, where, and for how long, and it does so
 * deterministically: the same story always produces the same plan.
 *
 * The narrative shape is fixed even though the words are not: every plan runs
 * problem → pain → EarnRoom → renter → host → both sides → branded end card,
 * trimmed to however many scenes the campaign actually has.
 *
 * Pure module: no canvas, no network, no clock.
 */
import iconAsset from "@/assets/brand/earnroom-icon-transparent.png.asset.json";
import wordmarkAsset from "@/assets/brand/earnroom-wordmark-transparent.png.asset.json";
import { brand } from "@/config/brand";
import { siteOrigin } from "@/lib/seo/meta";

import type { CampaignStory, MarketingAudience, PlatformAsset, StoryScene } from "../types";
import { buildStoryboard, type StoryboardScene } from "./story";
import { elementsForText } from "./library";
import { applyBranding, brandRules } from "./platform-branding";
import {
  COMPOSITIONS,
  FRAME_SIZES,
  type AnimatedPlan,
  type AnimatedScene,
  type CameraMove,
  type Motion,
  type SceneBackdrop,
  type SceneItem,
  type SceneRole,
} from "./types";

const ENTRANCES: Motion[] = ["rise", "slide-left", "pop", "zoom", "slide-right", "bounce"];

/** The narrative spine. Longer stories repeat the middle, never the ending. */
const SPINE: SceneRole[] = ["problem", "pain", "solution", "renter", "host", "both"];

/** Small, stable digest so an identical plan is recognisable across renders. */
export function planDigest(value: unknown): string {
  const text = JSON.stringify(value);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * Assigns each story scene its job in the narrative. The opening is always the
 * problem and the last story scene always shows both sides, so a video cannot
 * end in the middle of its own argument.
 */
export function rolesForStory(sceneCount: number): SceneRole[] {
  const count = Math.max(1, sceneCount);
  if (count === 1) return ["both"];
  if (count >= SPINE.length) {
    const roles = [...SPINE];
    // Extra scenes extend the middle (the EarnRoom explanation), never the ends.
    while (roles.length < count) roles.splice(3, 0, "solution");
    return roles.slice(0, count);
  }
  const trimmed: SceneRole[] = ["problem"];
  const middle: SceneRole[] = ["pain", "solution", "renter", "host"];
  for (let i = 0; i < count - 2; i += 1) trimmed.push(middle[i] ?? "solution");
  trimmed.push("both");
  return trimmed;
}

/** Illustrations the role always wants, so the narrative reads visually too. */
const ROLE_ELEMENTS: Record<SceneRole, string[]> = {
  problem: ["box-stack"],
  pain: ["warning"],
  solution: ["marketplace-link"],
  renter: ["search-bar", "pin"],
  host: ["garage", "earning"],
  both: ["marketplace-link", "check"],
  endcard: [],
};

/**
 * The recurring cast for one campaign: the same people and objects reappear
 * across scenes instead of every scene drawing something unrelated.
 */
export function castForStory(story: CampaignStory): string[] {
  const text = [story.hook, ...story.scenes.map((scene) => `${scene.visual} ${scene.caption}`)].join(
    " ",
  );
  return elementsForText(text).slice(0, 2);
}

function layout(
  count: number,
  index: number,
  stageY: number,
  stageScale: number,
  /** True when people are on screen: props then keep clear of the centre. */
  peopled: boolean,
): { x: number; y: number; size: number } {
  const scale = stageScale;
  // With a character on stage the props sit to the sides and slightly higher,
  // so nothing lands on the person or in the caption band.
  const y = peopled ? stageY - 0.12 : stageY;
  if (count <= 1)
    return { x: peopled ? 0.74 : 0.5, y, size: (peopled ? 0.3 : 0.56) * scale };
  if (count === 2)
    return {
      x: index === 0 ? (peopled ? 0.2 : 0.32) : peopled ? 0.8 : 0.68,
      y,
      size: (peopled ? 0.24 : 0.38) * scale,
    };
  const positions = peopled
    ? [
        { x: 0.18, y: y - 0.04 },
        { x: 0.82, y: y - 0.04 },
        { x: 0.5, y: y - 0.16 },
      ]
    : [
        { x: 0.29, y: stageY - 0.07 },
        { x: 0.71, y: stageY - 0.07 },
        { x: 0.5, y: stageY + 0.11 },
      ];
  const spot = positions[index] ?? positions[0]!;
  return { x: spot.x, y: spot.y, size: (peopled ? 0.2 : 0.32) * scale };
}

function sceneItems(
  scene: StoryScene,
  role: SceneRole,
  cast: readonly string[],
  stageY: number,
  stageScale: number,
  board: StoryboardScene | null,
): SceneItem[] {
  const fromWords = elementsForText(`${scene.visual} ${scene.caption}`);
  // Storyboard props come first: they are the objects the story actually needs,
  // and they stay the same object from scene to scene.
  const ids = [
    ...new Set([...(board?.props ?? []), ...ROLE_ELEMENTS[role], ...cast, ...fromWords]),
  ].slice(0, 3);
  return ids.map((id, index) => ({
    element: id,
    ...layout(ids.length, index, stageY, stageScale),
    motion: ENTRANCES[(scene.index + index) % ENTRANCES.length]!,
    delay: Math.min(0.18 * index, Math.max(0, scene.seconds - 0.4)),
    // Later items sit nearer the viewer, so the camera move separates them.
    depth: ids.length <= 1 ? 0.6 : 0.35 + (index / Math.max(1, ids.length - 1)) * 0.55,
  }));
}

/** Slow, alternating camera moves. Deterministic, and never more than 8%. */
function camera(index: number, role: SceneRole): CameraMove {
  if (role === "endcard")
    return { fromScale: 1.04, toScale: 1, fromX: 0, toX: 0, fromY: 0, toY: 0 };
  const push = index % 2 === 0;
  const drift = index % 4 < 2 ? 0.02 : -0.02;
  return {
    fromScale: push ? 1.0 : 1.07,
    toScale: push ? 1.07 : 1.0,
    fromX: -drift,
    toX: drift,
    fromY: drift * 0.6,
    toY: -drift * 0.6,
  };
}

function backdrop(index: number, role: SceneRole): SceneBackdrop {
  if (role === "endcard")
    return { base: "primary", tint: "primarySoft", motes: 5, horizon: false };
  return {
    base: index % 2 === 0 ? "canvas" : "surface",
    tint: role === "host" || role === "both" ? "success" : "primarySoft",
    motes: 6,
    horizon: true,
  };
}

/**
 * Builds the animated plan for one platform version of a campaign.
 *
 * Runtime is trimmed to the platform's limit rather than exceeding it, and the
 * branding is whatever that platform actually permits.
 */
export function buildAnimatedPlan(input: {
  campaignId: string;
  asset: PlatformAsset;
  story: CampaignStory;
  fps?: number;
  /** From the existing campaign intelligence; never decided here. */
  audience?: MarketingAudience | null;
  topic?: string | null;
}): AnimatedPlan {
  const { campaignId, asset, story } = input;
  const rules = brandRules(asset.platform);
  const fps = input.fps ?? 30;
  const frame = FRAME_SIZES[asset.aspect];
  const composition = COMPOSITIONS[asset.aspect];
  const website = siteOrigin().replace(/^https?:\/\//, "");

  const branding = applyBranding({
    platform: asset.platform,
    tagline: brand.tagline,
    website,
    cta: asset.cta,
  });

  const budget = Math.min(asset.seconds, rules.maxSeconds);
  const storySeconds = story.scenes.reduce((total, scene) => total + scene.seconds, 0) || 1;
  const endCardSeconds = branding.showEndCard ? Math.min(3, budget * 0.24) : 0;
  const scale = (budget - endCardSeconds) / storySeconds;

  const roles = rolesForStory(story.scenes.length);
  const cast = castForStory(story);
  const storyboard = buildStoryboard({
    story,
    asset,
    audience: input.audience ?? null,
    topic: input.topic ?? null,
    sceneCount: story.scenes.length,
  });

  const scenes: AnimatedScene[] = story.scenes.map((scene, position) => {
    const role = roles[position] ?? "solution";
    const board = storyboard.scenes[position] ?? storyboard.scenes.at(-1) ?? null;
    return {
      index: position,
      role,
      beat: board?.beat ?? "solution",
      environment: board?.environment ?? "ENV_HOME_LIVING_ROOM",
      cast: board?.cast ?? [],
      shot: board?.shot ?? "slowPush",
      note: board?.note ?? "",
      seconds: Math.max(1, Number((scene.seconds * scale).toFixed(2))),
      background: position % 2 === 0 ? "canvas" : "surface",
      backdrop: backdrop(position, role),
      camera: camera(position, role),
      items: sceneItems(scene, role, cast, composition.stageY, composition.stageScale, board),
      caption: {
        text: position === 0 ? story.hook || scene.caption : scene.caption,
        motion: position === 0 ? "reveal" : "slide-up",
        emphasis: position === 0 ? "hook" : "body",
      },
      subCaption:
        position === story.scenes.length - 1
          ? { text: asset.cta, motion: "fade", emphasis: "cta" }
          : null,
      narration: scene.voiceover,
      logo: branding.showWatermark ? "watermark" : "none",
      transition: position === 0 ? "cut" : "fade",
    };
  });

  if (branding.showEndCard) {
    scenes.push({
      index: scenes.length,
      role: "endcard",
      beat: "brand",
      environment: "ENV_CLOSING_BRAND",
      cast: [],
      shot: "reveal",
      note: "The EarnRoom lock-up, tagline, call to action and web address.",
      seconds: Number(endCardSeconds.toFixed(2)),
      background: "primary",
      backdrop: backdrop(scenes.length, "endcard"),
      camera: camera(scenes.length, "endcard"),
      items: [],
      // The end card draws the real lock-up; this line is the approved tagline
      // that sits beneath it, never a text stand-in for the logo.
      caption: { text: brand.tagline, motion: "zoom", emphasis: "brand" },
      subCaption: {
        text:
          branding.showWebsite && branding.website
            ? `${asset.cta} · ${branding.website}`
            : asset.cta,
        motion: "fade",
        emphasis: "cta",
      },
      narration: asset.cta,
      logo: "endcard",
      transition: "fade",
    });
  }

  const seconds = Number(scenes.reduce((total, scene) => total + scene.seconds, 0).toFixed(2));

  const plan: Omit<AnimatedPlan, "digest"> = {
    campaignId,
    assetId: asset.id,
    platform: asset.platform,
    aspect: asset.aspect,
    width: frame.width,
    height: frame.height,
    fps,
    seconds,
    scenes,
    storyboard: {
      template: storyboard.template,
      side: storyboard.side,
      characters: storyboard.characters,
    },
    branding,
    composition,
    brand: {
      name: brand.name,
      tagline: brand.tagline,
      website,
      logoUrl: iconAsset.url,
      wordmarkUrl: wordmarkAsset.url,
    },
  };

  return { ...plan, digest: planDigest(plan) };
}
