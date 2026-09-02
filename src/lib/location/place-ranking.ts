/**
 * Generic place-candidate ranking.
 *
 * A place-name lookup can return many same-named settlements across the UK
 * (there are several "Southsea"s, several "Portsmouth"s, dozens of
 * "Little London"s). Taking the provider's first row is arbitrary, so a
 * search could silently centre hundreds of miles from what the user meant
 * and legitimately return zero listings.
 *
 * This module ranks candidates deterministically and location-agnostically:
 *   1. how well the name matches what was typed,
 *   2. whether an optional qualifier ("Southsea, Portsmouth", "Southsea PO5")
 *      matches the candidate's county / district / region / outcode,
 *   3. settlement significance (a city outranks a hamlet of the same name).
 *
 * No place, postcode or coordinate is hard-coded anywhere.
 */

export interface PlaceCandidate {
  name_1?: string | null;
  local_type?: string | null;
  county_unitary?: string | null;
  district_borough?: string | null;
  region?: string | null;
  country?: string | null;
  outcode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

/** Lowercase, strip punctuation, collapse whitespace. */
export function normaliseName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Relative significance of a settlement type. Larger settlements win ties
 * because they are the statistically likelier intent for a bare place name.
 */
const SETTLEMENT_WEIGHT: Record<string, number> = {
  city: 60,
  town: 50,
  "suburban area": 40,
  "other settlement": 35,
  village: 20,
  hamlet: 10,
};

export function settlementWeight(localType: string | null | undefined): number {
  if (!localType) return 5;
  return SETTLEMENT_WEIGHT[localType.toLowerCase()] ?? 5;
}

/** Splits "Southsea, Portsmouth" into the place and an optional qualifier. */
export function splitQuery(raw: string): { name: string; qualifier: string } {
  const [first, ...rest] = raw.split(",");
  return {
    name: normaliseName(first ?? ""),
    qualifier: normaliseName(rest.join(" ")),
  };
}

function qualifierFields(candidate: PlaceCandidate): string {
  return normaliseName(
    [
      candidate.county_unitary,
      candidate.district_borough,
      candidate.region,
      candidate.country,
      candidate.outcode,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

/** Higher is better. Returns null when the candidate does not match at all. */
export function scorePlaceCandidate(query: string, candidate: PlaceCandidate): number | null {
  const name = normaliseName(String(candidate.name_1 ?? ""));
  if (!name) return null;

  // "Place, Qualifier" is explicit. Without a comma the trailing words may
  // still be a qualifier ("Ambridge AB1"), so every split is considered and
  // the strongest interpretation wins.
  const explicit = splitQuery(query);
  const interpretations: { name: string; qualifier: string }[] = [explicit];
  if (!explicit.qualifier) {
    const tokens = explicit.name.split(" ").filter(Boolean);
    for (let i = tokens.length - 1; i >= 1; i -= 1) {
      interpretations.push({
        name: tokens.slice(0, i).join(" "),
        qualifier: tokens.slice(i).join(" "),
      });
    }
  }

  let best: number | null = null;
  for (const { name: wanted, qualifier } of interpretations) {
    if (!wanted) continue;
    let score: number;
    if (name === wanted) score = 1000;
    else if (name.startsWith(`${wanted} `)) score = 400;
    else if (name.endsWith(` ${wanted}`)) score = 300;
    else if (name.includes(wanted)) score = 150;
    else continue;

    if (qualifier) {
      const haystack = qualifierFields(candidate);
      const hit = qualifier
        .split(" ")
        .some((token) => token.length > 1 && haystack.includes(token));
      if (hit) score += 500;
      else score -= 200; // an unmatched qualifier makes this reading less likely
    }

    score += settlementWeight(candidate.local_type);
    // Prefer the tighter name when everything else ties ("London" over "London Fields").
    score += Math.max(0, 20 - name.length) / 100;
    if (best === null || score > best) best = score;
  }
  return best;
}


/** Best candidate for the typed query, or null when none is a plausible match. */
export function pickBestPlace<T extends PlaceCandidate>(query: string, candidates: T[]): T | null {
  let best: { row: T; score: number } | null = null;
  for (const row of candidates) {
    const score = scorePlaceCandidate(query, row);
    if (score === null) continue;
    if (!best || score > best.score) best = { row, score };
  }
  return best?.row ?? null;
}
