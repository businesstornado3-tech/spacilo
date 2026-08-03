/**
 * Canonical storage search.
 *
 * ONE implementation powers the homepage hero search, the public /search page
 * and the renter Search tab. Location answers "is it near me?"; SpaceFit
 * answers "does it suit my belongings?" — the two are combined for display
 * only and never mixed into a single number.
 */
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { geocodeSearchLocation } from "@/lib/location.functions";
import { searchPublishedSpaces, toPublicSearchRow, type SearchSpaceRow } from "@/lib/search-api";
import { signedPhotoUrls } from "@/lib/spaces-api";
import { toMatchSpace } from "@/lib/spacefit/adapters";
import { buildMatchInventory, evaluateSpace } from "@/lib/spacefit/engine";
import type { MatchSpace, SpaceFitResult } from "@/lib/spacefit/types";
import { useActiveInventory, useInventoryItems } from "@/hooks/useInventory";
import { normaliseRadius, type SearchCentre } from "@/lib/location/schema";

export type SortKey = "recommended" | "spacefit" | "distance" | "price_asc" | "price_desc";

export interface SearchFilters {
  maxPricePence?: number | undefined;
  spaceTypes?: string[] | undefined;
  features?: string[] | undefined;
  accessTypes?: string[] | undefined;
  categories?: string[] | undefined;
  minVolumeM3?: number | undefined;
}

export interface StorageSearchParams {
  location: string;
  radius: number;
  sort: SortKey;
  filters: SearchFilters;
}

export interface SearchResult {
  row: SearchSpaceRow;
  space: MatchSpace;
  /** null when the renter has no confirmed inventory — never fabricated. */
  result: SpaceFitResult | null;
  distanceMiles: number | null;
  coverUrl?: string;
}

/** Resolve the renter's typed location to a map centre (server-side geocoder). */
export function useSearchCentre(location: string) {
  const geocode = useServerFn(geocodeSearchLocation);
  const query = location.trim();
  return useQuery({
    queryKey: ["location", "geocode", query.toUpperCase()],
    queryFn: async () => geocode({ data: { query } }),
    enabled: query.length >= 2,
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: 1,
  });
}

function useCoverUrls(paths: string[]) {
  const key = paths.slice().sort().join("|");
  return useQuery({
    queryKey: ["spaces", "cover-urls", key],
    queryFn: () => signedPhotoUrls(paths),
    enabled: paths.length > 0,
    staleTime: 45 * 60 * 1000,
    gcTime: 50 * 60 * 1000,
  });
}

function matchesFilters(row: SearchSpaceRow, filters: SearchFilters): boolean {
  if (filters.maxPricePence !== undefined) {
    if ((row.monthly_price_pence ?? Infinity) > filters.maxPricePence) return false;
  }
  if (filters.spaceTypes?.length && !filters.spaceTypes.includes(String(row.space_type))) {
    return false;
  }
  if (filters.features?.length) {
    const features = row.features ?? [];
    if (!filters.features.every((f) => features.includes(f))) return false;
  }
  if (filters.accessTypes?.length && !filters.accessTypes.includes(String(row.access_type))) {
    return false;
  }
  if (filters.categories?.length) {
    const accepted = row.accepted_categories ?? [];
    if (!filters.categories.every((c) => accepted.includes(c))) return false;
  }
  if (filters.minVolumeM3 !== undefined) {
    const available = Number(row.estimated_available_volume_m3 ?? 0);
    if (!(available >= filters.minVolumeM3)) return false;
  }
  return true;
}

const price = (r: SearchResult) => r.row.monthly_price_pence ?? Number.MAX_SAFE_INTEGER;
const distance = (r: SearchResult) =>
  r.distanceMiles === null ? Number.MAX_SAFE_INTEGER : r.distanceMiles;

/**
 * "Recommended" is fully deterministic and explainable:
 *   1. spaces that pass every SpaceFit hard check first (when inventory exists)
 *   2. higher SpaceFit score
 *   3. more complete listing information
 *   4. nearer
 *   5. cheaper
 * Without inventory it degrades to: nearer, then cheaper.
 */
