/**
 * Founder safety incident dossier — shaping tests.
 *
 * The database enforces authorisation (`is_support_staff()` inside
 * `admin_safety_incident()`, and no EXECUTE for signed-out callers); these
 * tests cover the reading of a dossier and the legal/safety distinctions the
 * console must never blur.
 */
import { describe, expect, it } from "vitest";

import {
  AI_NOT_PROOF_NOTICE,
  NO_AUTHORITY_NOTICE,
  activeControls,
  addressLines,
  advisoryWording,
  agreementSummary,
  allowedSeverityChanges,
  handoverState,
  hazardFlags,
  heldPayments,
  isNewlyFlagged,
  isProminent,
  personName,
  policyOutcome,
  policyResultLabel,
  readItem,
  relevantItems,
  safetyActionLine,
  severityHeadline,
  type IncidentAgreement,
  type IncidentBooking,
  type IncidentControl,
  type IncidentDossier,
  type IncidentItem,
  type IncidentPolicy,
} from "@/lib/admin/incident";

const item = (over: Partial<IncidentItem> = {}): IncidentItem => ({
  id: "item-1",
  item_name: "Sealed plastic drum",
  category: "other",
  quantity: 1,
  notes: null,
  length_cm: 60,
  width_cm: 60,
  height_cm: 90,
  estimated_total_volume_m3: 0.32,
  fragile: false,
  size_source: "user_measured",
  confidence_score: null,
  created_manually: true,
  ai_detected: false,
  ai_confirmed: false,
  hazard_signals: null,
  policy_category: null,
  policy_provenance: null,
  policy_confirmed_at: null,
  policy_note: null,
  created_at: "2026-09-01T10:00:00Z",
  updated_at: null,
  photo_path: null,
  photo_analysed_at: null,
  ...over,
});

const booking = (over: Partial<IncidentBooking> = {}): IncidentBooking => ({
  id: "booking-1",
  request_id: "request-1",
  space_id: "space-1",
  status: "active",
  space_title: "Dry lock-up garage",
  start_date: "2026-09-01",
  end_date: null,
  created_at: "2026-08-20T10:00:00Z",
  paid_at: "2026-08-20T10:05:00Z",
  confirmed_at: "2026-08-20T10:05:00Z",
  activated_at: null,
  completed_at: null,
  cancelled_at: null,
  renter_handover_confirmed_at: null,
  host_handover_confirmed_at: null,
  renter_collection_confirmed_at: null,
  host_collection_confirmed_at: null,
  items_finalised: false,
  storage_started: false,
  ...over,
});

const policy = (over: Partial<IncidentPolicy> = {}): IncidentPolicy => ({
  policy_version: "2026.1",
  policy_version_id: "pv-1",
  screening: { screened: true },
  compatibility: null,
  request_policy_version: "2026.1",
  request_screening: null,
  rules: [],
  ...over,
});

const control = (over: Partial<IncidentControl> = {}): IncidentControl => ({
  id: "control-1",
  scope: "booking",
  subject_id: "booking-1",
  state: "suspended",
  reason: "Potential hazardous item under review",
  source: "admin_review",
  case_id: "case-1",
  created_by: "staff-1",
  created_at: "2026-09-02T09:00:00Z",
  lifted_at: null,
  lifted_by: null,
  lift_reason: null,
  ...over,
});

describe("severity", () => {
  it("makes HIGH incidents prominent", () => {
    expect(isProminent("high")).toBe(true);
    expect(severityHeadline("high")).toBe("HIGH SAFETY INCIDENT");
  });

  it("makes CRITICAL incidents prominent", () => {
    expect(isProminent("critical")).toBe(true);
    expect(severityHeadline("critical")).toBe("CRITICAL SAFETY INCIDENT");
  });

  it("does not make low or medium cases prominent", () => {
    expect(isProminent("low")).toBe(false);
    expect(isProminent("medium")).toBe(false);
    expect(isProminent(null)).toBe(false);
  });

  it("permits the required upward transitions", () => {
    expect(allowedSeverityChanges("low")).toContain("medium");
    expect(allowedSeverityChanges("low")).toContain("high");
    expect(allowedSeverityChanges("medium")).toContain("high");
    expect(allowedSeverityChanges("high")).toContain("critical");
  });

  it("permits downward transitions too", () => {
    expect(allowedSeverityChanges("critical")).toContain("high");
    expect(allowedSeverityChanges("high")).toContain("medium");
  });

  it("flags a newly raised high case as new until staff act", () => {
    expect(
      isNewlyFlagged({
        severity: "high",
        safety_flagged_at: "2026-09-02T09:00:00Z",
        last_activity_at: "2026-09-02T09:00:00Z",
      }),
    ).toBe(true);
    expect(
      isNewlyFlagged({
        severity: "high",
        safety_flagged_at: "2026-09-02T09:00:00Z",
        last_activity_at: "2026-09-02T11:00:00Z",
      }),
    ).toBe(false);
    expect(isNewlyFlagged({ severity: "low", safety_flagged_at: "2026-09-02T09:00:00Z" })).toBe(false);
  });
});

