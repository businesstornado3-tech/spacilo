/**
 * Platform-specific branding profiles.
 *
 * The same branding cannot be burned into every platform's version. TikTok in
 * particular restricts promotional watermarks and third-party branding in
 * content submitted through its publishing API, so EarnRoom produces a
 * compliant variant there rather than quietly breaking the platform's rules.
 *
 * These profiles are configuration, not model output, and every removal is
 * recorded so the founder can see what was left out and why.
 *
 * Pure module.
 */
import type { PlatformId } from "../types";
import type { AppliedBranding } from "./types";

export type PlatformBrandRules = {
  platform: PlatformId;
  /** Persistent corner wordmark across the whole video. */
  allowWatermark: boolean;
  /** A closing brand card. */
  allowEndCard: boolean;
  /** Burning the website address into the pixels. */
  allowWebsiteBurnIn: boolean;
  /** Longest sensible runtime for this surface, in seconds. */
  maxSeconds: number;
  /** Why the rules are what they are, in plain English. */
  note: string;
};

const RULES: Record<PlatformId, PlatformBrandRules> = {
  youtube: {
    platform: "youtube",
    allowWatermark: true,
    allowEndCard: true,
    allowWebsiteBurnIn: true,
    maxSeconds: 180,
    note: "Full EarnRoom branding is allowed.",
  },
  youtube_shorts: {
    platform: "youtube_shorts",
    allowWatermark: true,
    allowEndCard: true,
    allowWebsiteBurnIn: true,
    maxSeconds: 60,
    note: "Full EarnRoom branding is allowed.",
  },
  instagram: {
    platform: "instagram",
    allowWatermark: true,
    allowEndCard: true,
    allowWebsiteBurnIn: true,
    maxSeconds: 90,
    note: "Full EarnRoom branding is allowed, subject to current platform rules.",
  },
  facebook: {
    platform: "facebook",
    allowWatermark: true,
    allowEndCard: true,
    allowWebsiteBurnIn: true,
    maxSeconds: 90,
    note: "Full EarnRoom branding is allowed, subject to current platform rules.",
  },
  linkedin: {
    platform: "linkedin",
    allowWatermark: true,
    allowEndCard: true,
    allowWebsiteBurnIn: true,
    maxSeconds: 180,
    note: "Full EarnRoom branding is allowed, subject to current platform rules.",
  },
  pinterest: {
    platform: "pinterest",
    allowWatermark: true,
    allowEndCard: true,
    allowWebsiteBurnIn: true,
    maxSeconds: 90,
    note: "Full EarnRoom branding is allowed, subject to current platform rules.",
  },
  tiktok: {
    platform: "tiktok",
    allowWatermark: false,
    allowEndCard: true,
    allowWebsiteBurnIn: false,
    maxSeconds: 60,
    note: "TikTok restricts promotional watermarks and burned-in web addresses in content posted through its publishing API, so this version carries a plain closing card only. The web address goes in the caption instead.",
  },
};

export function brandRules(platform: PlatformId): PlatformBrandRules {
  return RULES[platform] ?? RULES.youtube;
}

/** Works out the branding actually applied for one platform version. */
export function applyBranding(input: {
  platform: PlatformId;
  tagline: string;
  website: string;
  cta: string;
}): AppliedBranding {
  const rules = brandRules(input.platform);
  const notes: string[] = [];
  if (!rules.allowWatermark) notes.push("No persistent watermark — platform rules.");
  if (!rules.allowWebsiteBurnIn) notes.push("Web address kept out of the pixels — platform rules.");
  if (notes.length > 0) notes.push(rules.note);

  return {
    platform: input.platform,
    showWatermark: rules.allowWatermark,
    showEndCard: rules.allowEndCard,
    showWebsite: rules.allowWebsiteBurnIn,
    tagline: rules.allowEndCard ? input.tagline : null,
    website: rules.allowWebsiteBurnIn ? input.website : null,
    cta: input.cta,
    notes,
  };
}
