import { describe, expect, it } from "vitest";

import {
  accessChips,
  cardChips,
  capacitySummary,
  doorwaySummary,
  minimumStaySummary,
  securityChips,
} from "@/lib/marketplace/listing-facts";

describe("listing facts", () => {
  it("emits no chips at all for an empty row — never a reassuring default", () => {
    expect(securityChips({})).toEqual([]);
    expect(accessChips({})).toEqual([]);
    expect(cardChips({})).toEqual([]);
    expect(doorwaySummary({})).toBeNull();
    expect(minimumStaySummary({})).toBeNull();
    expect(capacitySummary({})).toBeNull();
  });

  it("only lists security features the host actually confirmed", () => {
    expect(securityChips({ features: ["cctv", "power"] })).toHaveLength(1);
    expect(securityChips({ features: [] })).toEqual([]);
  });

  it("states accessibility positives and never renders an absence as a negative", () => {
    const chips = accessChips({ ground_floor_access: true, lift_available: false });
    expect(chips).toContain("Ground floor");
    expect(chips.join(" ")).not.toMatch(/no lift/i);
  });

  it("requires both door dimensions before claiming a doorway size", () => {
    expect(doorwaySummary({ door_width_cm: 90 })).toBeNull();
    expect(doorwaySummary({ door_width_cm: 90, door_height_cm: 200 })).toBe("Doorway 90 × 200 cm");
  });

  it("prefers the day-accurate minimum stay over the legacy month field", () => {
    expect(minimumStaySummary({ minimum_stay_days: 30, minimum_storage_period_months: 3 })).toMatch(
      /minimum/,
    );
    expect(minimumStaySummary({ minimum_storage_period_months: 1 })).toBe("1 month minimum");
  });

  it("describes capacity as an estimate and ignores zero or unusable values", () => {
    expect(capacitySummary({ estimated_available_volume_m3: 0 })).toBeNull();
    expect(capacitySummary({ estimated_available_volume_m3: "8.4" })).toContain("estimated");
  });

  it("caps card chips so a card never becomes a wall of tags", () => {
    const chips = cardChips(
      {
        ground_floor_access: true,
        lift_available: true,
        vehicle_access_close: true,
        stairs_required: true,
        features: ["cctv", "alarm"],
        minimum_storage_period_months: 1,
      },
      4,
    );
    expect(chips).toHaveLength(4);
  });
});