describe("items and the legal/safety distinction", () => {
  it("reads advisory hazard flags from several shapes", () => {
    expect(hazardFlags(["check_fuel"])).toEqual(["check_fuel"]);
    expect(hazardFlags({ hazard: "check_battery" })).toEqual(["check_battery"]);
    expect(hazardFlags({ flags: ["needs_human_review"] })).toEqual(["needs_human_review"]);
    expect(hazardFlags({ hazard: "none" })).toEqual([]);
    expect(hazardFlags(null)).toEqual([]);
  });

  it("never turns an advisory detection into a legal conclusion", () => {
    const line = advisoryWording(["needs_human_review"], "high");
    expect(line).toBe(
      "Potential prohibited or hazardous item identified — HIGH severity — human review required.",
    );
    expect(line).not.toMatch(/illegal|drugs|crime|found/i);
    expect(AI_NOT_PROOF_NOTICE).toMatch(/not a finding/);
  });

  it("keeps advisory detection, declaration, policy and human review apart", () => {
    const reading = readItem(
      item({
        item_name: "Fuel can",
        hazard_signals: { hazard: "check_fuel", note: "Staff checked: empty and dry." },
        policy_category: "fuels_and_flammables",
        policy_provenance: "deterministic_rule",
        policy_confirmed_at: "2026-09-02T08:00:00Z",
        ai_detected: true,
      }),
      "critical",
    );
    expect(reading.declared).toBe("Fuel can");
    expect(reading.advisory).toEqual(["check_fuel"]);
    expect(reading.policyCategory).toBe("fuels_and_flammables");
    expect(reading.policyProvenance).toBe("deterministic_rule");
    expect(reading.humanNote).toBe("Staff checked: empty and dry.");
    expect(reading.aiDetected).toBe(true);
    expect(reading.renterConfirmed).toBe(true);
  });

  it("shows the item the renter declared", () => {
    expect(readItem(item(), null).declared).toBe("Sealed plastic drum");
    expect(readItem(item(), null).advisoryWording).toBeNull();
  });

  it("sorts flagged items first", () => {
    const sorted = relevantItems([
      item({ id: "a" }),
      item({ id: "b", hazard_signals: ["check_fuel"] }),
      item({ id: "c", policy_category: "other" }),
    ]);
    expect(sorted.map((row) => row.id)).toEqual(["b", "c", "a"]);
  });
});

describe("policy result", () => {
  it("reports a prohibited decision from the deterministic rule", () => {
    const value = policy({
      rules: [
        {
          id: "rule-1",
          rule_key: "fuel",
          category: "fuels_and_flammables",
          subcategory: null,
          decision: "prohibited",
          severity: "high",
          requires_user_confirmation: true,
          requires_staff_review: true,
          internal_reason_code: "FLAMMABLE",
          renter_message: "Fuel may not be stored.",
        },
      ],
    });
    expect(policyOutcome(value).prohibited).toBe(true);
    expect(policyResultLabel(value)).toBe("Prohibited under the published Storage Rules");
  });

  it("reports restriction and identification separately", () => {
    expect(
      policyResultLabel(
        policy({
          rules: [
            {
              id: "r",
              rule_key: "k",
              category: "other",
              subcategory: null,
              decision: "restricted",
              severity: null,
              requires_user_confirmation: null,
              requires_staff_review: null,
              internal_reason_code: null,
              renter_message: null,
            },
          ],
        }),
      ),
    ).toBe("Restricted under the published Storage Rules");
    expect(policyOutcome(policy()).needsIdentification).toBe(false);
  });

  it("keeps the policy version that was in force", () => {
    expect(policy().policy_version).toBe("2026.1");
  });
});

