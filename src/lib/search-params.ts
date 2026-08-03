/**
 * Canonical search URL state.
 *
 * The URL is the single source of truth for location, radius, sort and
 * filters, so results survive refresh and Back from a listing.
 * /search?location=PO4%208LB&radius=5&sort=recommended&types=garage
 */
import { DEFAULT_RADIUS_MILES, normaliseRadius } from "@/lib/location/schema";
import type { SearchFilters, SortKey } from "@/hooks/useStorageSearch";

const SORTS: SortKey[] = ["recommended", "spacefit", "distance", "price_asc", "price_desc"];

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
}

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

export function validateSearchParams(search: Record<string, unknown>): SearchUrlState {
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
  };
}
