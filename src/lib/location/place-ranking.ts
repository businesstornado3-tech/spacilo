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

/** Stable identity string, used only as a final order-independent tie-break. */
function tieBreakKey(candidate: PlaceCandidate): string {
  return [
    normaliseName(String(candidate.name_1 ?? "")),
    normaliseName(String(candidate.county_unitary ?? "")),
    normaliseName(String(candidate.district_borough ?? "")),
    normaliseName(String(candidate.region ?? "")),
    normaliseName(String(candidate.outcode ?? "")),
    Number.isFinite(Number(candidate.latitude)) ? Number(candidate.latitude).toFixed(5) : "",
    Number.isFinite(Number(candidate.longitude)) ? Number(candidate.longitude).toFixed(5) : "",
  ].join("|");
}

/** A candidate is only usable when it carries finite coordinates. */
function hasUsablePoint(candidate: PlaceCandidate): boolean {
  return (
    typeof candidate.latitude === "number" &&
    Number.isFinite(candidate.latitude) &&
    typeof candidate.longitude === "number" &&
    Number.isFinite(candidate.longitude)
  );
}

export interface RankedPlace<T extends PlaceCandidate> {
  row: T;
  score: number;
  key: string;
}

/**
 * Deterministic ranking. The returned order depends only on the candidate
 * data and the query — never on the order the provider happened to return.
 * Candidates with missing coordinates may still be ranked for pure metadata
 * callers; geographic resolution filters them before selecting a centre.
 */
export function rankCandidates<T extends PlaceCandidate>(
  query: string,
  candidates: readonly T[],
): RankedPlace<T>[] {
  const ranked: RankedPlace<T>[] = [];
  const seen = new Set<string>();
  for (const row of candidates ?? []) {
    if (!row || typeof row !== "object") continue;
    const score = scorePlaceCandidate(query, row);
    if (score === null || !Number.isFinite(score)) continue;
    const key = tieBreakKey(row);
    if (seen.has(key)) continue; // duplicate rows must not create false ambiguity
    seen.add(key);
    ranked.push({ row, score, key });
  }
  // score desc → settlement significance desc → stable key asc.
  return ranked.sort(
    (a, b) =>
      b.score - a.score ||
      settlementWeight(b.row.local_type) - settlementWeight(a.row.local_type) ||
      (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
  );
}

/** Best candidate for the typed query, or null when none is a plausible match. */
export function pickBestPlace<T extends PlaceCandidate>(
  query: string,
  candidates: readonly T[],
): T | null {
  return rankCandidates(query, candidates)[0]?.row ?? null;
}

/** Degrees→miles is location-dependent; this rough figure only gauges "same area". */
function roughMilesApart(a: PlaceCandidate, b: PlaceCandidate): number {
  const dLat = (Number(a.latitude) - Number(b.latitude)) * 69;
  const dLng =
    (Number(a.longitude) - Number(b.longitude)) *
    69 *
    Math.cos(((Number(a.latitude) + Number(b.latitude)) / 2) * (Math.PI / 180));
  return Math.hypot(dLat, dLng);
}

/** Runners-up are only "ambiguous" if they score as well and sit elsewhere. */
const AMBIGUITY_SCORE_MARGIN = 1;
const AMBIGUITY_MIN_MILES = 10;

export interface PlaceResolution<T extends PlaceCandidate> {
  best: T | null;
  /** Same-strength candidates in a materially different place, best first. */
  alternatives: T[];
}

export function resolvePlace<T extends PlaceCandidate>(
  query: string,
  candidates: readonly T[],
): PlaceResolution<T> {
  // Ranking can be useful with metadata-only fixtures, but resolution must
  // never select a row that cannot produce a geographic centre.
  const ranked = rankCandidates(query, candidates.filter(hasUsablePoint));
  const top = ranked[0];
  if (!top) return { best: null, alternatives: [] };
  const alternatives = ranked
    .slice(1)
    .filter(
      (entry) =>
        top.score - entry.score <= AMBIGUITY_SCORE_MARGIN &&
        roughMilesApart(top.row, entry.row) >= AMBIGUITY_MIN_MILES,
    )
    .slice(0, 4)
    .map((entry) => entry.row);
  return { best: top.row, alternatives };
}

