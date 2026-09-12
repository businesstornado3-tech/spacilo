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
import {
  buildStoryboard,
  framingForShot,
  moodForBeat,
  type CameraShot,
  type CharacterCue,
  type Framing,
  type Mood,
  type StoryboardScene,
} from "./story";
import { environment } from "./environments";
import { elementsForText } from "./library";
import { applyBranding, brandRules } from "./platform-branding";
import { buildAudioPlan } from "./audio";
import {
  COMPOSITIONS,
  frameSize,
  type AnimatedPlan,
  type AnimatedScene,
  type CameraMove,
  type FrameQuality,
  type Motion,
  type SceneBackdrop,
  type SceneItem,
  type SceneRole,
  type SceneTransition,
} from "./types";

/** Every free browser video is a thirty second film unless a platform is shorter. */
export const BROWSER_TARGET_SECONDS = 30;

/** Scene arrivals are cycled, so the film never cuts the same way twice running. */
const TRANSITIONS: SceneTransition[] = ["fade", "slide", "zoom", "light", "fade", "slide"];

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
  const text = [
    story.hook,
    ...story.scenes.map((scene) => `${scene.visual} ${scene.caption}`),
  ].join(" ");
  return elementsForText(text).slice(0, 2);
}

/**
 * Places objects in the scene. Anything in a peopled scene rests on the floor
 * of that environment rather than hanging in the air beside the character —
 * floating props are exactly what makes a video read as moving clip art.
 */
