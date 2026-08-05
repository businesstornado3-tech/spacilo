import { describe, expect, it } from "vitest";

import {
  buildListingConfidence,
  buildWhySection,
  capacityProvenance,
  CHECK_STATE_TEXT,
} from "@/lib/trust/listing-confidence";
import {
  capacityComparison,
  compactConfidenceLine,
  declarationStatus,
  hostConfidenceChecks,
  hostEarningsView,
  hostInventorySummary,
  hostNextAction,
  HOST_VISIBLE_ITEM_FIELDS,
} from "@/lib/trust/host-request-confidence";
import { containsForbiddenClaim } from "@/lib/trust/signals";
import type { CompatibilityReport } from "@/lib/policy/types";
import type { ScreeningSummary } from "@/lib/policy/engine";
import type { SpaceFitResult } from "@/lib/spacefit/types";
import type { HostSpaceLike } from "@/lib/spacefit-hub";
import type { StorageRequest } from "@/lib/storage-requests";

/* -------------------------------------------------------------- fixtures */

const dimension = (status: CompatibilityReport["physical"]["status"], detail: string) => ({
  status,
  headline: detail,
  detail,
  reasons: [] as string[],
});

const report = (overrides: Partial<CompatibilityReport> = {}): CompatibilityReport => ({
  overall: "compatible",
  physical: dimension("compatible", "Your items fit inside the usable capacity."),
  policy: dimension("compatible", "Nothing you're storing is restricted."),
  suitability: dimension("compatible", "The space suits what you're storing."),
  ...overrides,
});

const screening = (overrides: Partial<ScreeningSummary> = {}): ScreeningSummary =>
  ({
    available: true,
    blocked: false,
    actionRequired: false,
    items: [],
    ...overrides,
  }) as ScreeningSummary;

const spaceFit = (overrides: Partial<SpaceFitResult> = {}): SpaceFitResult => ({
  space_id: "space-1",
  algorithm: "spacefit-v1",
  compatible: true,
  score: 88,
  label: "Great fit",
  components: null,
  positives: ["Enough space for everything you've listed"],
  warnings: [],
  hard_failures: [],
  completenessPoints: 8,
  pricePence: 5500,
  ...overrides,
});

const hostSpace = (overrides: Partial<HostSpaceLike> = {}): HostSpaceLike => ({
  id: "space-1",
  space_type: "garage",
  estimated_available_volume_m3: 9,
  access_type: "by_arrangement",
  features: ["indoor", "lockable"],
  measurement_source: "host_verified",
  measurements_verified_at: "2026-05-01T10:00:00Z",
  ...overrides,
});

const request = (overrides: Partial<StorageRequest> = {}): StorageRequest =>
  ({
    id: "req-1",
    renter_id: "renter-1",
    host_id: "host-1",
    space_id: "space-1",
    inventory_id: "inv-1",
    status: "pending",
    created_at: "2026-08-01T10:00:00Z",
    updated_at: "2026-08-01T10:00:00Z",
    expires_at: "2026-08-05T10:00:00Z",
    requested_start_date: "2026-09-01",
    requested_end_date: "2026-12-01",
    renter_note: null,
    renter_first_name_snapshot: "Sam",
    responded_at: null,
    decline_reason: null,
    withdrawn_at: null,
    booking_action_expires_at: null,
    currency_snapshot: "GBP",
    daily_rate_snapshot: null,
    weekly_rate_snapshot: null,
    monthly_price_snapshot: 5500,
    minimum_stay_days_snapshot: null,
    duration_days_snapshot: 91,
    pricing_version_snapshot: "stow-pricing-v1",
    pricing_breakdown_snapshot: { storageAmountPence: 16500 },
    storage_amount_pence: 16500,
    inventory_item_count_snapshot: 17,
    inventory_line_count_snapshot: 2,
    inventory_items_snapshot: [
      { catalogue_key: "large_box", label: "Boxes", category: "boxes", quantity: 11, estimated_volume_m3: 1.1 },
      { catalogue_key: "sofa", label: "Sofa", category: "furniture", quantity: 1, estimated_volume_m3: 1.5 },
    ],
    largest_item_snapshot: {
      label: "Sofa",
      length_cm: 200,
      width_cm: 90,
      height_cm: 85,
      longest_edge_cm: 200,
    },
    estimated_item_volume_m3_snapshot: 2.6,
    estimated_storage_requirement_m3_snapshot: 3.58,
    space_available_capacity_m3_snapshot: 9,
    space_title_snapshot: "Dry lock-up garage",
    space_type_snapshot: "garage",
    space_area_snapshot: "PO1",
    space_postcode_district_snapshot: "PO1",
    space_accepted_categories_snapshot: ["boxes", "furniture"],
    space_access_summary_snapshot: "By arrangement",
    space_suitability_snapshot: null,
    spacefit_score_snapshot: 88,
    spacefit_label_snapshot: "Great fit",
    spacefit_algorithm_snapshot: "spacefit-v1",
    spacefit_breakdown_snapshot: null,
    spacefit_plan_snapshot: null,
    spacefit_space_dimensions_snapshot: null,
    policy_version_snapshot: "2026.1",
    policy_version_id_snapshot: "pol-1",
    policy_screening_snapshot: { blocked: false, action_required: false, items: [] },
    compatibility_snapshot: {
      policy_version: "2026.1",
      policy_status: "allowed",
      suitability_known: true,
      suitability_warnings: [],
      physical_fit: { spacefit_score: 88, spacefit_label: "Great fit" },
    },
    renter_declaration_snapshot: {
      policy_version: "2026.1",
      accurate: true,
      no_prohibited_items: true,
      accepts_policy: true,
    },
    ...overrides,
  }) as unknown as StorageRequest;

