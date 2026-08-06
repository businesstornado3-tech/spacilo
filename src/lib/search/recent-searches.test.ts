import { describe, expect, it } from "vitest";

import {
  addRecentSearch,
  POPULAR_SEARCHES,
  suggestLocations,
  MAX_RECENT_SEARCHES,
  type RecentSearch,
} from "@/lib/search/recent-searches";
import { validateSearchParams, filtersFromUrl, filtersToUrl } from "@/lib/search-params";

const recent = (location: string): RecentSearch => ({ location, radius: 5 });

describe("recent searches", () => {
  it("puts the newest search first and de-duplicates case-insensitively", () => {
    const list = addRecentSearch([recent("Southsea"), recent("Havant")], recent("southsea"));
    expect(list.map((r) => r.location)).toEqual(["Southsea", "Havant"]);
  });

  it("caps the list", () => {
    let list: RecentSearch[] = [];
    for (let i = 0; i < 12; i += 1) list = addRecentSearch(list, recent(`Area ${i}`));
    expect(list).toHaveLength(MAX_RECENT_SEARCHES);
  });

  it("never stores raw browser coordinates", () => {
    expect(addRecentSearch([], recent("50.79123,-1.09123"))).toEqual([]);
  });

  it("ignores values too short to be a place", () => {
    expect(addRecentSearch([], recent("a"))).toEqual([]);
  });
});

describe("location suggestions", () => {
  it("offers recents before popular areas", () => {
    expect(suggestLocations([recent("Fareham")], "")[0]).toBe("Fareham");
  });

  it("filters by what has been typed", () => {
    const out = suggestLocations([], "cos");
    expect(out).toEqual(POPULAR_SEARCHES.filter((v) => v.toLowerCase().includes("cos")));
  });

  it("does not repeat a recent that is also popular", () => {
    const out = suggestLocations([recent("Portsmouth")], "");
    expect(out.filter((v) => v === "Portsmouth")).toHaveLength(1);
  });
});

describe("search url state", () => {
  it("accepts the new sorts", () => {
    expect(validateSearchParams({ sort: "largest" } as never).sort).toBe("largest");
    expect(validateSearchParams({ sort: "newest" } as never).sort).toBe("newest");
    expect(validateSearchParams({ sort: "nonsense" } as never).sort).toBe("recommended");
  });

  it("round-trips the host-confirmed access filters", () => {
    const state = validateSearchParams({ groundFloor: "true", verifiedHost: true } as never);
    const filters = filtersFromUrl(state);
    expect(filters.groundFloor).toBe(true);
    expect(filters.verifiedHost).toBe(true);
    expect(filters.liftAvailable).toBeUndefined();
    expect(filtersToUrl(filters)).toMatchObject({ groundFloor: true, verifiedHost: true });
  });

  it("clears removed filters from the url", () => {
    expect(filtersToUrl({})["groundFloor"]).toBeUndefined();
  });
});
