import { describe, expect, it } from "vitest";

import { PUBLIC_SEARCH_FIELDS, toPublicSearchRow } from "@/lib/search-api";

describe("public search projection", () => {
  const leakyRow = {
    id: "11111111-1111-1111-1111-111111111111",
    title: "Part of the space",
    approximate_area: "Southsea",
    postcode_district: "PO1",
    approx_latitude: 50.7955,
    approx_longitude: -1.0688,
    distance_miles: 1.234,
    monthly_price_pence: 5500,
    // Anything below must never reach the browser.
    latitude: 50.7909,
    longitude: -1.0653,
    address_line1: "1 Example Street",
    town: "Portsmouth",
    postcode: "PO1 1AA",
    host_id: "22222222-2222-2222-2222-222222222222",
  } as Record<string, unknown>;

  it("keeps only allowlisted public fields", () => {
    const row = toPublicSearchRow(leakyRow) as Record<string, unknown>;
    for (const banned of ["latitude", "longitude", "address_line1", "town", "postcode", "host_id"]) {
      expect(row).not.toHaveProperty(banned);
    }
    expect(row["approx_latitude"]).toBe(50.7955);
    expect(row["distance_miles"]).toBe(1.234);
    expect(row["postcode_district"]).toBe("PO1");
  });

  it("never allowlists private location fields", () => {
    const fields = PUBLIC_SEARCH_FIELDS as readonly string[];
    expect(fields).not.toContain("latitude");
    expect(fields).not.toContain("longitude");
    expect(fields).not.toContain("address_line1");
    expect(fields).not.toContain("address_line2");
    expect(fields).not.toContain("postcode");
    expect(fields).not.toContain("host_id");
  });

  it("approximate coordinates differ from the exact ones", () => {
    // The database trigger offsets 200-500m deterministically; the public row
    // must not echo the exact fix.
    const row = toPublicSearchRow(leakyRow) as Record<string, unknown>;
    expect(row["approx_latitude"]).not.toBe(leakyRow["latitude"]);
    expect(row["approx_longitude"]).not.toBe(leakyRow["longitude"]);
  });
});
