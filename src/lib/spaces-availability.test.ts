import { describe, expect, it } from "vitest";

import { availabilityLabel, availabilityProblem, formatStay, stayDays, stayParts } from "@/lib/spaces";
import { formatApproximateDuration } from "@/lib/storage-requests";

describe("minimum booking period", () => {
  it("round-trips days, weeks and months", () => {
    expect(stayDays(2, "week")).toBe(14);
    expect(stayDays(3, "month")).toBe(90);
    expect(stayParts(90)).toEqual({ count: 3, unit: "month" });
    expect(stayParts(14)).toEqual({ count: 2, unit: "week" });
    expect(stayParts(5)).toEqual({ count: 5, unit: "day" });
  });

  it("never renders a plural single unit", () => {
    expect(formatStay(30)).toBe("1 month");
    expect(formatStay(7)).toBe("1 week");
    expect(formatStay(1)).toBe("1 day");
    expect(formatStay(null)).toBe("1 day");
    expect(formatStay(60)).toBe("2 months");
  });

  it("never says '1 months' for an approximate period", () => {
    expect(formatApproximateDuration("2026-01-01", "2026-01-31")).toBe("about 1 month");
    expect(formatApproximateDuration("2026-01-01", "2026-03-02")).toContain("months");
  });
});

describe("host availability windows", () => {
  it("describes ongoing availability by default", () => {
    expect(availabilityLabel({})).toBe("Available on an ongoing basis");
    expect(availabilityLabel({ availability_mode: "continuous" })).toBe(
      "Available on an ongoing basis",
    );
  });

  it("describes a bounded window", () => {
    const label = availabilityLabel({
      availability_mode: "dates",
      available_from: "2026-03-01",
      available_until: "2026-09-01",
    });
    expect(label).toContain("March 2026");
    expect(label).toContain("September 2026");
  });

  it("rejects an empty or inverted window", () => {
    expect(availabilityProblem({ availability_mode: "dates" })).toBeTruthy();
    expect(
      availabilityProblem({
        availability_mode: "dates",
        available_from: "2026-09-01",
        available_until: "2026-03-01",
      }),
    ).toBeTruthy();
    expect(
      availabilityProblem({
        availability_mode: "dates",
        available_from: "2026-03-01",
        available_until: "2026-09-01",
      }),
    ).toBeNull();
    expect(availabilityProblem({ availability_mode: "continuous" })).toBeNull();
  });
});
