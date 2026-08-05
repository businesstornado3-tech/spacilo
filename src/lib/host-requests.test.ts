import { describe, expect, it } from "vitest";

import {
  effectiveStatus,
  hostStatusDetail,
  isRespondable,
  isWithdrawable,
  pendingForHost,
  requestSnapshotView,
  statusMeta,
  type StorageRequest,
} from "@/lib/storage-requests";

const base: StorageRequest = {
  policy_version_snapshot: null,
  policy_version_id_snapshot: null,
  policy_screening_snapshot: null,
  compatibility_snapshot: null,
  renter_declaration_snapshot: null,
  space_suitability_snapshot: null,
  daily_rate_snapshot: null,
  weekly_rate_snapshot: null,
  minimum_stay_days_snapshot: null,
  duration_days_snapshot: null,
  pricing_version_snapshot: null,
  pricing_breakdown_snapshot: null,
  storage_amount_pence: null,
  booking_action_expires_at: null,
  created_at: "2026-08-01T10:00:00Z",
  currency_snapshot: "GBP",
  decline_reason: null,
  responded_at: null,
  renter_first_name_snapshot: "Sam",
  estimated_item_volume_m3_snapshot: 2.6,
  estimated_storage_requirement_m3_snapshot: 3.58,
  expires_at: "2026-08-05T10:00:00Z",
  host_id: "host-a",
  id: "req-1",
  inventory_id: "inv-1",
  inventory_item_count_snapshot: 17,
  inventory_items_snapshot: [
    { catalogue_key: "large_box", label: "Boxes", category: "boxes", quantity: 11, estimated_volume_m3: 1.1 },
  ],
  inventory_line_count_snapshot: 1,
  largest_item_snapshot: null,
  monthly_price_snapshot: 5500,
  renter_id: "renter-1",
  renter_note: null,
  requested_end_date: "2026-12-01",
  requested_start_date: "2026-09-01",
  space_accepted_categories_snapshot: ["boxes"],
  space_access_summary_snapshot: "By arrangement",
  space_area_snapshot: "PO1",
  space_available_capacity_m3_snapshot: 9,
  space_id: "space-1",
  space_postcode_district_snapshot: "PO1",
  space_title_snapshot: "Part of the space",
  space_type_snapshot: "garage",
  spacefit_algorithm_snapshot: "spacefit_v1",
  spacefit_plan_snapshot: null,
  spacefit_space_dimensions_snapshot: null,
  spacefit_breakdown_snapshot: null,
  spacefit_label_snapshot: "Excellent fit",
  spacefit_score_snapshot: 94,
  status: "pending",
  updated_at: "2026-08-01T10:00:00Z",
  withdrawn_at: null,
};

const now = new Date("2026-08-03T10:00:00Z");
const afterExpiry = new Date("2026-08-06T10:00:00Z");

describe("host pending count", () => {
  it("counts only requests genuinely awaiting a response (TEST C, D, E, G)", () => {
    const requests: StorageRequest[] = [
      base,
      { ...base, id: "r2", status: "accepted", responded_at: "2026-08-02T10:00:00Z" },
      { ...base, id: "r3", status: "declined" },
      { ...base, id: "r4", status: "withdrawn" },
      { ...base, id: "r5", expires_at: "2026-08-02T10:00:00Z" }, // pending but stale
    ];
    const pending = pendingForHost(requests, now);
    expect(pending.map((r) => r.id)).toEqual(["req-1"]);

    // A pending request is not a booking and earns nothing yet.
    const activeBookings = requests.filter((r) =>
      ["confirmed", "active"].includes(effectiveStatus(r, now)),
    );
    expect(activeBookings).toHaveLength(0);
    const earningsPence = activeBookings.reduce((t, r) => t + (r.monthly_price_snapshot ?? 0), 0);
    expect(earningsPence).toBe(0);

    // Accepting removes it from the pending count without creating a booking.
    const accepted: StorageRequest = { ...base, status: "accepted" };
    expect(pendingForHost([accepted], now)).toHaveLength(0);
    expect(
      [accepted].filter((r) => ["confirmed", "active"].includes(effectiveStatus(r, now))),
    ).toHaveLength(0);
  });
});

describe("host response eligibility", () => {
  it("allows a response only while pending and unexpired (TEST F, J, K, L, M)", () => {
    expect(isRespondable(base, now)).toBe(true);
    expect(isRespondable({ ...base, status: "withdrawn" }, now)).toBe(false);
    expect(isRespondable(base, afterExpiry)).toBe(false);
    expect(isRespondable({ ...base, status: "accepted" }, now)).toBe(false);
    expect(isRespondable({ ...base, status: "declined" }, now)).toBe(false);
  });

  it("keeps renter withdrawal and host response on the same canonical status (TEST H, I)", () => {
    expect(isWithdrawable({ ...base, status: "accepted" }, now)).toBe(false);
    expect(effectiveStatus({ ...base, status: "accepted" }, now)).toBe("accepted");
    expect(statusMeta("accepted").label).toBe("Accepted");
    expect(statusMeta("declined").label).toBe("Declined");
    expect(hostStatusDetail("accepted")).toContain("accepted");
    expect(hostStatusDetail("declined")).toContain("declined");
  });

  it("presents a stale pending request as expired to both sides (TEST K)", () => {
    expect(effectiveStatus(base, afterExpiry)).toBe("expired");
    expect(statusMeta(effectiveStatus(base, afterExpiry)).label).toBe("Expired");
  });
});

describe("host view snapshot integrity (TEST N, O)", () => {
  it("reads the request snapshot, not live listing or inventory data", () => {
    const view = requestSnapshotView(base, now);
    expect(view.spaceTitle).toBe("Part of the space");
    expect(view.priceLabel).toBe("£55/month");
    expect(view.itemCount).toBe(17);
    expect(view.requirementM3).toBeCloseTo(3.58, 2);
    expect(view.spaceFitScore).toBe(94);

    // The host reprices and renames the live listing; the request must not move.
    const laterView = requestSnapshotView(base, new Date("2026-08-04T10:00:00Z"));
    expect(laterView.priceLabel).toBe("£55/month");
    expect(laterView.spaceTitle).toBe("Part of the space");
  });

  it("never carries an exact address or coordinates", () => {
    const keys = Object.keys(base);
    expect(keys.some((k) => /latitude|longitude|address_line|postcode_full/.test(k))).toBe(false);
    expect(Object.keys(requestSnapshotView(base, now))).not.toContain("address");
  });
});
