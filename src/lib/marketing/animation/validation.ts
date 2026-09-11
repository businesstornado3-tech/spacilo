/**
 * Deterministic quality gate for the free browser-made marketing video.
 *
 * Nothing here trusts the renderer's word for anything. The plan is checked
 * before a frame is drawn, and the finished file is checked against what was
 * actually drawn — including whether the real EarnRoom artwork was loaded and
 * painted. A clip is only ever called production ready when both pass.
 *
 * Pure module: no canvas, no network, no clock.
 */
import { brand } from "@/config/brand";

import { hasCharacter, isExpression, isPose } from "./characters";
import { hasEnvironment } from "./environments";
import { brandRules } from "./platform-branding";
import { RESOLVED_MOODS } from "./story";
import { COMPOSITIONS, FRAME_SIZES, type AnimatedPlan } from "./types";

export type QualityStatus =
  "DRAFT" | "BROWSER_GENERATED" | "BRAND_VALIDATED" | "PRODUCTION_READY" | "VALIDATION_FAILED";

export type QualityCheck = { passed: boolean; failures: string[] };

/** Words that must never reach a published frame. */
const PLACEHOLDERS = [
  "lorem ipsum",
  "todo",
  "tbd",
  "placeholder",
  "undefined",
  "null",
  "{{",
  "}}",
  "xxx",
  "sample text",
];

/** Roughly how many characters fit on one readable line in the safe area. */
function lineBudget(plan: AnimatedPlan, scale: number): number {
  const usable = plan.composition.textWidth;
  // A display face at `scale` of the frame width fits about 1.9 characters per
  // em of width. Deliberately conservative, so a pass really is inside the box.
  return Math.max(8, Math.floor((usable / scale) * 1.9));
}

function collectText(plan: AnimatedPlan): string[] {
  const lines: string[] = [];
  for (const scene of plan.scenes) {
    lines.push(scene.caption.text);
    if (scene.subCaption) lines.push(scene.subCaption.text);
  }
  return lines;
}

/**
 * Checks the plan itself: story shape, branding, wording and framing. Runs
 * before rendering, so a bad plan costs nothing.
 */
