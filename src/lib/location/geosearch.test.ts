/**
 * Phase 7B — generic geospatial search regression cover.
 *
 * These tests use synthetic coordinates only. Nothing here encodes a real
 * town, postcode or listing: the point is that inclusion is decided by
 * distance, never by the textual name of a place.
 */
import { describe, expect, it } from "vitest";

import { haversineMiles, withinRadius } from "@/lib/location/distance";
import { normaliseRadius } from "@/lib/location/schema";
import {
  pickBestPlace,
  resolvePlace,
  scorePlaceCandidate,
  splitQuery,
} from "@/lib/location/place-ranking";

interface Listing {
  id: string;
  lat: number;
  lng: number;
  city: string;
  published: boolean;
}

/** Mirrors public.search_published_spaces: eligibility, then radius, in miles. */
function search(centre: { lat: number; lng: number }, radiusMiles: number, rows: Listing[]) {
  const radius = normaliseRadius(radiusMiles);
  return rows
    .filter((r) => r.published)
    .map((r) => ({ ...r, distance: haversineMiles(centre, { lat: r.lat, lng: r.lng }) }))
    .filter((r) => withinRadius(r.distance, radius))
    .sort((a, b) => a.distance - b.distance);
}

const centre = { lat: 51, lng: -1 };
/** ~1 mile of latitude ≈ 0.014483 degrees. */
const northOf = (miles: number) => centre.lat + miles * 0.0144927;

const listings: Listing[] = [
  { id: "near-other-city", lat: northOf(2), lng: -1, city: "Otherville", published: true },
  { id: "far-same-city", lat: northOf(40), lng: -1, city: "Centreton", published: true },
  { id: "near-unpublished", lat: northOf(1), lng: -1, city: "Centreton", published: false },
  { id: "boundary", lat: northOf(4.99), lng: -1, city: "Edgeton", published: true },
];

describe("geospatial inclusion", () => {
  it("A: includes a listing clearly inside the radius", () => {
    expect(search(centre, 5, listings).map((r) => r.id)).toContain("near-other-city");
  });

  it("B: excludes a listing clearly outside the radius", () => {
    expect(search(centre, 5, listings).map((r) => r.id)).not.toContain("far-same-city");
  });

  it("C: different city text does not exclude a nearby listing", () => {
    const row = search(centre, 5, listings).find((r) => r.id === "near-other-city");
    expect(row?.city).toBe("Otherville");
  });

  it("D: matching city text does not include a distant listing", () => {
    expect(search(centre, 5, listings).some((r) => r.city === "Centreton")).toBe(false);
  });

  it("H: a larger radius expands the result set", () => {
    expect(search(centre, 50, listings).length).toBeGreaterThan(search(centre, 5, listings).length);
  });

  it("I: boundary listings are included inclusively and excluded beyond", () => {
    expect(search(centre, 5, listings).map((r) => r.id)).toContain("boundary");
    expect(search(centre, 4, listings).map((r) => r.id)).not.toContain("boundary");
  });

  it("J: an area with nothing nearby returns a genuine empty set", () => {
    expect(search({ lat: 55, lng: -3 }, 5, listings)).toEqual([]);
  });

  it("K: unpublished listings inside the radius stay hidden", () => {
    expect(search(centre, 5, listings).map((r) => r.id)).not.toContain("near-unpublished");
  });

  it("L: identical coordinates give identical results regardless of query text", () => {
    const a = search(centre, 5, listings).map((r) => r.id);
    const b = search({ ...centre }, 5, listings).map((r) => r.id);
    expect(a).toEqual(b);
  });

  it("radius is normalised in miles and never silently changes unit", () => {
    expect(normaliseRadius("5")).toBe(5);
    expect(normaliseRadius(1000)).toBe(100);
    expect(normaliseRadius("nonsense")).toBe(5);
  });
});

describe("place candidate ranking", () => {
  const candidates = [
    { name_1: "Ambridge", local_type: "Village", county_unitary: "Northshire", outcode: "AB1" },
    { name_1: "Ambridge", local_type: "City", county_unitary: "Southshire", outcode: "ZZ9" },
    { name_1: "Little Ambridge", local_type: "Hamlet", county_unitary: "Westshire", outcode: "WS1" },
  ];

  it("F/G: prefers the more significant settlement for a bare name", () => {
    expect(pickBestPlace("Ambridge", candidates)?.county_unitary).toBe("Southshire");
  });

  it("honours a qualifier so smaller places remain reachable", () => {
    expect(pickBestPlace("Ambridge, Northshire", candidates)?.county_unitary).toBe("Northshire");
    expect(pickBestPlace("Ambridge AB1", candidates)?.county_unitary).toBe("Northshire");
  });

  it("prefers an exact name over a containing name", () => {
    const exact = scorePlaceCandidate("Ambridge", candidates[1]!)!;
    const partial = scorePlaceCandidate("Ambridge", candidates[2]!)!;
    expect(exact).toBeGreaterThan(partial);
  });

  it("rejects candidates that do not match the query at all", () => {
    expect(scorePlaceCandidate("Nowhereton", candidates[0]!)).toBeNull();
    expect(pickBestPlace("Nowhereton", candidates)).toBeNull();
  });

  it("splits an optional qualifier from the place name", () => {
    expect(splitQuery("Ambridge, Northshire")).toEqual({
      name: "ambridge",
      qualifier: "northshire",
    });
  });

  it("is order-independent when provider candidates are shuffled", () => {
    const withPoints = [
      { ...candidates[0], latitude: 51.5, longitude: -1.2 },
      { ...candidates[1], latitude: 53.5, longitude: -2.2 },
      { ...candidates[2], latitude: 52.5, longitude: -1.8 },
    ];
    const forward = pickBestPlace("Ambridge", withPoints);
    const reverse = pickBestPlace("Ambridge", [...withPoints].reverse());
    expect(forward?.county_unitary).toBe("Southshire");
    expect(reverse).toEqual(forward);
  });

  it("uses stable metadata and coordinate tie-breaking", () => {
    const tied = [
      { name_1: "Twinford", local_type: "Town", county_unitary: "Zedshire", latitude: 51, longitude: -1 },
      { name_1: "Twinford", local_type: "Town", county_unitary: "Ashshire", latitude: 52, longitude: -2 },
    ];
    expect(pickBestPlace("Twinford", tied)?.county_unitary).toBe("Ashshire");
    expect(pickBestPlace("Twinford", [...tied].reverse())?.county_unitary).toBe("Ashshire");
  });

  it("reports materially distant same-strength places as alternatives", () => {
    const result = resolvePlace("Twinford", [
      { name_1: "Twinford", local_type: "Town", county_unitary: "Ashshire", latitude: 51, longitude: -1 },
      { name_1: "Twinford", local_type: "Town", county_unitary: "Zedshire", latitude: 55, longitude: -3 },
    ]);
    expect(result.best?.county_unitary).toBe("Ashshire");
    expect(result.alternatives.map((place) => place.county_unitary)).toEqual(["Zedshire"]);
  });

  it("does not resolve malformed coordinate candidates", () => {
    const malformed = {
      name_1: "Twinford",
      local_type: "Town",
      county_unitary: "Nowhere",
      latitude: "bad",
      longitude: -1,
    } as unknown as { name_1: string; local_type: string; county_unitary: string; latitude: number; longitude: number };
    const result = resolvePlace("Twinford", [malformed]);
    expect(result).toEqual({ best: null, alternatives: [] });
  });
});