/* ------------------------------------------------- listing confidence */

describe("listing confidence — consolidated FIT / POLICY / SUITABILITY", () => {
  it("shows all three checks with a textual status, not colour alone", () => {
    const confidence = buildListingConfidence({
      report: report(),
      screening: screening(),
      spaceFit: spaceFit(),
      requirementM3: 3.58,
      space: hostSpace(),
    });
    expect(confidence.checks.map((c) => c.key)).toEqual(["fit", "policy", "suitability"]);
    for (const check of confidence.checks) {
      expect(check.statusText).toBe(CHECK_STATE_TEXT[check.state]);
      expect(check.statusText.length).toBeGreaterThan(0);
    }
    expect(confidence.outcome).toBe("strong_match");
    expect(confidence.positive).toBe(true);
  });

  it("compares the renter's requirement with the space's usable capacity", () => {
    const confidence = buildListingConfidence({
      report: report(),
      screening: screening(),
      spaceFit: spaceFit(),
      requirementM3: 3.58,
      space: hostSpace(),
    });
    expect(confidence.requirement.value).toBe("3.6 m³");
    expect(confidence.capacity.value).toBe("9.0 m³");
  });

  it("keeps provenance honest — AI proposals never read as confirmed", () => {
    expect(capacityProvenance(hostSpace())).toBe("Host-confirmed measurements");
    expect(capacityProvenance(hostSpace({ measurement_source: "ai_estimated" }))).toContain(
      "Estimated by SpaceFit AI",
    );
    expect(capacityProvenance(hostSpace({ measurement_source: "ai_estimated" }))).not.toMatch(
      /verified|guaranteed/i,
    );
    expect(
      capacityProvenance(hostSpace({ measurement_source: null, estimated_available_volume_m3: null })),
    ).toBe("Not measured yet");
  });

  it("reports a policy block above everything else", () => {
    const confidence = buildListingConfidence({
      report: report({
        policy: dimension("not_compatible", "One item can't be stored under the storage policy."),
      }),
      screening: screening({ blocked: true }),
      spaceFit: spaceFit(),
      requirementM3: 3.58,
      space: hostSpace(),
    });
    expect(confidence.outcome).toBe("blocked_by_policy");
    expect(confidence.checks[0]?.key).toBe("fit");
    expect(confidence.checks[1]?.state).toBe("blocked");
    expect(confidence.positive).toBe(false);
  });

  it("treats missing data as unknown, never a tick", () => {
    const confidence = buildListingConfidence({
      report: report({
        suitability: {
          status: "compatible",
          headline: "Not described",
          detail: "The host hasn't described this space yet.",
          reasons: ["suitability_unknown"],
        },
      }),
      screening: screening({ available: false }),
      spaceFit: null,
      requirementM3: null,
      space: hostSpace({ estimated_available_volume_m3: null, measurement_source: null }),
    });
    expect(confidence.checks.find((c) => c.key === "policy")?.state).toBe("unknown");
    expect(confidence.checks.find((c) => c.key === "suitability")?.state).toBe("unknown");
    expect(confidence.requirement.value).toBeNull();
    expect(confidence.capacity.value).toBeNull();
  });
});

