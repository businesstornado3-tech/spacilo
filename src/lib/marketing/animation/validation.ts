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

import { brandRules } from "./platform-branding";
import { COMPOSITIONS, FRAME_SIZES, type AnimatedPlan } from "./types";

export type QualityStatus =
  | "DRAFT"
  | "BROWSER_GENERATED"
  | "BRAND_VALIDATED"
  | "PRODUCTION_READY"
  | "VALIDATION_FAILED";

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
    if (lower.includes(token)) failures.push(`Placeholder wording “${token}” is still in the copy.`);
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
    if (scene.role !== "endcard" && scene.items.length === 0) {
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

  return { passed: failures.length === 0, failures };
}

/** What the renderer actually produced and drew. Reported, never assumed. */
export type RenderOutcome = {
  width: number;
  height: number;
  seconds: number;
  bytes: number;
  /** Frames on which the real EarnRoom artwork was painted. */
  logoFrames: number;
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
