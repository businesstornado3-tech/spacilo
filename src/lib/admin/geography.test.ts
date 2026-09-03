import { describe, expect, it } from "vitest";

import {
  buildGeography,
  classifySupply,
  demandTrend,
  geographicOpportunityScore,
  type GeographyRow,
} from "./geography";

function row(patch: Partial<GeographyRow> = {}): GeographyRow {
  return {
    location_slug: "bristol",
    demand_visitors: 10,
    demand_events: 40,
    storage_requests: 0,
    bookings: 0,
    published_spaces: 0,
    previous_demand_events: 0,
    ...patch,
  };
}

describe("demand geography", () => {
  it("names the place from the canonical UK catalogue and plots it", () => {
    const [place] = buildGeography([row()]);
    expect(place?.name).toBe("Bristol");
    expect(place?.plot).not.toBeNull();
  });

  it("treats no supply as a real opportunity, not an error", () => {
    expect(classifySupply(40, 0)).toBe("NO_SUPPLY");
    const [place] = buildGeography([row()]);
    expect(place?.supplyState).toBe("NO_SUPPLY");
    expect(place?.opportunityScore).toBeGreaterThan(50);
  });

  it("scores demand against scarcity, never against money", () => {
    const scarce = geographicOpportunityScore(row({ published_spaces: 0 }));
    const supplied = geographicOpportunityScore(row({ published_spaces: 10 }));
    expect(scarce).toBeGreaterThan(supplied);
    expect(scarce).toBeLessThanOrEqual(100);
  });

  it("reports trend honestly, including when there is no baseline", () => {
    expect(demandTrend(row({ previous_demand_events: 0 })).trend).toBe("NEW");
    expect(demandTrend(row({ demand_events: 0, previous_demand_events: 0 })).trend).toBe("UNKNOWN");
    expect(demandTrend(row({ demand_events: 100, previous_demand_events: 10 })).trend).toBe("RISING");
    expect(demandTrend(row({ demand_events: 10, previous_demand_events: 100 })).trend).toBe("FALLING");
    expect(demandTrend(row({ demand_events: 100, previous_demand_events: 100 })).trend).toBe("STEADY");
  });

  it("prioritises real demand with thin supply", () => {
    const [high] = buildGeography([row({ demand_events: 400, demand_visitors: 90 })]);
    expect(high?.priority).toBe("HIGH");
    const [low] = buildGeography([
      row({ demand_events: 1, demand_visitors: 1, published_spaces: 12, previous_demand_events: 1 }),
    ]);
    expect(low?.priority).toBe("LOW");
  });

  it("keeps an unknown slug rather than dropping the demand", () => {
    const [place] = buildGeography([row({ location_slug: "little-hamlet" })]);
    expect(place?.name).toBe("little hamlet");
    expect(place?.plot).toBeNull();
  });
});
