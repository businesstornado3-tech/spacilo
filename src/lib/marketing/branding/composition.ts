/**
 * Deterministic EarnRoom branding composition — the specification and the
 * evidence check.
 *
 * The paid hosted provider returns unbranded pixels: it is a generative video
 * model, not EarnRoom's design system, and it is never asked to draw the logo
 * or write the tagline. This module turns the approved overlay specification
 * into a concrete, measurable composition plan (which approved artwork file,
 * at what size, on which frames) and then checks the receipt the compositor
 * reports back, so an unbranded file can never be recorded as finished.
 *
 * Pure module: no clock, no network, no canvas, no file system.
 */
import lockupAsset from "@/assets/brand/earnroom-lockup.png.asset.json";
import wordmarkAsset from "@/assets/brand/earnroom-wordmark-transparent.png.asset.json";

import { brandProfile, PRIMARY_TAGLINE } from "../brand";
import { buildBrandOverlay } from "../branding";
import { brandRules } from "../animation/platform-branding";
import type { AspectRatio, PlatformId } from "../types";

/** The approved artwork, served from EarnRoom's own asset storage. */
export const OFFICIAL_LOCKUP_URL = lockupAsset.url;
export const OFFICIAL_WORDMARK_URL = wordmarkAsset.url;

export type TimedText = { text: string; fromSeconds: number; toSeconds: number | null };

export type BrandCompositionPlan = {
  platform: PlatformId;
  aspect: AspectRatio;
  width: number;
  height: number;
  fps: number;
  seconds: number;
  safeArea: { top: number; bottom: number; left: number; right: number };
  /** Corner wordmark carried through the body of the film. */
  watermark: {
    url: string;
    widthFraction: number;
    opacity: number;
    fromSeconds: number;
    toSeconds: number;
  } | null;
  /** The permanent campaign tagline, held in the lower third. */
  persistentTagline: TimedText | null;
  cta: TimedText | null;
  endCard: {
    fromSeconds: number;
    logoUrl: string;
    widthFraction: number;
    tagline: string;
    website: string | null;
  };
  /** Stable fingerprint of this plan, recorded with the finished file. */
  digest: string;
};

