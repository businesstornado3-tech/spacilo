/**
 * Phase 7B — generic geocoding contract cover.
 *
 * Complements geosearch.test.ts. Everything here is synthetic: no real place,
 * postcode or coordinate is asserted, and no live geocoder is called.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { rankCandidates, resolvePlace, splitQuery } from "@/lib/location/place-ranking";
import { isPlausibleUkPoint, type SearchCentre } from "@/lib/location/schema";
import { searchQueryKey } from "@/hooks/useStorageSearch";

const town = (over: Record<string, unknown>) => ({
  name_1: "Twinford",
  local_type: "Town",
  latitude: 51,
  longitude: -1,
  ...over,
});

describe("candidate hygiene", () => {
  it("removes duplicate provider rows instead of inventing ambiguity", () => {
    const row = town({ county_unitary: "Ashshire", outcode: "AA1" });
    const ranked = rankCandidates("Twinford", [row, { ...row }, { ...row }]);
    expect(ranked).toHaveLength(1);
    expect(resolvePlace("Twinford", [row, { ...row }]).alternatives).toEqual([]);
  });

  it("never selects a candidate without usable coordinates", () => {
    const resolution = resolvePlace("Twinford", [
      town({ county_unitary: "Ashshire", latitude: null, longitude: null }),
      town({ county_unitary: "Zedshire", latitude: undefined, longitude: undefined }),
    ]);
    expect(resolution.best).toBeNull();
  });

  it("rejects coordinates outside the plausible UK box", () => {
    expect(isPlausibleUkPoint({ lat: 0, lng: 0 })).toBe(false);
    expect(isPlausibleUkPoint({ lat: 51, lng: -1 })).toBe(true);
  });

  it("a clear qualifier advantage removes ambiguity entirely", () => {
    const candidates = [
      town({ county_unitary: "Ashshire", outcode: "AA1", latitude: 51, longitude: -1 }),
      town({ county_unitary: "Zedshire", outcode: "ZZ9", latitude: 55, longitude: -3 }),
    ];
    const resolution = resolvePlace("Twinford, Zedshire", candidates);
    expect(resolution.best?.county_unitary).toBe("Zedshire");
    expect(resolution.alternatives).toEqual([]);
  });

  it("ranking is identical for original, reversed and shuffled inputs", () => {
    const candidates = [
      town({ county_unitary: "Ashshire", latitude: 51, longitude: -1 }),
      town({ county_unitary: "Beeshire", local_type: "City", latitude: 53, longitude: -2 }),
      town({ county_unitary: "Zedshire", local_type: "Village", latitude: 55, longitude: -3 }),
    ];
    const order = (rows: typeof candidates) =>
      rankCandidates("Twinford", rows).map((r) => r.row.county_unitary);
    const expected = order(candidates);
    expect(order([...candidates].reverse())).toEqual(expected);
    expect(order([candidates[2]!, candidates[0]!, candidates[1]!])).toEqual(expected);
    expect(expected[0]).toBe("Beeshire");
  });
});

describe("chooser selection", () => {
  /** The chooser shows "Place, Context, Outcode"; only "Place" is provider input. */
  it("reduces a qualified display label to the canonical place name", () => {
    expect(splitQuery("Twinford, Zedshire, ZZ9")).toEqual({
      name: "twinford",
      qualifier: "zedshire zz9",
    });
  });

  it("re-resolving a qualified label picks that candidate's own coordinates", () => {
    const candidates = [
      town({ county_unitary: "Ashshire", outcode: "AA1", latitude: 51, longitude: -1 }),
      town({ county_unitary: "Zedshire", outcode: "ZZ9", latitude: 55, longitude: -3 }),
    ];
    const chosen = resolvePlace("Twinford, Zedshire, ZZ9", candidates).best;
    expect({ lat: chosen?.latitude, lng: chosen?.longitude }).toEqual({ lat: 55, lng: -3 });
  });
});

describe("search cache isolation", () => {
  const centreA: SearchCentre = {
    lat: 51,
    lng: -1,
    label: "A",
    district: null,
    precision: "place",
  };
  const centreB: SearchCentre = { ...centreA, lat: 55, lng: -3, label: "B" };

  it("different locations never share a cache entry", () => {
    expect(searchQueryKey("A", centreA, 5)).not.toEqual(searchQueryKey("B", centreB, 5));
  });

  it("different radii never share a cache entry", () => {
    expect(searchQueryKey("A", centreA, 1)).not.toEqual(searchQueryKey("A", centreA, 2));
  });

  it("an unresolved location cannot reuse another location's results", () => {
    expect(searchQueryKey("B", null, 5)).not.toEqual(searchQueryKey("A", centreA, 5));
    expect(searchQueryKey("B", null, 5)).not.toEqual(searchQueryKey("A", null, 5));
  });

  it("the same location and radius is stable across renders", () => {
    expect(searchQueryKey(" a ", centreA, 5)).toEqual(searchQueryKey("A", centreA, 5));
  });
});

describe("provider failure states", () => {
  const originalFetch = globalThis.fetch;
  let getProvider: typeof import("@/lib/location/provider.server").getGeocodingProvider;

  beforeEach(async () => {
    ({ getGeocodingProvider: getProvider } = await import("@/lib/location/provider.server"));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  const respond = (body: unknown, status = 200) =>
    vi.fn(async () => new Response(JSON.stringify(body), { status }));

  it("no candidates resolves to null (not found), never to 0,0", async () => {
    globalThis.fetch = respond({ status: 200, result: [] }) as never;
    await expect(getProvider().geocodeDetailed("Nowhereton")).resolves.toBeNull();
  });

  it("transport failure throws so callers can report a service error", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("network down");
    }) as never;
    await expect(getProvider().geocodeDetailed("Nowhereton")).rejects.toThrow();
  });

  it("an HTTP error is a service error, not a silent miss", async () => {
    globalThis.fetch = respond({ status: 500 }, 500) as never;
    await expect(getProvider().geocodeDetailed("Nowhereton")).rejects.toThrow();
  });

  it("same-strength distant candidates surface as alternatives", async () => {
    globalThis.fetch = respond({
      status: 200,
      result: [
        town({ county_unitary: "Ashshire", latitude: 51, longitude: -1 }),
        town({ county_unitary: "Zedshire", latitude: 55, longitude: -3 }),
      ],
    }) as never;
    const resolution = await getProvider().geocodeDetailed("Twinford");
    expect(resolution?.alternatives).toHaveLength(1);
  });

  it("implausible coordinates are rejected rather than searched", async () => {
    globalThis.fetch = respond({
      status: 200,
      result: [town({ county_unitary: "Ashshire", latitude: 0, longitude: 0 })],
    }) as never;
    await expect(getProvider().geocodeDetailed("Twinford")).resolves.toBeNull();
  });
});
