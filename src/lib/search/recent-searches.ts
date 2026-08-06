/**
 * Recent and popular location searches.
 *
 * Purely a convenience layer over what the renter already typed: stored in
 * localStorage on their own device, never sent anywhere, never used for
 * ranking. Pure helpers are exported separately so they can be tested without
 * a browser.
 */
import { normaliseLocationInput } from "@/lib/location/schema";

export const RECENT_SEARCH_KEY = "spacilo.recent-searches.v1";
export const MAX_RECENT_SEARCHES = 6;

export interface RecentSearch {
  /** Display + submit value, already normalised. */
  location: string;
  radius: number;
}

/** Popular starting points for the pilot area. Static, never inferred. */
export const POPULAR_SEARCHES: string[] = [
  "Portsmouth",
  "Southsea",
  "Fratton",
  "Cosham",
  "Havant",
  "Gosport",
];

const isCoordinate = (value: string) => /^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/.test(value);

/** Newest first, de-duplicated case-insensitively, capped. Coordinates are skipped. */
export function addRecentSearch(
  list: RecentSearch[],
  entry: RecentSearch,
  max = MAX_RECENT_SEARCHES,
): RecentSearch[] {
  const location = normaliseLocationInput(entry.location);
  if (location.length < 2 || isCoordinate(location)) return list.slice(0, max);
  const key = location.toLowerCase();
  const rest = list.filter((item) => item.location.toLowerCase() !== key);
  return [{ location, radius: entry.radius }, ...rest].slice(0, max);
}

/** Suggestions for the location input: recents first, then unused popular areas. */
export function suggestLocations(
  recents: RecentSearch[],
  query: string,
  popular: string[] = POPULAR_SEARCHES,
  limit = 8,
): string[] {
  const q = query.trim().toLowerCase();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of [...recents.map((r) => r.location), ...popular]) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    if (q && !key.includes(q)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= limit) break;
  }
  return out;
}

function parse(raw: string | null): RecentSearch[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value
      .filter((v): v is RecentSearch => {
        if (!v || typeof v !== "object") return false;
        const item = v as Record<string, unknown>;
        return typeof item["location"] === "string" && typeof item["radius"] === "number";
      })
      .slice(0, MAX_RECENT_SEARCHES);
  } catch {
    return [];
  }
}

export function readRecentSearches(): RecentSearch[] {
  if (typeof window === "undefined") return [];
  try {
    return parse(window.localStorage.getItem(RECENT_SEARCH_KEY));
  } catch {
    return [];
  }
}

export function writeRecentSearch(entry: RecentSearch): RecentSearch[] {
  const next = addRecentSearch(readRecentSearches(), entry);
  if (typeof window === "undefined") return next;
  try {
    window.localStorage.setItem(RECENT_SEARCH_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable — recents are a convenience, never required */
  }
  return next;
}

export function clearRecentSearches(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(RECENT_SEARCH_KEY);
  } catch {
    /* ignore */
  }
}
