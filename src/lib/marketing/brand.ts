/**
 * EarnRoom brand profile for generated marketing.
 *
 * The identity itself is NOT redefined here — it is read from the single
 * source of truth (`src/config/brand.ts`) and the approved lock-up assets. This
 * module adds only the marketing-specific, APPROVED extras: campaign
 * messaging, CTA templates, watermark and end-card rules.
 *
 * The AI may select from approved messaging. It may never invent a new
 * permanent tagline.
 */
import { brand } from "@/config/brand";

export const BRAND_PROFILE_ID = "earnroom-2026";

/** Approved campaign messaging. Configuration, not model output. */
export const APPROVED_TAGLINES = [
  brand.tagline, // "Make space earn."
  "Your space can earn. Your stuff can fit.",
  "Turn spare space into income.",
  "Find space. Store smarter.",
  "Make space work for you.",
  "Storage from people with space to spare.",
] as const;

export const APPROVED_RENTER_CTAS = [
  "Find storage when you need it.",
  "Find space near you on EarnRoom.",
  "Tell us what you need to store.",
] as const;

export const APPROVED_HOST_CTAS = [
  "Turn unused space into income.",
  "See what your spare space could earn.",
  "List your space on EarnRoom.",
] as const;

export const BRAND_WEBSITE = "earnroom.co.uk";
export const BRAND_URL = "https://earnroom.co.uk";

export type BrandProfile = {
  id: string;
  name: string;
  website: string;
  url: string;
  taglines: readonly string[];
  renterCtas: readonly string[];
  hostCtas: readonly string[];
  /** Design tokens, referenced by name so themes stay the source of truth. */
  colours: { primary: string; canvas: string; accentWarning: string };
  typography: { display: string; body: string };
  logoAsset: string;
  watermark: { position: "bottom-right"; asset: string; opacity: number };
  endCard: { tagline: string; website: string; showLogo: true };
  visualStyle: string;
};

export function brandProfile(): BrandProfile {
  return {
    id: BRAND_PROFILE_ID,
    name: brand.name,
    website: BRAND_WEBSITE,
    url: BRAND_URL,
    taglines: APPROVED_TAGLINES,
    renterCtas: APPROVED_RENTER_CTAS,
    hostCtas: APPROVED_HOST_CTAS,
    colours: { primary: "harbour-teal", canvas: "warm-neutral", accentWarning: "amber" },
    typography: { display: "Sora", body: "Manrope" },
    logoAsset: "src/assets/brand/earnroom-lockup.png",
    watermark: {
      position: "bottom-right",
      asset: "src/assets/brand/earnroom-wordmark-transparent.png",
      opacity: 0.85,
    },
    endCard: { tagline: brand.tagline, website: BRAND_WEBSITE, showLogo: true },
    visualStyle:
      "Premium, restrained, real UK homes and everyday spaces. Natural light, no neon, minimal gradients, no stock-advert gloss.",
  };
}

/** Deterministically picks an approved tagline for a campaign key. */
export function taglineFor(key: string): string {
  let hash = 0;
  for (let index = 0; index < key.length; index += 1)
    hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
  return APPROVED_TAGLINES[hash % APPROVED_TAGLINES.length]!;
}

export function isApprovedMessage(line: string): boolean {
  const normalised = line.trim().toLowerCase();
  return [...APPROVED_TAGLINES, ...APPROVED_RENTER_CTAS, ...APPROVED_HOST_CTAS].some(
    (approved) => approved.toLowerCase() === normalised,
  );
}

/**
 * Finds real misspellings of the brand name in campaign copy.
 *
 * The web address is lower case by nature — `earnroom.co.uk` inside a link is
 * the correct address, not a misspelling of the name — so web addresses and
 * handles are removed before the name itself is checked. Everything that
 * remains must read exactly "EarnRoom".
 */
export function brandMisspellings(text: string): string[] {
  const withoutLinks = text
    // Full URLs, bare domains and e-mail addresses.
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\b[\w.-]*earnroom[\w-]*\.(?:co\.uk|com|uk|io|net|org)\b/gi, " ")
    .replace(/\S+@\S+/g, " ");
  // Every plausible way of writing the name, correct or not.
  const pattern = /e\s?a\s?r\s?n[\s\-_]?r[o0a]{1,2}m{1,2}/gi;
  return (withoutLinks.match(pattern) ?? []).filter((match) => match !== brand.name);
}
