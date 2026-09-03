/**
 * UK location recognition for the discovery engine.
 *
 * Location is ONE dimension of intent, never the architecture. This file only
 * answers "did the searcher name a UK place, and what is its canonical slug?"
 * — it makes no claim whatsoever about whether EarnRoom has supply there. That
 * question is answered at request time from real marketplace data.
 *
 * The list is alphabetical and carries no ranking, no pilot region and no
 * geographic boundary: any UK place can be added without touching logic.
 */

export type UkPlaceKind = "city" | "town" | "region" | "nation";

export type UkPlace = {
  /** URL slug used by /storage/$location. */
  slug: string;
  /** Display name exactly as it should appear in copy. */
  name: string;
  kind: UkPlaceKind;
  /** Extra spellings/aliases seen in natural queries. */
  aliases?: readonly string[];
};

/**
 * Recognised places. Presence here means "we can parse and canonicalise this
 * name", NOT "we operate here" and NOT "a page exists".
 */
export const UK_PLACES: readonly UkPlace[] = [
  { slug: "aberdeen", name: "Aberdeen", kind: "city" },
  { slug: "bath", name: "Bath", kind: "city" },
  { slug: "belfast", name: "Belfast", kind: "city" },
  { slug: "birmingham", name: "Birmingham", kind: "city" },
  { slug: "bournemouth", name: "Bournemouth", kind: "town" },
  { slug: "brighton", name: "Brighton", kind: "city", aliases: ["brighton and hove", "hove"] },
  { slug: "bristol", name: "Bristol", kind: "city" },
  { slug: "cambridge", name: "Cambridge", kind: "city" },
  { slug: "canterbury", name: "Canterbury", kind: "city" },
  { slug: "cardiff", name: "Cardiff", kind: "city" },
  { slug: "chelmsford", name: "Chelmsford", kind: "city" },
  { slug: "cheltenham", name: "Cheltenham", kind: "town" },
  { slug: "chester", name: "Chester", kind: "city" },
  { slug: "colchester", name: "Colchester", kind: "town" },
  { slug: "coventry", name: "Coventry", kind: "city" },
  { slug: "derby", name: "Derby", kind: "city" },
  { slug: "dundee", name: "Dundee", kind: "city" },
  { slug: "durham", name: "Durham", kind: "city" },
  { slug: "edinburgh", name: "Edinburgh", kind: "city" },
  { slug: "exeter", name: "Exeter", kind: "city" },
  { slug: "glasgow", name: "Glasgow", kind: "city" },
  { slug: "gloucester", name: "Gloucester", kind: "city" },
  { slug: "guildford", name: "Guildford", kind: "town" },
  { slug: "hull", name: "Hull", kind: "city", aliases: ["kingston upon hull"] },
  { slug: "ipswich", name: "Ipswich", kind: "town" },
  { slug: "leeds", name: "Leeds", kind: "city" },
  { slug: "leicester", name: "Leicester", kind: "city" },
  { slug: "lincoln", name: "Lincoln", kind: "city" },
  { slug: "liverpool", name: "Liverpool", kind: "city" },
  { slug: "london", name: "London", kind: "city" },
  { slug: "luton", name: "Luton", kind: "town" },
  { slug: "manchester", name: "Manchester", kind: "city" },
  { slug: "milton-keynes", name: "Milton Keynes", kind: "town" },
  { slug: "newcastle", name: "Newcastle upon Tyne", kind: "city", aliases: ["newcastle upon tyne"] },
  { slug: "northampton", name: "Northampton", kind: "town" },
  { slug: "norwich", name: "Norwich", kind: "city" },
  { slug: "nottingham", name: "Nottingham", kind: "city" },
  { slug: "oxford", name: "Oxford", kind: "city" },
  { slug: "peterborough", name: "Peterborough", kind: "city" },
  { slug: "plymouth", name: "Plymouth", kind: "city" },
  { slug: "portsmouth", name: "Portsmouth", kind: "city" },
  { slug: "preston", name: "Preston", kind: "city" },
  { slug: "reading", name: "Reading", kind: "town" },
  { slug: "sheffield", name: "Sheffield", kind: "city" },
  { slug: "southampton", name: "Southampton", kind: "city" },
  { slug: "stoke-on-trent", name: "Stoke-on-Trent", kind: "city" },
  { slug: "sunderland", name: "Sunderland", kind: "city" },
  { slug: "swansea", name: "Swansea", kind: "city" },
  { slug: "swindon", name: "Swindon", kind: "town" },
  { slug: "wolverhampton", name: "Wolverhampton", kind: "city" },
  { slug: "worcester", name: "Worcester", kind: "city" },
  { slug: "york", name: "York", kind: "city" },
] as const;

/** UK postcode district, e.g. "PO4" or "SW1A". Never a full postcode. */
const POSTCODE_DISTRICT_RE = /\b([A-Z]{1,2}\d[A-Z\d]?)\b/i;

export type LocationReading =
  | { kind: "place"; place: UkPlace; nearMe: false; evidence: string }
  | { kind: "postcode_district"; district: string; nearMe: false; evidence: string }
  | { kind: "near_me"; nearMe: true; evidence: string }
  | { kind: "none"; nearMe: false };

const byName = new Map<string, UkPlace>();
for (const place of UK_PLACES) {
  byName.set(place.name.toLowerCase(), place);
  for (const alias of place.aliases ?? []) byName.set(alias.toLowerCase(), place);
}

export function placeBySlug(slug: string): UkPlace | null {
  const wanted = slug.trim().toLowerCase();
  return UK_PLACES.find((p) => p.slug === wanted) ?? null;
}

/**
 * Reads any location dimension out of a natural-language query.
 * Returns `{ kind: "none" }` for UK-wide intents — which is a perfectly valid,
 * fully supported outcome, not a failure.
 */
export function readLocation(query: string): LocationReading {
  const text = query.toLowerCase();

  if (/\b(near me|nearby|near by|close to me|local to me|around here)\b/.test(text)) {
    return { kind: "near_me", nearMe: true, evidence: "near me" };
  }

  // Longest name first so "Newcastle upon Tyne" wins over "Newcastle".
  const names = [...byName.keys()].sort((a, b) => b.length - a.length);
  for (const name of names) {
    if (new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(text)) {
      const place = byName.get(name);
      if (place) return { kind: "place", place, nearMe: false, evidence: name };
    }
  }

  const district = POSTCODE_DISTRICT_RE.exec(query.toUpperCase());
  // Only treat it as a postcode district when the query looks postcode-ish;
  // bare words like "M1" inside prose are otherwise a common false positive.
  if (district?.[1] && /\b(postcode|area|near|in|storage)\b/i.test(query)) {
    return { kind: "postcode_district", district: district[1], nearMe: false, evidence: district[1] };
  }

  return { kind: "none", nearMe: false };
}

/** Human label for any reading, used in copy and metadata. */
export function locationLabel(reading: LocationReading): string | null {
  switch (reading.kind) {
    case "place":
      return reading.place.name;
    case "postcode_district":
      return reading.district;
    case "near_me":
      return "near you";
    default:
      return null;
  }
}

/** Matches a published listing using only its approximate public area. */
export function listingMatchesPlace(
  listing: { approximate_area?: string | null; postcode_district?: string | null },
  place: UkPlace | null,
): boolean {
  if (!place) return false;
  const area = listing.approximate_area?.trim().toLowerCase() ?? "";
  if (!area) return false;
  const names = [place.name, ...(place.aliases ?? [])].map((value) => value.toLowerCase());
  return names.some((name) => area === name || area.includes(name) || name.includes(area));
}
