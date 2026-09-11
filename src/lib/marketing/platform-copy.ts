/**
 * Platform-native copy for the SAME campaign asset.
 *
 * One campaign, one production video, platform adaptations. This module never
 * invents a fact: it only rewords the campaign's own hook, description and call
 * to action for the platform's conventions, and it refuses any line carrying a
 * fabricated statistic, testimonial, demand figure or earnings guarantee.
 *
 * Pure module: no clock, no network, no database.
 */
import { brand } from "@/config/brand";

/** The only destination EarnRoom links to. Never a made-up URL. */
export const EARNROOM_URL = "https://earnroom.co.uk";

export type CampaignCopySource = {
  hook: string;
  title: string;
  description: string;
  cta: string;
  hashtags: readonly string[];
};

export type PlatformCopy = {
  title: string;
  /** The post body / commentary / pin description. */
  body: string;
  /** Only Pinterest uses a destination link field. */
  link: string;
};

/**
 * Claim shapes EarnRoom must never publish: invented numbers, invented
 * customers and guaranteed money.
 */
const FORBIDDEN = [
  /\b\d+(\.\d+)?\s*%/,
  /\bthousands?\b/i,
  /\bmillions?\b/i,
  /\bguarantee(d|s)?\b/i,
  /\btestimonial/i,
  /\brated\s+\d/i,
  /\b\d+\s*(customers?|hosts?|renters?|users?|reviews?)\b/i,
  /\bearn\s+£\s?\d/i,
];

/** True when a line makes a claim EarnRoom cannot stand behind. */
export function containsUnsupportedClaim(text: string): boolean {
  return FORBIDDEN.some((pattern) => pattern.test(text));
}

function clean(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Strips any sentence that makes an unsupported claim. */
function safeSentences(text: string): string {
  return clean(
    text
      .split(/(?<=[.!?])\s+/)
      .filter((sentence) => sentence && !containsUnsupportedClaim(sentence))
      .join(" "),
  );
}

/**
 * LinkedIn: professional, useful and concise. Deliberately not the Instagram
 * or Facebook line — it explains the idea rather than shouting the hook.
 */
export function linkedinCopy(source: CampaignCopySource): PlatformCopy {
  const subject = safeSentences(source.description) || `${brand.name}. ${brand.tagline}`;
  const body = clean(
    [
      safeSentences(source.hook),
      subject,
      `${brand.name} connects people who need storage with neighbours who have space to spare, across the UK.`,
      safeSentences(source.cta) || `More at ${EARNROOM_URL}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
  );
  return {
    title: clean(source.title).slice(0, 200),
    body: body.slice(0, 2800),
    link: EARNROOM_URL,
  };
}

/**
 * Pinterest: search-friendly and practical. A Pin is found by what it helps
 * someone do, so the description leads with the need, not the brand.
 */
export function pinterestCopy(source: CampaignCopySource): PlatformCopy {
  const keywords = source.hashtags
    .map((tag) => tag.replace(/^#/, "").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase())
    .filter(Boolean)
    .slice(0, 5);
  const body = clean(
    [
      safeSentences(source.description) || `${brand.name}. ${brand.tagline}`,
      `Storage space rented from people nearby, across the UK.`,
      keywords.length ? `Ideas for: ${keywords.join(", ")}.` : "",
    ]
      .filter(Boolean)
      .join(" "),
  );
  return {
    title: (clean(source.title) || `${brand.name} — ${brand.tagline}`).slice(0, 100),
    body: body.slice(0, 800),
    link: EARNROOM_URL,
  };
}

/**
 * TikTok: the on-platform title only. TikTok shows the caption as the post
 * title, so it stays short and keeps the campaign's own hook.
 */
export function tiktokCopy(source: CampaignCopySource): PlatformCopy {
  const body = clean(
    [safeSentences(source.hook) || clean(source.title), source.hashtags.slice(0, 3).join(" ")]
      .filter(Boolean)
      .join(" "),
  );
  return { title: body.slice(0, 150), body: body.slice(0, 150), link: EARNROOM_URL };
}