function sortResults(results: SearchResult[], sort: SortKey, hasInventory: boolean): SearchResult[] {
  const rows = results.slice();
  switch (sort) {
    case "price_asc":
      return rows.sort((a, b) => price(a) - price(b) || distance(a) - distance(b));
    case "price_desc":
      return rows.sort((a, b) => price(b) - price(a) || distance(a) - distance(b));
    case "distance":
      return rows.sort((a, b) => distance(a) - distance(b) || price(a) - price(b));
    case "spacefit":
      return rows.sort(
        (a, b) =>
          (b.result?.score ?? -1) - (a.result?.score ?? -1) ||
          distance(a) - distance(b) ||
          price(a) - price(b),
      );
    case "recommended":
    default:
      if (!hasInventory) {
        return rows.sort((a, b) => distance(a) - distance(b) || price(a) - price(b));
      }
      return rows.sort(
        (a, b) =>
          Number(b.result?.compatible ?? false) - Number(a.result?.compatible ?? false) ||
          (b.result?.score ?? -1) - (a.result?.score ?? -1) ||
          (b.result?.completenessPoints ?? 0) - (a.result?.completenessPoints ?? 0) ||
          distance(a) - distance(b) ||
          price(a) - price(b),
      );
  }
}

export function useStorageSearch(params: StorageSearchParams) {
  const radius = normaliseRadius(params.radius);
  const centreQuery = useSearchCentre(params.location);
  const geocoded = centreQuery.data;
  const centre: SearchCentre | null =
    geocoded && geocoded.ok ? (geocoded.centre as SearchCentre) : null;
  const geocodeError =
    geocoded && !geocoded.ok ? geocoded.message : centreQuery.error ? "Location lookup failed." : null;

  const hasLocation = params.location.trim().length >= 2;

  const spacesQuery = useQuery({
    queryKey: ["spaces", "search", centre?.lat ?? null, centre?.lng ?? null, radius],
    queryFn: () => searchPublishedSpaces({ centre, radiusMiles: radius, limit: 60 }),
    enabled: !hasLocation || Boolean(centre),
    staleTime: 60 * 1000,
  });

  // SpaceFit reuses the renter's CONFIRMED inventory and the canonical engine.
  const { data: inventory } = useActiveInventory();
  const { data: items } = useInventoryItems(inventory?.id);
  const confirmed = React.useMemo(() => items ?? [], [items]);
  const hasInventory = confirmed.length > 0;

  const evaluated = React.useMemo<SearchResult[]>(() => {
    const rows = spacesQuery.data ?? [];
    const matchInventory = hasInventory ? buildMatchInventory(confirmed) : null;
    return rows.map((raw) => {
      const row = toPublicSearchRow(raw) as SearchSpaceRow;
      const space = toMatchSpace(row as never);
      return {
        row,
        space,
        result: matchInventory ? evaluateSpace(space, matchInventory) : null,
        distanceMiles: row.distance_miles === null ? null : Number(row.distance_miles),
      };
    });
  }, [spacesQuery.data, confirmed, hasInventory]);

  const filtered = React.useMemo(
    () => evaluated.filter((entry) => matchesFilters(entry.row, params.filters)),
    [evaluated, params.filters],
  );

  const sorted = React.useMemo(
    () => sortResults(filtered, params.sort, hasInventory),
    [filtered, params.sort, hasInventory],
  );

  const coverPaths = React.useMemo(
    () => sorted.map((r) => r.row.cover_path).filter((p): p is string => Boolean(p)),
    [sorted],
  );
  const { data: covers } = useCoverUrls(coverPaths);

  const results = React.useMemo(
    () =>
      sorted.map((entry) => ({
        ...entry,
        ...(entry.row.cover_path && covers?.[entry.row.cover_path]
          ? { coverUrl: covers[entry.row.cover_path] as string }
          : {}),
      })),
    [sorted, covers],
  );

  /** Nearby but incompatible: shown separately so we never pretend nothing is there. */
  const incompatibleCount = results.filter((r) => r.result && !r.result.compatible).length;

  return {
    centre,
    radius,
    geocodeError,
    hasInventory,
    results,
    nearbyCount: evaluated.length,
    filteredOutCount: evaluated.length - filtered.length,
    incompatibleCount,
    isLoading: (hasLocation && centreQuery.isLoading) || spacesQuery.isLoading,
    error: spacesQuery.error,
  };
}