describe("why this space may work", () => {
  const positive = buildListingConfidence({
    report: report(),
    screening: screening(),
    spaceFit: spaceFit(),
    requirementM3: 3.58,
    space: hostSpace(),
  });

  it("gives factual bullets when everything checks out", () => {
    const why = buildWhySection({
      confidence: positive,
      spaceFit: spaceFit(),
      space: hostSpace(),
      capacityCovers: true,
    });
    expect(why.tone).toBe("positive");
    expect(why.title).toBe("Why this space may work");
    expect(why.reasons).toContain("Enough usable capacity for your current items");
    expect(why.reasons).toContain("Lockable");
    for (const reason of why.reasons) expect(containsForbiddenClaim(reason)).toBe(false);
  });

  it("changes its wording when compatibility is negative", () => {
    const blocked = buildListingConfidence({
      report: report({ policy: dimension("not_compatible", "An item can't be stored here.") }),
      screening: screening({ blocked: true }),
      spaceFit: spaceFit(),
      requirementM3: 3.58,
      space: hostSpace(),
    });
    const why = buildWhySection({
      confidence: blocked,
      spaceFit: spaceFit(),
      space: hostSpace(),
      capacityCovers: true,
    });
    expect(why.tone).toBe("negative");
    expect(why.title).not.toContain("may work");
    expect(why.reasons.join(" ")).toContain("can't be stored");
  });

  it("uses a caution heading when there are only notes", () => {
    const notes = buildListingConfidence({
      report: report({
        overall: "compatible_with_care",
        physical: dimension("compatible_with_care", "It's a tight fit."),
      }),
      screening: screening(),
      spaceFit: spaceFit({ warnings: ["Doorway width is close to your largest item."] }),
      requirementM3: 8.5,
      space: hostSpace(),
    });
    const why = buildWhySection({
      confidence: notes,
      spaceFit: spaceFit({ warnings: ["Doorway width is close to your largest item."] }),
      space: hostSpace(),
      capacityCovers: true,
    });
    expect(why.tone).toBe("caution");
    expect(why.title).toBe("Things to consider");
  });
});

/* ------------------------------------------------ host request confidence */

describe("host capacity vs requirement", () => {
  it("shows spare capacity for a comfortable fit", () => {
    const comparison = capacityComparison(request());
    expect(comparison.state).toBe("fits");
    expect(comparison.headroomM3).toBeCloseTo(5.42, 2);
    expect(comparison.headline).toContain("3.6 m³");
  });

  it("flags a tight fit and an over-capacity request", () => {
    expect(
      capacityComparison(request({ estimated_storage_requirement_m3_snapshot: 8.5 })).state,
    ).toBe("tight");
    expect(
      capacityComparison(request({ estimated_storage_requirement_m3_snapshot: 12 })).state,
    ).toBe("over");
  });

  it("says unknown rather than guessing when capacity wasn't recorded", () => {
    const comparison = capacityComparison(request({ space_available_capacity_m3_snapshot: null }));
    expect(comparison.state).toBe("unknown");
    expect(comparison.headroomM3).toBeNull();
  });
});

describe("host confidence checks", () => {
  it("reads the frozen snapshot, not live data", () => {
    const checks = hostConfidenceChecks(request());
    expect(checks.map((c) => c.key)).toEqual(["fit", "policy", "suitability"]);
    expect(checks[0]?.detail).toContain("SpaceFit 88%");
    expect(checks[1]?.detail).toContain("2026.1");
    expect(checks.every((c) => c.state === "pass")).toBe(true);
  });

  it("surfaces a policy block and items needing action", () => {
    expect(
      hostConfidenceChecks(request({ policy_screening_snapshot: { blocked: true } }))[1]?.state,
    ).toBe("blocked");
    expect(
      hostConfidenceChecks(request({ policy_screening_snapshot: { action_required: true } }))[1]
        ?.state,
    ).toBe("action");
  });

  it("marks suitability unknown when the host never described the space", () => {
    const checks = hostConfidenceChecks(
      request({
        compatibility_snapshot: { policy_version: "2026.1", suitability_known: false },
      }),
    );
    expect(checks[2]?.state).toBe("unknown");
  });
});