function digestOf(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * Builds the composition plan for one platform version. Platform rules are
 * honoured: TikTok forbids promotional watermarks and burned-in web addresses
 * through its publishing API, so that version carries a closing card only.
 */
export function buildCompositionPlan(input: {
  platform: PlatformId;
  aspect: AspectRatio;
  width: number;
  height: number;
  fps: number;
  seconds: number;
  tagline: string;
  cta: string;
}): BrandCompositionPlan {
  const rules = brandRules(input.platform);
  const profile = brandProfile();
  const overlay = buildBrandOverlay({
    platform: input.platform,
    aspect: input.aspect,
    seconds: input.seconds,
    tagline: input.tagline,
    cta: input.cta,
    watermark: rules.allowWatermark,
  });

  const endCardFrom = Math.max(0, input.seconds - 3);
  const watermarkLayer = overlay.layers.find(
    (layer) => layer.kind === "logo" && layer.position === "bottom-right",
  );
  const persistent = overlay.layers.find(
    (layer) =>
      layer.kind === "text" &&
      layer.role === "tagline" &&
      layer.fromSeconds === 0 &&
      layer.value === PRIMARY_TAGLINE,
  );
  const ctaLayer = overlay.layers.find((layer) => layer.kind === "text" && layer.role === "cta");

  const plan: Omit<BrandCompositionPlan, "digest"> = {
    platform: input.platform,
    aspect: input.aspect,
    width: input.width,
    height: input.height,
    fps: input.fps,
    seconds: input.seconds,
    safeArea: overlay.safeArea,
    watermark:
      watermarkLayer && watermarkLayer.kind === "logo"
        ? {
            url: OFFICIAL_WORDMARK_URL,
            widthFraction: watermarkLayer.width,
            opacity: watermarkLayer.opacity,
            fromSeconds: 0,
            toSeconds: endCardFrom,
          }
        : null,
    persistentTagline:
      persistent && persistent.kind === "text"
        ? { text: PRIMARY_TAGLINE, fromSeconds: 0, toSeconds: endCardFrom }
        : null,
    cta:
      ctaLayer && ctaLayer.kind === "text" && ctaLayer.value.trim().length > 0
        ? {
            text: ctaLayer.value,
            fromSeconds: Math.max(0, endCardFrom - 3),
            toSeconds: endCardFrom,
          }
        : null,
    endCard: {
      fromSeconds: endCardFrom,
      logoUrl: OFFICIAL_LOCKUP_URL,
      widthFraction: 0.46,
      tagline: input.tagline,
      website: rules.allowWebsiteBurnIn ? profile.website : null,
    },
  };

  return {
    ...plan,
    digest: digestOf(
      JSON.stringify([
        plan.platform,
        plan.aspect,
        plan.width,
        plan.height,
        plan.fps,
        plan.seconds,
        plan.watermark?.url ?? null,
        plan.persistentTagline?.text ?? null,
        plan.cta?.text ?? null,
        plan.endCard.tagline,
        plan.endCard.website,
        plan.endCard.logoUrl,
      ]),
    ),
  };
}

/**
 * What the compositor actually drew. Counted while drawing, never assumed.
 */
export type CompositionReceipt = {
  planDigest: string;
  width: number;
  height: number;
  fps: number;
  seconds: number;
  framesDrawn: number;
  watermarkFrames: number;
  taglineFrames: number;
  ctaFrames: number;
  endCardFrames: number;
  /** The artwork files genuinely loaded and painted into the frames. */
  artworkUrls: string[];
  audio: "copied" | "none";
  bytes: number;
};

export type CompositionCheck = { id: string; passed: boolean; detail: string };
export type CompositionVerdict = {
  passed: boolean;
  checks: CompositionCheck[];
  failures: string[];
};

/**
 * Checks the receipt against the plan. This is the gate that stops an
 * unbranded artifact being stored as the finished video.
 */
export function validateComposition(
  plan: BrandCompositionPlan,
  receipt: CompositionReceipt,
): CompositionVerdict {
  const checks: CompositionCheck[] = [];
  const add = (id: string, passed: boolean, detail: string) => checks.push({ id, passed, detail });

  add(
    "plan_match",
    receipt.planDigest === plan.digest,
    receipt.planDigest === plan.digest
      ? "The finished file was composed from this exact branding plan."
      : "The finished file was composed from a different branding plan.",
  );
  add(
    "frames_drawn",
    receipt.framesDrawn > 0,
    receipt.framesDrawn > 0
      ? `${receipt.framesDrawn} frames were composed.`
      : "No frames were composed.",
  );
  add(
    "dimensions",
    receipt.width === plan.width && receipt.height === plan.height,
    receipt.width === plan.width && receipt.height === plan.height
      ? `Composed at ${receipt.width}×${receipt.height}.`
      : `Composed at ${receipt.width}×${receipt.height}, not ${plan.width}×${plan.height}.`,
  );
  add(
    "duration",
    Math.abs(receipt.seconds - plan.seconds) <= 1.5,
    `Composed film runs ${receipt.seconds.toFixed(1)}s against a planned ${plan.seconds}s.`,
  );

  const endCardFrames = Math.max(1, Math.round((plan.seconds - plan.endCard.fromSeconds) * 0.5));
  add(
    "end_card_logo",
    receipt.endCardFrames >= endCardFrames && receipt.artworkUrls.includes(plan.endCard.logoUrl),
    receipt.endCardFrames >= endCardFrames && receipt.artworkUrls.includes(plan.endCard.logoUrl)
      ? "The approved EarnRoom lock-up was painted onto the closing card."
      : "The approved EarnRoom lock-up was not painted onto the closing card.",
  );
  add(
    "end_card_tagline",
    receipt.endCardFrames > 0 && plan.endCard.tagline.trim().length > 0,
    plan.endCard.tagline.trim().length > 0
      ? `Closing tagline: "${plan.endCard.tagline}".`
      : "No closing tagline was composed.",
  );

  if (plan.watermark) {
    const passed = receipt.watermarkFrames > 0 && receipt.artworkUrls.includes(plan.watermark.url);
    add(
      "watermark",
      passed,
      passed
        ? `The approved wordmark was carried across ${receipt.watermarkFrames} frames.`
        : "The approved wordmark was not carried through the film.",
    );
  } else {
    add("watermark", true, "No watermark on this platform, by its own rules.");
  }

  if (plan.persistentTagline) {
    add(
      "tagline_persistent",
      receipt.taglineFrames > 0,
      receipt.taglineFrames > 0
        ? `"${plan.persistentTagline.text}" was held across ${receipt.taglineFrames} frames.`
        : `"${plan.persistentTagline.text}" was never drawn.`,
    );
  } else {
    add("tagline_persistent", true, "No persistent tagline on this platform, by its own rules.");
  }

  add(
    "artwork_official",
    receipt.artworkUrls.length > 0 &&
      receipt.artworkUrls.every(
        (url) => url === OFFICIAL_LOCKUP_URL || url === OFFICIAL_WORDMARK_URL,
      ),
    receipt.artworkUrls.length > 0 &&
      receipt.artworkUrls.every(
        (url) => url === OFFICIAL_LOCKUP_URL || url === OFFICIAL_WORDMARK_URL,
      )
      ? "Only the approved EarnRoom artwork files were used."
      : "The composition used artwork that is not the approved EarnRoom files.",
  );

  const failures = checks.filter((check) => !check.passed).map((check) => check.detail);
  return { passed: failures.length === 0, checks, failures };
}
