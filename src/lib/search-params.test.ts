/**
 * Regression cover for the site-wide build failure.
 *
 * The search validator must stay callable with no arguments (an empty URL is
 * valid) and must keep returning fully-defaulted state. The companion
 * type-level guarantee — that linking to a search route may omit `search` —
 * is enforced by the branded `SearchSchemaInput` parameter and checked by the
 * typecheck run, which failed the production build when it regressed.
 */
import { describe, expect, it } from "vitest";

import { DEFAULT_RADIUS_MILES } from "@/lib/location/schema";
import { validateSearchParams } from "@/lib/search-params";

describe("validateSearchParams", () => {
  it("accepts no arguments and returns defaults", () => {
    const state = validateSearchParams();
    expect(state.location).toBe("");
    expect(state.radius).toBe(DEFAULT_RADIUS_MILES);
    expect(state.sort).toBe("recommended");
  });

  it("accepts an empty search object", () => {
    expect(validateSearchParams({} as never).sort).toBe("recommended");
  });

  it("keeps parsing a populated URL", () => {
    const state = validateSearchParams({
      location: "PO4 8LB",
      radius: "5",
      sort: "distance",
      types: "garage,loft",
    } as never);
    expect(state.location).toBe("PO4 8LB");
    expect(state.radius).toBe(5);
    expect(state.sort).toBe("distance");
    expect(state.types).toEqual(["garage", "loft"]);
  });

  it("falls back to a safe sort for unknown values", () => {
    expect(validateSearchParams({ sort: "nonsense" } as never).sort).toBe("recommended");
  });
});
