import { describe, expect, it } from "vitest";

import {
  SAFETY_DANGER_NOTICE,
  SEVERITY_ORDER,
  countBySeverity,
  isOpenCase,
  sortBySeverity,
  unresolved,
  type SafetyCaseRow,
} from "@/lib/admin/safety";

function row(overrides: Partial<SafetyCaseRow>): SafetyCaseRow {
  return {
    id: "c1",
    reference: "ER-CASE-1",
    booking_id: "b1",
    renter_id: "r1",
    host_id: "h1",
    category: "prohibited_item",
    stage: "checkin",
    status: "open",
    summary: "Reported item",
    severity: "medium",
    source: "host_report",
    created_at: "2026-09-01T00:00:00Z",
    last_activity_at: null,
    evidence_count: 0,
    booking_status: "active",
    payment_hold: false,
    ...overrides,
  };
}

describe("safety queue shaping", () => {
  it("orders critical first and low last", () => {
    const sorted = sortBySeverity([
      row({ id: "a", severity: "low" }),
      row({ id: "b", severity: "critical" }),
      row({ id: "c", severity: "high" }),
      row({ id: "d", severity: "medium" }),
    ]);
    expect(sorted.map((r) => r.severity)).toEqual(SEVERITY_ORDER);
  });

  it("sorts unflagged cases last and newest first within a severity", () => {
    const sorted = sortBySeverity([
      row({ id: "none", severity: null }),
      row({ id: "old", severity: "high", created_at: "2026-08-01T00:00:00Z" }),
      row({ id: "new", severity: "high", created_at: "2026-09-02T00:00:00Z" }),
    ]);
    expect(sorted.map((r) => r.id)).toEqual(["new", "old", "none"]);
  });

  it("counts each severity and never invents one", () => {
    const counts = countBySeverity([
      row({ severity: "critical" }),
      row({ severity: "critical" }),
      row({ severity: null }),
    ]);
    expect(counts).toEqual({ critical: 2, high: 0, medium: 0, low: 0 });
  });

  it("treats resolved and closed cases as no longer open", () => {
    expect(isOpenCase(row({ status: "under_review" }))).toBe(true);
    expect(isOpenCase(row({ status: "resolved" }))).toBe(false);
    expect(isOpenCase(row({ status: "closed" }))).toBe(false);
    expect(unresolved([row({ status: "closed" }), row({ id: "x" })]).map((r) => r.id)).toEqual([
      "x",
    ]);
  });

  it("never claims an authority has been contacted", () => {
    expect(SAFETY_DANGER_NOTICE).not.toMatch(/police|reported to|authorit(y|ies) have/i);
    expect(SAFETY_DANGER_NOTICE).toContain("emergency service");
  });
});
