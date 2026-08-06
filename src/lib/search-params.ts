/**
 * Canonical search URL state.
 *
 * The URL is the single source of truth for location, radius, sort and
 * filters, so results survive refresh and Back from a listing.
 * /search?location=PO4%208LB&radius=5&sort=recommended&types=garage
 */
import type { SearchSchemaInput } from "@tanstack/react-router";

import { DEFAULT_RADIUS_MILES, normaliseRadius } from "@/lib/location/schema";
import type { SearchFilters, SortKey } from "@/hooks/useStorageSearch";

const SORTS: SortKey[] = [
  "recommended",
  "spacefit",
  "distance",
  "price_asc",
  "price_desc",
  "largest",
  "newest",
];

const BOOL_KEYS = ["groundFloor", "vehicleAccess", "liftAvailable", "verifiedHost"] as const;
type BoolKey = (typeof BOOL_KEYS)[number];

export interface SearchUrlState {
  location: string;
  radius: number;
  sort: SortKey;
  maxPrice?: number;
  types?: string[];
  features?: string[];
  access?: string[];
  categories?: string[];
  minVolume?: number;
  groundFloor?: boolean;
  vehicleAccess?: boolean;
  liftAvailable?: boolean;
  verifiedHost?: boolean;
}

const bool = (value: unknown): true | undefined =>
  value === true || value === "true" || value === "1" ? true : undefined;

const str = (value: unknown) => (typeof value === "string" ? value : undefined);

function list(value: unknown): string[] | undefined {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  const raw = str(value);
  if (!raw) return undefined;
  const parts = raw.split(",").map((v) => v.trim()).filter(Boolean);
  return parts.length ? parts : undefined;
}

function num(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : Number(str(value));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * Every field has a defined fallback, so an empty URL is valid.
 *
 * The parameter is branded with TanStack's `SearchSchemaInput` so the typed
 * router treats the *input* as "any/empty object" while the *output* keeps its
 * required, defaulted fields. Without the brand the router infers the input
 * from the return type and demands `search` on every link to this route.
 */
export function validateSearchParams(
  search: Record<string, unknown> & SearchSchemaInput = {} as Record<string, unknown> &
    SearchSchemaInput,
): SearchUrlState {
  const sortRaw = str(search["sort"]) as SortKey | undefined;
  return {
    location: str(search["location"])?.slice(0, 120) ?? "",
    radius: search["radius"] === undefined ? DEFAULT_RADIUS_MILES : normaliseRadius(search["radius"]),
    sort: sortRaw && SORTS.includes(sortRaw) ? sortRaw : "recommended",
    ...(num(search["maxPrice"]) !== undefined ? { maxPrice: num(search["maxPrice"]) as number } : {}),
    ...(list(search["types"]) ? { types: list(search["types"]) as string[] } : {}),
    ...(list(search["features"]) ? { features: list(search["features"]) as string[] } : {}),
    ...(list(search["access"]) ? { access: list(search["access"]) as string[] } : {}),
    ...(list(search["categories"]) ? { categories: list(search["categories"]) as string[] } : {}),
    ...(num(search["minVolume"]) !== undefined ? { minVolume: num(search["minVolume"]) as number } : {}),
    ...Object.fromEntries(
      BOOL_KEYS.filter((key) => bool(search[key])).map((key) => [key, true]),
    ),
  };
}

export function filtersFromUrl(state: SearchUrlState): SearchFilters {
  return {
    ...(state.maxPrice !== undefined ? { maxPricePence: Math.round(state.maxPrice * 100) } : {}),
    ...(state.types ? { spaceTypes: state.types } : {}),
    ...(state.features ? { features: state.features } : {}),
    ...(state.access ? { accessTypes: state.access } : {}),
    ...(state.categories ? { categories: state.categories } : {}),
    ...(state.minVolume !== undefined ? { minVolumeM3: state.minVolume } : {}),
    ...Object.fromEntries(BOOL_KEYS.filter((key) => state[key] === true).map((key) => [key, true])),
  };
}

export function filtersToUrl(filters: SearchFilters): Record<string, unknown> {
  return {
    ...(filters.maxPricePence !== undefined ? { maxPrice: filters.maxPricePence / 100 } : { maxPrice: undefined }),
    types: filters.spaceTypes,
    features: filters.features,
    access: filters.accessTypes,
    categories: filters.categories,
    minVolume: filters.minVolumeM3,
    ...Object.fromEntries(
      BOOL_KEYS.map((key) => [key, filters[key as BoolKey] === true ? true : undefined]),
    ),
  };
}
