/**
 * React Query wiring for SpaceFit matching.
 *
 * Matches are calculated dynamically from the renter's CONFIRMED inventory and
 * the current published-space dataset — nothing is persisted, so results can
 * never go stale.
 */
import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { listPublishedSpaces, signedPhotoUrls } from "@/lib/spaces-api";
import { buildMatchInventory, evaluateSpace, runMatching } from "@/lib/spacefit/engine";
import type { MatchSpace, SpaceFitResult } from "@/lib/spacefit/types";
import { useActiveInventory, useInventoryItems } from "@/hooks/useInventory";
import type { InventoryItem } from "@/lib/inventory-model";

export type PublishedSpaceRow = Awaited<ReturnType<typeof listPublishedSpaces>>[number];

/** RPC row overlaid with the engine's public-safe view of the same space. */
type MatchRow = Omit<PublishedSpaceRow, keyof MatchSpace> & MatchSpace;


/** Narrows an RPC row to the public-safe fields the engine consumes. */
export function toMatchSpace(row: PublishedSpaceRow): MatchSpace {
  return {
    id: row.id,
    title: row.title,
    space_type: row.space_type,
    postcode_district: row.postcode_district,
    approximate_area: row.approximate_area,
    monthly_price_pence: row.monthly_price_pence,
    estimated_available_volume_m3:
      row.estimated_available_volume_m3 === null ? null : Number(row.estimated_available_volume_m3),
    total_volume_m3: row.total_volume_m3 === null ? null : Number(row.total_volume_m3),
    accepted_categories: row.accepted_categories,
    host_restrictions: row.host_restrictions,
    restriction_notes: row.restriction_notes,
    features: row.features,
    access_type: row.access_type,
    moisture_condition: row.moisture_condition,
    temperature_condition: row.temperature_condition,
    door_width_cm: row.door_width_cm,
    door_height_cm: row.door_height_cm,
    photo_count: row.photo_count,
    cover_path: row.cover_path,
  };
}

function usePublishedSpaces() {
  return useQuery({ queryKey: ["spaces", "published"], queryFn: () => listPublishedSpaces(120) });
}

/** Signed cover URLs for the private space-photos bucket. */
function useCoverUrls(paths: string[]) {
  const key = paths.slice().sort().join("|");
  return useQuery({
    queryKey: ["spaces", "cover-urls", key],
    queryFn: () => signedPhotoUrls(paths),
    enabled: paths.length > 0,
  });
}

export interface MatchEntry {
  row: MatchRow;
  result: SpaceFitResult;
  coverUrl?: string;
}

export function useSpaceFitMatches() {
  const { data: inventory, isLoading: inventoryLoading } = useActiveInventory();
  const { data: items, isLoading: itemsLoading } = useInventoryItems(inventory?.id);
  const { data: spaces, isLoading: spacesLoading, error } = usePublishedSpaces();

  const confirmed: InventoryItem[] = React.useMemo(() => items ?? [], [items]);

  const run = React.useMemo(() => {
    if (!spaces || confirmed.length === 0) return null;
    const matchInventory = buildMatchInventory(confirmed);
    const rows: MatchRow[] = spaces.map((row) => ({ ...row, ...toMatchSpace(row) }) as MatchRow);
    return { matchInventory, ...runMatching(rows, matchInventory) };
  }, [spaces, confirmed]);

  const coverPaths = React.useMemo(
    () =>
      (run ? [...run.compatible, ...run.incompatible] : [])
        .map((entry) => entry.space.cover_path)
        .filter((p): p is string => Boolean(p)),
    [run],
  );
  const { data: covers } = useCoverUrls(coverPaths);

  const decorate = (entries: { space: MatchRow; result: SpaceFitResult }[]): MatchEntry[] =>
    entries.map((entry) => ({
      row: entry.space,
      result: entry.result,
      ...(entry.space.cover_path && covers?.[entry.space.cover_path]
        ? { coverUrl: covers[entry.space.cover_path] as string }
        : {}),
    }));


  return {
    inventoryId: inventory?.id,
    items: confirmed,
    matchInventory: run?.matchInventory ?? null,
    compatible: run ? decorate(run.compatible) : [],
    incompatible: run ? decorate(run.incompatible) : [],
    isLoading: inventoryLoading || itemsLoading || spacesLoading,
    error,
  };
}

/** SpaceFit for a single published listing, for the listing detail page. */
export function useSpaceFitForSpace(space: MatchSpace | null) {
  const { data: inventory } = useActiveInventory();
  const { data: items, isLoading } = useInventoryItems(inventory?.id);

  return React.useMemo(() => {
    const confirmed = items ?? [];
    if (!space || confirmed.length === 0) {
      return { result: null as SpaceFitResult | null, matchInventory: null, isLoading, hasInventory: confirmed.length > 0 };
    }
    const matchInventory = buildMatchInventory(confirmed);
    return {
      result: evaluateSpace(space, matchInventory),
      matchInventory,
      isLoading,
      hasInventory: true,
    };
  }, [space, items, isLoading]);
}
