import { describe, expect, it } from "vitest";

import {
  formatMilesAway,
  formatMilesFrom,
  haversineMiles,
  sortByDistance,
  withinRadius,
} from "@/lib/location/distance";
import {
  DEFAULT_RADIUS_MILES,
  isOutcode,
  isPlausibleUkPoint,
  isPostcode,
  normaliseLocationInput,
  normaliseRadius,
  postcodeDistrict,
} from "@/lib/location/schema";

describe("UK postcode normalisation", () => {
  it("normalises every casing and spacing variant to the same value", () => {
    for (const input of ["po4 8lb", "PO48LB", "Po4 8Lb", "  po4   8LB "]) {
      expect(normaliseLocationInput(input)).toBe("PO4 8LB");
    }
  });

  it("recognises postcodes, outcodes and place names", () => {
    expect(isPostcode("PO4 8LB")).toBe(true);
    expect(isPostcode("Southsea")).toBe(false);
    expect(isOutcode("PO4")).toBe(true);
    expect(isOutcode("PO4 8LB")).toBe(false);
    expect(normaliseLocationInput(" southsea ")).toBe("southsea");
  });

  it("derives the public postcode district", () => {
    expect(postcodeDistrict("PO4 8LB")).toBe("PO4");
    expect(postcodeDistrict("po48lb")).toBe("PO4");
    expect(postcodeDistrict("SW1A 1AA")).toBe("SW1A");
    expect(postcodeDistrict("PO4")).toBeNull();
  });
});

describe("radius normalisation", () => {
  it("falls back to the default and clamps out-of-range values", () => {
    expect(normaliseRadius(undefined)).toBe(DEFAULT_RADIUS_MILES);
    expect(normaliseRadius("nonsense")).toBe(DEFAULT_RADIUS_MILES);
    expect(normaliseRadius("10")).toBe(10);
    expect(normaliseRadius(500)).toBe(100);
    expect(normaliseRadius(0)).toBe(0.1);
  });

  it("accepts values outside the suggested option list", () => {
    expect(normaliseRadius(7)).toBe(7);
  });
});

describe("haversine distance", () => {
  const portsmouth = { lat: 50.7909, lng: -1.0653 };

  it("is zero for the same point", () => {
    expect(haversineMiles(portsmouth, portsmouth)).toBe(0);
  });

  it("matches a known UK distance (Portsmouth → Southampton ≈ 15 miles)", () => {
    const southampton = { lat: 50.9097, lng: -1.4044 };
    const miles = haversineMiles(portsmouth, southampton);
    expect(miles).toBeGreaterThan(14);
    expect(miles).toBeLessThan(17);
  });

  it("is symmetric", () => {
    const other = { lat: 50.8, lng: -1.1 };
    expect(haversineMiles(portsmouth, other)).toBe(haversineMiles(other, portsmouth));
  });

  it("rejects UK-implausible points", () => {
    expect(isPlausibleUkPoint(portsmouth)).toBe(true);
    expect(isPlausibleUkPoint({ lat: 40.7, lng: -74 })).toBe(false);
  });
});

describe("radius filtering and distance sorting", () => {
  const rows = [
    { id: "C", distance_miles: 6.2 },
    { id: "A", distance_miles: 0.8 },
    { id: "B", distance_miles: 2.4 },
    { id: "D", distance_miles: null },
  ];

  it("includes only spaces inside the radius", () => {
    const included = rows.filter((r) => withinRadius(r.distance_miles, 5)).map((r) => r.id);
    expect(included).toEqual(["A", "B"]);
  });

  it("widening the radius includes more spaces", () => {
    expect(rows.filter((r) => withinRadius(r.distance_miles, 1)).map((r) => r.id)).toEqual(["A"]);
    expect(rows.filter((r) => withinRadius(r.distance_miles, 10)).map((r) => r.id)).toEqual([
      "C",
      "A",
      "B",
    ]);
  });

  it("sorts nearest first with unknown distances last", () => {
    expect(sortByDistance(rows).map((r) => r.id)).toEqual(["A", "B", "C", "D"]);
  });
});

describe("distance formatting", () => {
  it("formats UK-facing distance strings", () => {
    expect(formatMilesAway(1.24)).toBe("1.2 miles away");
    expect(formatMilesAway(1.0)).toBe("1.0 mile away");
    expect(formatMilesAway(0.04)).toBe("Less than 0.1 miles away");
    expect(formatMilesAway(null)).toBeNull();
    expect(formatMilesFrom(1.24, "PO4 8LB")).toBe("1.2 miles from PO4 8LB");
  });
});
