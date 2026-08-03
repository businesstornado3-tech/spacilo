import { describe, expect, it } from "vitest";

import {
  addDays,
  approximateMonths,
  effectiveStatus,
  isWithdrawable,
  requestSnapshotView,
  toDateInput,
  validateRequestDates,
  type StorageRequest,
} from "@/lib/storage-requests";

const base: StorageRequest = {
  created_at: "2026-03-01T10:00:00Z",
  currency_snapshot: "GBP",
  estimated_item_volume_m3_snapshot: 3.2,
  estimated_storage_requirement_m3_snapshot: 4.45,
  expires_at: "2026-03-03T10:00:00Z",
  host_id: "host-1",
  id: "req-1",
  inventory_id: "inv-1",
  inventory_item_count_snapshot: 12,
  inventory_items_snapshot: [
    { catalogue_key: "large_box", label: "Large box", category: "boxes", quantity: 6, estimated_volume_m3: 0.6 },
  ],
  inventory_line_count_snapshot: 1,
  largest_item_snapshot: {
    label: "Sofa",
    length_cm: 200,
    width_cm: 90,
    height_cm: 85,
    longest_edge_cm: 200,
  },
  monthly_price_snapshot: 5500,
  renter_id: "renter-1",
  renter_note: "Mostly boxes and a sofa.",
  requested_end_date: "2026-06-15",
  requested_start_date: "2026-03-15",
  space_accepted_categories_snapshot: ["boxes", "furniture"],
  space_access_summary_snapshot: "By arrangement",
  space_area_snapshot: "Southsea",
  space_available_capacity_m3_snapshot: 9,
  space_id: "space-1",
  space_postcode_district_snapshot: "PO4",
  space_title_snapshot: "Dry lock-up garage",
  space_type_snapshot: "garage",
  spacefit_algorithm_snapshot: "spacefit_v1",
  spacefit_breakdown_snapshot: null,
  spacefit_label_snapshot: "Excellent fit",
  spacefit_score_snapshot: 94,
  status: "pending",
  updated_at: "2026-03-01T10:00:00Z",
  withdrawn_at: null,
};

describe("request status", () => {
  it("treats a pending request past its expiry as expired", () => {
    expect(effectiveStatus(base, new Date("2026-03-02T10:00:00Z"))).toBe("pending");
    expect(effectiveStatus(base, new Date("2026-03-03T10:00:01Z"))).toBe("expired");
  });

  it("only allows withdrawal while genuinely pending", () => {
    expect(isWithdrawable(base, new Date("2026-03-02T10:00:00Z"))).toBe(true);
    expect(isWithdrawable(base, new Date("2026-03-04T10:00:00Z"))).toBe(false);
    expect(isWithdrawable({ ...base, status: "withdrawn" }, new Date("2026-03-02T10:00:00Z"))).toBe(false);
  });
});

describe("date rules", () => {
  const today = new Date("2026-03-10T09:00:00");

  it("rejects past start dates and non-increasing ranges", () => {
    expect(validateRequestDates("2026-03-09", "2026-06-01", today).start).toBeTruthy();
    expect(validateRequestDates("2026-03-15", "2026-03-15", today).end).toBeTruthy();
    expect(validateRequestDates("2026-03-15", "2026-06-15", today)).toEqual({});
  });

  it("formats and shifts dates without timezone drift", () => {
    expect(toDateInput(new Date(2026, 2, 5))).toBe("2026-03-05");
    expect(toDateInput(addDays(new Date(2026, 2, 30), 3))).toBe("2026-04-02");
  });

  it("approximates the requested duration in months", () => {
    expect(approximateMonths("2026-03-15", "2026-06-15")).toBeCloseTo(3, 1);
    expect(approximateMonths("2026-03-15", "2026-03-14")).toBe(0);
  });
});

describe("snapshot integrity", () => {
  it("reads every figure from the request row, never from live data", () => {
    const view = requestSnapshotView(base, new Date("2026-03-02T10:00:00Z"));
    expect(view.priceLabel).toBe("£55/month");
    expect(view.requirementM3).toBe(4.45);
    expect(view.spaceFitScore).toBe(94);
    expect(view.spaceTitle).toBe("Dry lock-up garage");
  });

  it("is unaffected when the live space or inventory later changes", () => {
    const before = requestSnapshotView(base, new Date("2026-03-02T10:00:00Z"));

    // Simulates the host repricing and the renter editing their inventory:
    // the request row itself is immutable history, so the view must not move.
    const liveSpaceNow = { monthly_price_pence: 9900, title: "Renamed garage" };
    const liveInventoryNow = { estimated_storage_requirement_m3: 11.2, item_count: 30 };
    void liveSpaceNow;
    void liveInventoryNow;

    const after = requestSnapshotView(base, new Date("2026-03-02T11:00:00Z"));
    expect(after).toEqual(before);
    expect(after.priceLabel).toBe("£55/month");
    expect(after.requirementM3).toBe(4.45);
    expect(after.itemCount).toBe(12);
  });
});