function layout(
  count: number,
  index: number,
  stageY: number,
  stageScale: number,
  /** True when people are on screen: props then keep clear of the centre. */
  peopled: boolean,
  floor: { ground: number; widthOverHeight: number } | null = null,
): { x: number; y: number; size: number } {
  if (peopled && floor) {
    const size = (count <= 1 ? 0.26 : 0.2) * stageScale;
    // The object's own height in fractions of the frame, so its base can sit
    // exactly on the floor line.
    const half = (size * floor.widthOverHeight) / 2;
    const spots = [0.79, 0.19, 0.9];
    return {
      x: spots[index % spots.length]!,
      y: floor.ground - half - 0.01,
      size,
    };
  }
  const scale = stageScale;
  // With a character on stage the props sit to the sides and slightly higher,
  // so nothing lands on the person or in the caption band.
  const y = peopled ? stageY - 0.12 : stageY;
  if (count <= 1) return { x: peopled ? 0.74 : 0.5, y, size: (peopled ? 0.3 : 0.56) * scale };
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

/**
 * Advertising is watched, not read. The campaign's own words are kept — nothing
 * is invented here — but only the first clause is burned into the frame, so the
 * picture carries the story and the caption confirms it. The full line is still
 * spoken by the narration field the local worker uses.
 */
export function shortenCaption(text: string, maxWords = 8): string {
  const first = text
    .split(/(?<=[.!?])\s+|\s+[—–-]\s+|;\s+/)
    .map((part) => part.trim())
    .filter(Boolean)[0];
  const clause = (first ?? text).trim().replace(/[.,;:]$/, "");
  const words = clause.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return clause;
  return words.slice(0, maxWords).join(" ");
}

/** Abstract badges that stand in for feeling instead of showing it. */
const ICONOGRAPHY = new Set(["warning", "check", "tick", "alert"]);

/**
 * Re-frames the storyboard's cast for the shot. A close shot brings the figure
 * forward and off centre; a wide shot lets the environment breathe. The people
 * themselves never change, so continuity survives the recomposition.
 */
export function castForFraming(
  cast: readonly CharacterCue[],
  framing: Framing,
  safeSide: number,
): CharacterCue[] {
  const thirds = [0.36, 0.64, 0.5];
  return cast.map((member, index) => {
    const factor =
      framing === "close" ? 1.55 : framing === "detail" ? 0.78 : framing === "wide" ? 0.84 : 1;
    const x =
      framing === "twoShot" || cast.length > 1
        ? member.x
        : Math.min(1 - safeSide - 0.04, Math.max(safeSide + 0.04, thirds[index % thirds.length]!));
    return { ...member, x, scale: Number((member.scale * factor).toFixed(3)) };
  });
}

function sceneItems(
  scene: StoryScene,
  role: SceneRole,
  cast: readonly string[],
  stageY: number,
  stageScale: number,
  board: StoryboardScene | null,
  floor: { ground: number; widthOverHeight: number },
): SceneItem[] {
  const fromWords = elementsForText(`${scene.visual} ${scene.caption}`);
  // Storyboard props come first: they are the objects the story actually needs,
  // and they stay the same object from scene to scene.
  const peopled = (board?.cast.length ?? 0) > 0;
  const candidates = [
    ...new Set([...(board?.props ?? []), ...ROLE_ELEMENTS[role], ...cast, ...fromWords]),
  ];
  // With people on screen the acting carries the beat: at most one real object
  // joins them, and never an abstract badge standing in for an emotion.
  const ids = peopled
    ? candidates.filter((id) => !ICONOGRAPHY.has(id)).slice(0, 1)
    : candidates.slice(0, 3);
  return ids.map((id, index) => ({
    element: id,
    ...layout(ids.length, index, stageY, stageScale, peopled, floor),
    motion: ENTRANCES[(scene.index + index) % ENTRANCES.length]!,
    delay: Math.min(0.18 * index, Math.max(0, scene.seconds - 0.4)),
    // Later items sit nearer the viewer, so the camera move separates them.
    depth: ids.length <= 1 ? 0.6 : 0.35 + (index / Math.max(1, ids.length - 1)) * 0.55,
  }));
}

/**
 * The camera does what the shot asked for, not what the scene number happens to
 * be. Deterministic and always slow: nothing moves more than a few per cent.
 */
function camera(index: number, role: SceneRole, shot: CameraShot): CameraMove {
  if (role === "endcard")
    return { fromScale: 1.04, toScale: 1, fromX: 0, toX: 0, fromY: 0, toY: 0 };
  const drift = index % 2 === 0 ? 0.018 : -0.018;
  switch (shot) {
    case "establishing":
      return { fromScale: 1.02, toScale: 1.08, fromX: -0.02, toX: 0.01, fromY: 0.01, toY: -0.01 };
    case "slowPush":
      return { fromScale: 1.0, toScale: 1.1, fromX: 0, toX: 0, fromY: 0.012, toY: -0.012 };
    case "slowPull":
      return { fromScale: 1.12, toScale: 1.0, fromX: 0, toX: 0, fromY: -0.012, toY: 0.012 };
    case "panLeft":
      return { fromScale: 1.06, toScale: 1.06, fromX: 0.05, toX: -0.05, fromY: 0, toY: 0 };
    case "panRight":
      return { fromScale: 1.06, toScale: 1.06, fromX: -0.05, toX: 0.05, fromY: 0, toY: 0 };
    case "focusCharacter":
      return {
        fromScale: 1.08,
        toScale: 1.16,
        fromX: drift,
        toX: drift * 0.4,
        fromY: 0,
        toY: -0.01,
      };
    case "focusObject":
      return { fromScale: 1.04, toScale: 1.14, fromX: -drift, toX: 0, fromY: 0.02, toY: 0 };
    case "twoShot":
      return { fromScale: 1.05, toScale: 1.0, fromX: -0.012, toX: 0.012, fromY: 0, toY: 0 };
    default:
      return { fromScale: 1.03, toScale: 1.09, fromX: -drift, toX: drift, fromY: 0.01, toY: -0.01 };
  }
}

/** Light follows feeling: cooler and flatter early, warmer as the story lands. */
function backdrop(index: number, role: SceneRole, mood: Mood): SceneBackdrop {
  if (role === "endcard") return { base: "primary", tint: "primarySoft", motes: 3, horizon: false };
  const tint =
    mood === "tension" || mood === "doubt"
      ? "inkSoft"
      : mood === "curiosity"
        ? "line"
        : mood === "hope"
          ? "primarySoft"
          : "success";
  return {
    base:
      mood === "relief" || mood === "delight" ? "canvas" : index % 2 === 0 ? "canvas" : "surface",
    tint,
    motes: mood === "tension" || mood === "doubt" ? 4 : 7,
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
  /** Full 1080-class frame, or the controlled smaller frame. */
  frameQuality?: FrameQuality;
  /** How long the finished film should run. Browser videos aim at 30 seconds. */
  targetSeconds?: number;
}): AnimatedPlan {
  const { campaignId, asset, story } = input;
  const rules = brandRules(asset.platform);
  const fps = input.fps ?? 30;
  const frameQuality = input.frameQuality ?? "TARGET";
  const frame = frameSize(asset.aspect, frameQuality);
  const composition = COMPOSITIONS[asset.aspect];
  const website = siteOrigin().replace(/^https?:\/\//, "");

  const branding = applyBranding({
    platform: asset.platform,
    tagline: brand.tagline,
    website,
    cta: asset.cta,
  });

  const target = input.targetSeconds ?? BROWSER_TARGET_SECONDS;
  const budget = Math.min(Math.max(asset.seconds, target), rules.maxSeconds);
  const storySeconds = story.scenes.reduce((total, scene) => total + scene.seconds, 0) || 1;
  const endCardSeconds = branding.showEndCard ? Math.min(4, Math.max(3, budget * 0.12)) : 0;
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
    const shot: CameraShot = board?.shot ?? "slowPush";
    const framing = board?.framing ?? framingForShot(shot);
    const mood = board?.mood ?? moodForBeat(board?.beat ?? "solution");
    return {
      index: position,
      role,
      beat: board?.beat ?? "solution",
      environment: board?.environment ?? "ENV_HOME_LIVING_ROOM",
      cast: castForFraming(board?.cast ?? [], framing, composition.safe.side),
      shot,
      framing,
      mood,
      note: board?.note ?? "",
      seconds: Math.max(1, Number((scene.seconds * scale).toFixed(2))),
      background: position % 2 === 0 ? "canvas" : "surface",
      backdrop: backdrop(position, role, mood),
      camera: camera(position, role, shot),
      items: sceneItems(scene, role, cast, composition.stageY, composition.stageScale, board, {
        ground: environment(board?.environment ?? "ENV_HOME_LIVING_ROOM").ground,
        widthOverHeight: frame.width / frame.height,
      }),
      caption: {
        text: shortenCaption(
          position === 0 ? story.hook || scene.caption : scene.caption,
          position === 0 ? 5 : 8,
        ),
        motion: position === 0 ? "reveal" : "slide-up",
        emphasis: position === 0 ? "hook" : "body",
      },
      subCaption:
        position === story.scenes.length - 1
          ? { text: asset.cta, motion: "fade", emphasis: "cta" }
          : null,
      narration: scene.voiceover,
      logo: branding.showWatermark ? "watermark" : "none",
      transition: position === 0 ? "cut" : TRANSITIONS[(position - 1) % TRANSITIONS.length]!,
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
      framing: "wide",
      mood: "delight",
      note: "The EarnRoom lock-up, tagline, call to action and web address.",
      seconds: Number(endCardSeconds.toFixed(2)),
      background: "primary",
      backdrop: backdrop(scenes.length, "endcard", "delight"),
      camera: camera(scenes.length, "endcard", "reveal"),
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

  // A short campaign can hand back the same framing for every beat. The film
  // must still change how close the camera sits, so a deterministic rotation is
  // applied when the storyboard did not vary it on its own.
  const storyScenes = scenes.filter((scene) => scene.role !== "endcard");
  if (storyScenes.length >= 3 && new Set(storyScenes.map((s) => s.framing)).size < 3) {
    const rotation: Framing[] = ["wide", "medium", "close", "twoShot"];
    storyScenes.forEach((scene, position) => {
      scene.framing = rotation[position % rotation.length]!;
      scene.camera = camera(position, scene.role, scene.shot);
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
    frameQuality,
    fps,
    seconds,
    audio: buildAudioPlan(scenes),
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
