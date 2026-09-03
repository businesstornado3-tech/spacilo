import { describe, expect, it } from "vitest";

import { UK_PLACES, listingMatchesPlace, placeBySlug, readLocation } from "./locations";

describe("UK discovery locations", () => {
  it("recognises a broad canonical place registry without making a supply claim", () => {
    expect(UK_PLACES.length).toBeGreaterThan(30);
    expect(readLocation("storage in Manchester")).toMatchObject({ kind: "place", place: { slug: "manchester" } });
  });

  it("matches only public approximate location fields", () => {
    const manchester = placeBySlug("manchester");
    expect(manchester).not.toBeNull();
    expect(listingMatchesPlace({ approximate_area: "Manchester", postcode_district: "M1" }, manchester)).toBe(true);
    expect(listingMatchesPlace({ approximate_area: "Leeds", postcode_district: "M1" }, manchester)).toBe(false);
  });

  it("does not treat an unknown slug as a canonical place", () => {
    expect(placeBySlug("not-a-place")).toBeNull();
  });
});