export function validatePlan(plan: AnimatedPlan): QualityCheck {
  const failures: string[] = [];
  const rules = brandRules(plan.platform);

  /* ------------------------------------------------------------- branding */
  if (!plan.brand.logoUrl || !plan.brand.wordmarkUrl) {
    failures.push("The official EarnRoom artwork is missing from the plan.");
  }
  if (plan.brand.name !== brand.name) {
    failures.push("The brand name does not match the EarnRoom brand configuration.");
  }
  if (plan.branding.showEndCard && !plan.scenes.some((scene) => scene.logo === "endcard")) {
    failures.push("No closing card carries the EarnRoom lock-up.");
  }
  if (!plan.branding.cta.trim()) failures.push("The campaign call to action is missing.");
  if (rules.allowWebsiteBurnIn && !plan.brand.website.includes("earnroom")) {
    failures.push("The EarnRoom web address is missing.");
  }
  if (!rules.allowWebsiteBurnIn && JSON.stringify(plan.scenes).includes(plan.brand.website)) {
    failures.push("The web address was burned in on a platform that does not allow it.");
  }

  /* -------------------------------------------------------------- wording */
  const text = collectText(plan);
  const joined = text.join(" \u0000 ");
  // The web address is lower case by nature; the brand name is not.
  const spellable = joined.split(plan.brand.website).join(" ");
  for (const match of spellable.match(/earnroom/gi) ?? []) {
    if (match !== brand.name) failures.push(`EarnRoom is misspelled as “${match}”.`);
  }
  const lower = joined.toLowerCase();
  for (const token of PLACEHOLDERS) {
    if (lower.includes(token))
      failures.push(`Placeholder wording “${token}” is still in the copy.`);
  }
  if (text.some((line) => !line.trim())) failures.push("A caption is empty.");

  /* ---------------------------------------------------------- composition */
  const frame = FRAME_SIZES[plan.aspect];
  if (plan.width !== frame.width || plan.height !== frame.height) {
    failures.push(`The frame is ${plan.width}x${plan.height}, not the ${plan.aspect} size.`);
  }
  if (plan.composition.aspect !== plan.aspect) {
    failures.push("The layout was composed for a different shape.");
  }
  if (COMPOSITIONS[plan.aspect].captionY !== plan.composition.captionY) {
    failures.push("The layout does not match this platform's composition.");
  }
  for (const scene of plan.scenes) {
    const scale =
      scene.caption.emphasis === "hook"
        ? plan.composition.hookScale
        : scene.caption.emphasis === "cta"
          ? plan.composition.ctaScale
          : plan.composition.bodyScale;
    if (scene.caption.text.length > lineBudget(plan, scale) * 4) {
      failures.push(`Scene ${scene.index + 1} has more caption than fits the safe area.`);
    }
    if (scene.role !== "endcard" && scene.items.length === 0 && scene.cast.length === 0) {
      failures.push(`Scene ${scene.index + 1} has nothing in it.`);
    }
    if (scene.seconds < 1) failures.push(`Scene ${scene.index + 1} is too short to read.`);
  }

  /* ---------------------------------------------------------------- story */
  const roles = plan.scenes.map((scene) => scene.role);
  if (roles[0] !== "problem" && plan.scenes.length > 1) {
    failures.push("The video does not open on the campaign's problem.");
  }
  if (plan.branding.showEndCard && roles.at(-1) !== "endcard") {
    failures.push("The video does not close on the EarnRoom card.");
  }
  const storyRoles = plan.branding.showEndCard ? roles.slice(0, -1) : roles;
  if (storyRoles.includes("endcard")) failures.push("A closing card appears mid-story.");
  if (plan.seconds <= 0 || plan.seconds > rules.maxSeconds + 0.5) {
    failures.push("The planned length is not valid for this platform.");
  }

  /* ----------------------------------------------------------- storyboard */
  if (!plan.brand.tagline.includes(brand.tagline) || plan.brand.tagline !== brand.tagline) {
    failures.push("The approved EarnRoom tagline is not the one in the plan.");
  }
  if (plan.branding.showEndCard) {
    const card = plan.scenes.find((scene) => scene.role === "endcard");
    if (card && card.caption.text !== brand.tagline) {
      failures.push(`The closing card must read exactly “${brand.tagline}”.`);
    }
  }
  for (const scene of plan.scenes) {
    if (!hasEnvironment(scene.environment)) {
      failures.push(`Scene ${scene.index + 1} is set somewhere that does not exist.`);
    }
    for (const member of scene.cast) {
      if (!hasCharacter(member.character)) {
        failures.push(`Scene ${scene.index + 1} uses a character that is not in the library.`);
      }
      if (!isPose(member.pose) || !isExpression(member.expression)) {
        failures.push(
          `Scene ${scene.index + 1} asks for a pose or expression that does not exist.`,
        );
      }
      const inside =
        member.x > plan.composition.safe.side && member.x < 1 - plan.composition.safe.side;
      if (!inside)
        failures.push(`A character in scene ${scene.index + 1} stands outside the safe area.`);
    }
  }
  // Continuity: the same people throughout, never swapped mid-story.
  const used = [...new Set(plan.scenes.flatMap((scene) => scene.cast.map((c) => c.character)))];
  for (const id of used) {
    if (!plan.storyboard.characters.includes(id)) {
      failures.push("A character appears who was not cast for this campaign.");
    }
  }
  if (used.length > 2) failures.push("Too many different people appear for one story to follow.");
  const beats = plan.scenes.map((scene) => scene.beat);
  if (plan.scenes.length > 2) {
    if (!beats.some((beat) => beat === "hook" || beat === "problem")) {
      failures.push("The story has no beginning.");
    }
    if (
      !beats.some((beat) => beat === "solution" || beat === "discovery" || beat === "connection")
    ) {
      failures.push("The story has no middle.");
    }
    if (!beats.some((beat) => beat === "outcome" || beat === "brand")) {
      failures.push("The story has no ending.");
    }
  }

  /* ------------------------------------------------- advertising qualities */
  const storyScenes = plan.scenes.filter((scene) => scene.role !== "endcard");
  if (storyScenes.length >= 3) {
    const framings = new Set(storyScenes.map((scene) => scene.framing));
    if (framings.size < 3) {
      failures.push("Every scene is framed the same way, so the film reads as a slide deck.");
    }
    const moods = plan.scenes.map((scene) => scene.mood);
    if (new Set(moods).size < 3) failures.push("The story has no emotional change in it.");
    if (!RESOLVED_MOODS.includes(moods.at(-1)!)) {
      failures.push("The film does not end on a resolved feeling.");
    }
    const shown = storyScenes.filter(
      (scene) => scene.cast.length > 0 || scene.items.length > 0,
    ).length;
    if (shown / storyScenes.length < 0.8) {
      failures.push("Too much of the story is told in words rather than shown.");
    }
  }
  for (const scene of plan.scenes) {
    if (scene.role === "endcard") continue;
    if (scene.caption.text.trim().split(/\s+/).length > 9) {
      failures.push(`Scene ${scene.index + 1} carries a sentence, not an advertising line.`);
    }
    if (scene.cast.length > 0 && scene.items.length > 1) {
      failures.push(`Scene ${scene.index + 1} crowds the people with props.`);
    }
  }

  return { passed: failures.length === 0, failures };
}

/**
 * A deterministic score for each thing that matters. Rules only — no model is
 * asked whether the video is good enough.
 */
export type QualityScores = {
  STORY_CONTINUITY: number;
  CHARACTER_CONTINUITY: number;
  BRAND_ACCURACY: number;
  TEXT_ACCURACY: number;
  VISUAL_COMPLETENESS: number;
  SAFE_AREA_COMPLIANCE: number;
  SCENE_COMPLETENESS: number;
  PLATFORM_COMPLIANCE: number;
  /** How much the camera changes across the film. */
  SHOT_VARIETY: number;
  /** Whether the film travels from unsettled to settled. */
  EMOTIONAL_ARC: number;
  /** How much of the story is shown rather than written on the screen. */
  VISUAL_STORYTELLING: number;
};

