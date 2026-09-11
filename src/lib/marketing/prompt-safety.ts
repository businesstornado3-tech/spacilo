/**
 * Keeps EarnRoom's identity out of everything a video model is ever asked for.
 *
 * The generative model films people, places and light. It never draws a logo,
 * a wordmark, a tagline, a web address or a company name: all of that is added
 * afterwards by EarnRoom's own deterministic production layer, from the real
 * approved artwork.
 *
 * Two separate rules live here:
 *
 * 1. Identity terms (the name, the tagline, the domain) must not appear in a
 *    provider-facing prompt at all — not even inside a "do not draw this"
 *    sentence, because campaign copy written by the intelligence layer can
 *    otherwise leak the brand into a scene direction.
 * 2. Branding nouns (logo, wordmark, watermark, end card…) may appear ONLY
 *    inside the single canonical prohibition line below, which tells the model
 *    to draw none of them.
 *
 * Pure module: no clock, no network.
 */

/** The one sentence that is allowed to name branding, and only to forbid it. */
export const PROHIBITION_LINE =
  "Do not render any text, captions, subtitles, letters, numbers, logos, watermarks, brand names, signage, URLs or promotional graphics anywhere in the picture.";

/** Identity terms: never acceptable in a provider-facing prompt. */
const IDENTITY_PATTERNS: { pattern: RegExp; replacement: string }[] = [
  // A branded object ("the EarnRoom logo on the wall") is removed whole, so no
  // stray noun is left standing in a scene direction.
  {
    pattern:
      /\b(the\s+)?(earn\s?room|spacilo)('s)?\s+(logo(type)?s?|wordmarks?|watermarks?|signs?|banners?|vans?|brand\w*|name)\b/gi,
    replacement: "",
  },
  { pattern: /earnroom\.co\.uk/gi, replacement: "" },
  { pattern: /\bmake\s+space\s+earn\b\.?/gi, replacement: "" },
  { pattern: /\bearn\s?room('s)?\b/gi, replacement: "the storage service" },
  { pattern: /\bspacilo('s)?\b/gi, replacement: "the storage service" },
  { pattern: /https?:\/\/\S+/gi, replacement: "" },
  { pattern: /\b[\w-]+\.(co\.uk|com|net|io|org|app)\b/gi, replacement: "" },
];

/** Branding nouns: allowed only inside the prohibition line. */
const BRANDING_NOUNS: { pattern: RegExp; replacement: string }[] = [
  { pattern: /\bbrand(ed|ing)?\s+(identity|mark|name|text|typography|card)\b/gi, replacement: "" },
  { pattern: /\bwordmark(s)?\b/gi, replacement: "" },
  { pattern: /\bwatermark(s)?\b/gi, replacement: "" },
  { pattern: /\blogo(s|type)?\b/gi, replacement: "" },
  { pattern: /\bend\s?card(s)?\b/gi, replacement: "closing frame" },
  { pattern: /\bcompany\s+name\b/gi, replacement: "" },
];

function tidy(text: string): string {
  return text
    .replace(/[ \t]{2,}/g, " ")
    // Tidy the sentence fragments a removal can leave behind.
    .replace(/\b(at|on|from|visit|via|to)\s*(?=[.,;:]|$)/gi, "")
    .replace(/\bthe\s+the\b/gi, "the")
    .replace(/\b(with|showing|featuring)\s+(?=(on|in|at|above|beside)\b)/gi, "")
    .replace(/\s+[—-]\s*(?=[.,;:]|$)/g, "")
    .replace(/\s+([.,;:])/g, "$1")
    .replace(/([.,;:]){2,}/g, "$1")
    .replace(/^[\s.,;:—-]+/, "")
    .trim();
}

/**
 * Rewrites campaign-derived copy into neutral cinematic language that carries
 * no EarnRoom identity and no instruction to draw branding.
 */
export function sanitizeProviderText(text: string): string {
  let out = text;
  for (const { pattern, replacement } of IDENTITY_PATTERNS) out = out.replace(pattern, replacement);
  for (const { pattern, replacement } of BRANDING_NOUNS) out = out.replace(pattern, replacement);
  return tidy(out);
}

/**
 * Every branding term still present in a finished provider-facing prompt.
 * The canonical prohibition line is excluded, since forbidding branding is the
 * one place those words belong.
 */
export function findBrandTerms(prompt: string): string[] {
  const scanned = prompt.split(PROHIBITION_LINE).join(" ");
  const found = new Set<string>();
  for (const { pattern } of [...IDENTITY_PATTERNS, ...BRANDING_NOUNS]) {
    const matches = scanned.match(new RegExp(pattern.source, pattern.flags));
    for (const match of matches ?? []) {
      const term = match.trim();
      if (term) found.add(term.toLowerCase());
    }
  }
  return [...found];
}

/** True when a prompt is safe to send to a video generation service. */
export function isBrandFreePrompt(prompt: string): boolean {
  return findBrandTerms(prompt).length === 0;
}