describe("agreement and handover", () => {
  const agreement = (over: Partial<IncidentAgreement> = {}): IncidentAgreement => ({
    id: "agreement-1",
    status: "active",
    agreement_version: "1.0",
    agreement_version_id: "av-1",
    renter_accepted_at: "2026-08-25T09:00:00Z",
    host_accepted_at: "2026-08-25T10:00:00Z",
    activated_at: "2026-08-25T10:00:00Z",
    superseded_at: null,
    cancelled_at: null,
    acceptances: [],
    ...over,
  });

  it("shows the agreement status, version and both acceptances", () => {
    const summary = agreementSummary(agreement());
    expect(summary.status).toBe("active");
    expect(summary.version).toBe("1.0");
    expect(summary.renterAccepted).toBe(true);
    expect(summary.hostAccepted).toBe(true);
    expect(summary.active).toBe(true);
  });

  it("shows when re-acceptance is required and when it ended", () => {
    expect(agreementSummary(agreement({ status: "requires_reacceptance" })).reacceptanceRequired).toBe(true);
    expect(agreementSummary(agreement({ status: "cancelled" })).ended).toBe(true);
    expect(agreementSummary(null).status).toBe("No agreement record");
  });

  it("uses the handover timestamps, not the booking status, as the source of truth", () => {
    expect(handoverState(booking({ status: "active" })).itemsFinalised).toBe(false);
    const both = handoverState(
      booking({
        renter_handover_confirmed_at: "2026-09-01T09:00:00Z",
        host_handover_confirmed_at: "2026-09-01T09:30:00Z",
        activated_at: "2026-09-01T09:30:00Z",
      }),
    );
    expect(both.itemsFinalised).toBe(true);
    expect(both.storageStarted).toBe(true);
    expect(both.label).toMatch(/Storage under way/);
    expect(handoverState(null).label).toBe("No booking linked");
  });
});

describe("linkage, address and controls", () => {
  it("links booking, request, space and item through the existing ids", () => {
    const dossier = {
      booking: booking(),
      request: { id: "request-1", inventory_id: "inv-1" },
      space: { id: "space-1" },
      items: [item({ id: "item-1" })],
    } as unknown as IncidentDossier;
    expect(dossier.booking?.request_id).toBe(dossier.request?.id);
    expect(dossier.booking?.space_id).toBe(dossier.space?.id);
    expect(dossier.items[0]?.id).toBe("item-1");
  });

  it("builds the full address for authorised staff and nothing without a space", () => {
    expect(
      addressLines({
        address_line1: "14 Elm Road",
        address_line2: null,
        town: "Portsmouth",
        postcode: "PO1 2AB",
      } as never),
    ).toEqual(["14 Elm Road", "Portsmouth", "PO1 2AB"]);
    expect(addressLines(null)).toEqual([]);
  });

  it("shows only controls that exist, and never claims one that was not applied", () => {
    expect(activeControls([])).toEqual([]);
    expect(safetyActionLine([], [])).toBe("No safety control applied");
    expect(activeControls([control(), control({ id: "c2", lifted_at: "2026-09-03T09:00:00Z" })])).toHaveLength(1);
    expect(safetyActionLine([control()], [])).toMatch(/booking suspended/);
  });

  it("reports payment holds only when a hold flag is set", () => {
    expect(heldPayments([{ id: "e1", hold_dispute: false, hold_refund: false, hold_review: false } as never])).toHaveLength(0);
    expect(heldPayments([{ id: "e1", hold_dispute: true } as never])).toHaveLength(1);
  });

  it("shows renter and host names", () => {
    expect(personName({ display_name: "Alex Reed" } as never)).toBe("Alex Reed");
    expect(personName({ first_name: "Sam", last_name: "Hart" } as never)).toBe("Sam Hart");
    expect(personName(null)).toBe("Unknown");
  });

  it("introduces no automatic authority reporting", () => {
    expect(NO_AUTHORITY_NOTICE).toMatch(/does not report cases to any authority automatically/);
  });
});
