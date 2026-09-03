import { describe, expect, it } from "vitest";

import { applyGeographyFilter, GEOGRAPHY_FILTERS } from "./DemandGeography";
import { demandBand, markerRadius } from "./DemandMap";
import { buildGeography, type GeographyRow } from "@/lib/admin/geography";

function row(patch: Partial<GeographyRow> = {}): GeographyRow {
  return {
    location_slug: "portsmouth",
    demand_visitors: 3,
    demand_events: 12,
    storage_requests: 0,
    bookings: 0,
    published_spaces: 5,
    previous_demand_events: 0,
    ...patch,
  };
}

describe("demand geography map layer", () => {
  it("plots only places that appear in real production rows", () => {
    const places = buildGeography([row()]);
    expect(places.map((p) => p.slug)).toEqual(["portsmouth"]);
    expect(places.some((p) => p.slug === "london")).toBe(false);
  });

  it("returns nothing at all when production produced no location intent", () => {
    expect(buildGeography([])).toEqual([]);
  });

  it("carries a real coordinate for plotting, or null when unknown", () => {
    const [known] = buildGeography([row()]);
    expect(known?.point).toEqual({ lat: 50.8, lng: -1.09 });
    const [unknown] = buildGeography([row({ location_slug: "little-hamlet" })]);
    expect(unknown?.point).toBeNull();
  });

  it("never fabricates metrics for a plotted place", () => {
    const [place] = buildGeography([row({ bookings: 0, storage_requests: 0 })]);
    expect(place?.bookings).toBe(0);
    expect(place?.storageRequests).toBe(0);
    expect(place?.demandEvents).toBe(12);
  });

  it("scales markers from real intent volume", () => {
    expect(markerRadius(0, 0)).toBe(8);
    expect(markerRadius(100, 100)).toBeGreaterThan(markerRadius(10, 100));
    expect(demandBand(100, 100)).toBe("HIGH");
    expect(demandBand(50, 100)).toBe("MEDIUM");
    expect(demandBand(1, 100)).toBe("LOW");
  });

  it("computes supply state from production supply, not from a label", () => {
    const [supplied] = buildGeography([row({ demand_events: 3, published_spaces: 5 })]);
    expect(supplied?.supplyState).toBe("SURPLUS_SUPPLY");
    const [none] = buildGeography([row({ published_spaces: 0 })]);
    expect(none?.supplyState).toBe("NO_SUPPLY");
  });

  it("filters on genuine fields only and can return an empty view", () => {
    const places = buildGeography([row()]);
    expect(applyGeographyFilter(places, "ALL")).toHaveLength(1);
    expect(applyGeographyFilter(places, "SUPPLY_AVAILABLE")).toHaveLength(1);
    expect(applyGeographyFilter(places, "NO_SUPPLY")).toHaveLength(0);
    expect(applyGeographyFilter(places, "BOOKED")).toHaveLength(0);
    expect(GEOGRAPHY_FILTERS.some((f) => /renter|host|student|business/i.test(f.label))).toBe(false);
  });

  it("exposes an opportunity score bounded to a 0-100 prioritisation scale", () => {
    const [place] = buildGeography([row()]);
    expect(place?.opportunityScore).toBeGreaterThanOrEqual(0);
    expect(place?.opportunityScore).toBeLessThanOrEqual(100);
  });
});