export function scorePlan(plan: AnimatedPlan): QualityScores {
  const rules = brandRules(plan.platform);
  const check = validatePlan(plan);
  const failed = (needle: string) =>
    check.failures.some((failure) => failure.toLowerCase().includes(needle));
  const beats = new Set(plan.scenes.map((scene) => scene.beat));
  const cast = new Set(plan.scenes.flatMap((scene) => scene.cast.map((c) => c.character)));
  return {
    STORY_CONTINUITY: beats.size >= 3 && !failed("story") ? 100 : 60,
    CHARACTER_CONTINUITY: cast.size > 0 && cast.size <= 2 ? 100 : cast.size === 0 ? 70 : 40,
    BRAND_ACCURACY:
      plan.brand.logoUrl && plan.brand.tagline === brand.tagline && !failed("brand") ? 100 : 0,
    TEXT_ACCURACY: failed("placeholder") || failed("misspell") ? 0 : 100,
    VISUAL_COMPLETENESS: plan.scenes.every(
      (s) => s.items.length > 0 || s.cast.length > 0 || s.role === "endcard",
    )
      ? 100
      : 50,
    SAFE_AREA_COMPLIANCE: failed("safe area") ? 0 : 100,
    SCENE_COMPLETENESS: plan.scenes.every((scene) => scene.seconds >= 1) ? 100 : 50,
    PLATFORM_COMPLIANCE: plan.seconds <= rules.maxSeconds + 0.5 ? 100 : 0,
    SHOT_VARIETY: Math.min(
      100,
      Math.round((new Set(plan.scenes.map((scene) => scene.framing)).size / 4) * 100),
    ),
    EMOTIONAL_ARC:
      new Set(plan.scenes.map((scene) => scene.mood)).size >= 3 &&
      RESOLVED_MOODS.includes(plan.scenes.at(-1)!.mood)
        ? 100
        : 50,
    VISUAL_STORYTELLING: (() => {
      const story = plan.scenes.filter((scene) => scene.role !== "endcard");
      if (!story.length) return 100;
      const shown = story.filter((scene) => scene.cast.length > 0 || scene.items.length > 0).length;
      const wordy = story.filter(
        (scene) => scene.caption.text.trim().split(/\s+/).length > 8,
      ).length;
      return Math.max(0, Math.round((shown / story.length) * 100) - wordy * 10);
    })(),
  };
}

/** What the renderer actually produced and drew. Reported, never assumed. */
export type RenderOutcome = {
  width: number;
  height: number;
  seconds: number;
  bytes: number;
  /** Frames on which the real EarnRoom artwork was painted. */
  logoFrames: number;
  /** Character draws across the whole render, for the story check. */
  characterFrames?: number;
  /** Whether the official artwork files decoded successfully. */
  artworkLoaded: boolean;
  /** Smallest width the lock-up was drawn at, in pixels. */
  smallestLogoPx: number;
  frames: number;
};

/** Checks the finished file against the plan it was supposed to render. */
export function validateRender(plan: AnimatedPlan, outcome: RenderOutcome): QualityCheck {
  const failures: string[] = [];
  if (!outcome.artworkLoaded) {
    failures.push("The official EarnRoom artwork could not be loaded, so it is not in the video.");
  }
  if (outcome.logoFrames <= 0) {
    failures.push("The EarnRoom logo does not appear anywhere in the finished video.");
  }
  if (outcome.artworkLoaded && outcome.smallestLogoPx > 0 && outcome.smallestLogoPx < 48) {
    failures.push("The EarnRoom logo is too small to read in the finished video.");
  }
  if (outcome.width !== plan.width || outcome.height !== plan.height) {
    failures.push("The finished video is not the size this platform asked for.");
  }
  if (Math.abs(outcome.seconds - plan.seconds) > 1) {
    failures.push("The finished video is not the length that was planned.");
  }
  if (outcome.seconds <= 0 || outcome.frames <= 0) failures.push("The finished video is empty.");
  if (outcome.bytes < 20_000) failures.push("The finished file is too small to be a real video.");
  const wantsPeople = plan.scenes.some((scene) => scene.cast.length > 0);
  if (wantsPeople && (outcome.characterFrames ?? 0) <= 0) {
    failures.push("The people in the story were never drawn into the finished video.");
  }
  return { passed: failures.length === 0, failures };
}

/**
 * The honest label for a clip. Browser output is never called production ready
 * until both the plan and the finished file have passed.
 */
export function qualityStatus(input: {
  plan: QualityCheck;
  render?: QualityCheck | null;
}): QualityStatus {
  if (!input.plan.passed) return "VALIDATION_FAILED";
  if (!input.render) return "DRAFT";
  if (!input.render.passed) return "VALIDATION_FAILED";
  return "PRODUCTION_READY";
}

export function qualityLabel(status: QualityStatus): string {
  switch (status) {
    case "DRAFT":
      return "Draft";
    case "BROWSER_GENERATED":
      return "Browser generated";
    case "BRAND_VALIDATED":
      return "Brand validated";
    case "PRODUCTION_READY":
      return "Production ready";
    default:
      return "Validation failed";
  }
}