describe("inventory privacy", () => {
  it("summarises belongings without exposing photos or internal metadata", () => {
    const summary = hostInventorySummary(request());
    expect(summary.itemCount).toBe(17);
    expect(summary.categories).toEqual(["boxes", "furniture"]);
    expect(summary.largestItem?.dimensions).toBe("200 × 90 × 85 cm");
    for (const line of summary.lines) {
      expect(Object.keys(line).sort()).toEqual(["category", "label", "quantity", "volumeM3"]);
    }
    expect(JSON.stringify(summary.lines)).not.toMatch(/photo|storage_path|detection|confidence|item_id/i);
    expect(HOST_VISIBLE_ITEM_FIELDS).not.toContain("photos" as never);
    expect(summary.privacyNote).toContain("stay private");
  });

  it("bounds how many lines a host sees", () => {
    const summary = hostInventorySummary(request(), 1);
    expect(summary.lines).toHaveLength(1);
    expect(summary.lineCount).toBe(2);
  });
});

describe("renter declaration status in the host view", () => {
  it("shows each confirmation and the policy version", () => {
    const status = declarationStatus(request());
    expect(status.complete).toBe(true);
    expect(status.policyVersion).toBe("2026.1");
    expect(status.lines).toHaveLength(3);
  });

  it("never claims a declaration that wasn't made", () => {
    const status = declarationStatus(request({ renter_declaration_snapshot: null }));
    expect(status.complete).toBe(false);
    expect(status.lines.every((line) => line.confirmed === false)).toBe(true);
  });
});

describe("host earnings clarity", () => {
  it("calls a pending request potential, not earned", () => {
    const earnings = hostEarningsView(request());
    expect(earnings.state).toBe("potential");
    expect(earnings.label).toBe("Potential earnings");
    expect(earnings.amount).toBe("£165");
    expect(earnings.detail).toContain("Nothing is earned yet");
  });

  it("keeps an accepted-but-unpaid request potential", () => {
    expect(hostEarningsView(request({ status: "accepted" })).state).toBe("potential");
  });

  it("only becomes earned once the booking is confirmed or active", () => {
    expect(hostEarningsView(request({ status: "confirmed" })).state).toBe("earned");
    expect(hostEarningsView(request({ status: "active" })).state).toBe("earned");
    expect(hostEarningsView(request({ status: "completed" })).state).toBe("paid");
  });

  it("reads the frozen amount rather than recomputing it", () => {
    expect(hostEarningsView(request({ storage_amount_pence: 20000 })).amount).toBe("£200");
    expect(hostEarningsView(request({ storage_amount_pence: null })).state).toBe("none");
  });
});

describe("host next-action guidance", () => {
  it("is deterministic for each state", () => {
    expect(hostNextAction(request(), true).headline).toContain("Accept or decline");
    expect(hostNextAction(request(), true).detail).toContain("No money moves");
    expect(hostNextAction(request({ status: "accepted" }), false).headline).toContain(
      "Waiting for the renter to pay",
    );
    expect(hostNextAction(request({ status: "expired" }), false).headline).toContain("expired");
  });
});

describe("dashboard compact line", () => {
  it("packs SpaceFit and capacity into one factual line", () => {
    expect(compactConfidenceLine(request())).toContain("SpaceFit 88%");
    expect(compactConfidenceLine(request())).toContain("3.6 m³");
    expect(compactConfidenceLine(request({ spacefit_score_snapshot: null }))).toContain(
      "not recorded",
    );
  });

  it("never uses a forbidden trust claim", () => {
    expect(containsForbiddenClaim(compactConfidenceLine(request()))).toBe(false);
    for (const check of hostConfidenceChecks(request())) {
      expect(containsForbiddenClaim(`${check.label} ${check.detail}`)).toBe(false);
    }
  });
});
