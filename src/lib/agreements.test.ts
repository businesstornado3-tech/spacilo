import { describe, expect, it } from "vitest";

import {
  AGREEMENT_BLOCK_MESSAGE,
  agreementBlock,
  canAccept,
  friendlyAgreementError,
  isAgreementActive,
  otherPartyAccepted,
  viewerAccepted,
  type AgreementStateView,
} from "@/lib/agreements";
import { ACTIVATION_MESSAGE, handoverGate } from "@/lib/bookings-lifecycle";
import type { Booking } from "@/lib/bookings";

const VERSION = {
  id: "ver-1",
  version: "ER-STORAGE-2026-09-01-v1",
  title: "EarnRoom Storage Terms",
  summary: "",
  sections: [],
  effective_at: "2026-09-01T00:00:00Z",
};

function state(overrides: Partial<AgreementStateView> = {}): AgreementStateView {
  return {
    booking_id: "b1",
    viewer_party: "renter",
    agreement: {
      id: "a1",
      status: "pending",
      agreement_version_id: "ver-1",
      agreement_version: VERSION.version,
      renter_accepted_at: null,
      host_accepted_at: null,
      activated_at: null,
    },
    current_version: VERSION,
    version_current: true,
    active: false,
    ...overrides,
  };
}

const accepted = (party: "renter" | "host", base = state()) => ({
  ...base,
  agreement: {
    ...base.agreement!,
    [`${party}_accepted_at`]: "2026-09-05T10:00:00Z",
    status: party === "renter" ? ("renter_accepted" as const) : ("host_accepted" as const),
  },
});

describe("bilateral storage agreement", () => {
  it("starts pending with neither party accepted", () => {
    const s = state();
    expect(viewerAccepted(s)).toBe(false);
    expect(otherPartyAccepted(s)).toBe(false);
    expect(isAgreementActive(s)).toBe(false);
    expect(agreementBlock(s)).toBe("awaiting_you");
  });

  it("lets the renter accept as renter", () => {
    expect(canAccept(state())).toBe(true);
  });

  it("lets the host accept as host", () => {
    expect(canAccept(state({ viewer_party: "host" }))).toBe(true);
  });

  it("never offers acceptance to a party who has already accepted", () => {
    expect(canAccept(accepted("renter"))).toBe(false);
  });

  it("never offers acceptance to staff", () => {
    expect(canAccept(state({ viewer_party: "staff" }))).toBe(false);
  });

  it("does not activate on one acceptance alone", () => {
    const renterOnly = accepted("renter");
    expect(isAgreementActive(renterOnly)).toBe(false);
    expect(agreementBlock(renterOnly)).toBe("awaiting_host");

    const hostOnly = accepted("host", state({ viewer_party: "host" }));
    expect(isAgreementActive(hostOnly)).toBe(false);
    expect(agreementBlock(hostOnly)).toBe("awaiting_renter");
  });

  it("activates only when both parties accepted the same version", () => {
    const both = state({
      agreement: {
        id: "a1",
        status: "active",
        agreement_version_id: "ver-1",
        agreement_version: VERSION.version,
        renter_accepted_at: "2026-09-05T10:00:00Z",
        host_accepted_at: "2026-09-05T11:00:00Z",
        activated_at: "2026-09-05T11:00:00Z",
      },
    });
    expect(isAgreementActive(both)).toBe(true);
    expect(agreementBlock(both)).toBeNull();
  });

  it("blocks when the live version has moved on", () => {
    const stale = state({ version_current: false });
    expect(agreementBlock(stale)).toBe("version_changed");
    expect(canAccept(stale)).toBe(false);
  });

  it("blocks a superseded or cancelled agreement", () => {
    const superseded = state({
      agreement: { ...state().agreement!, status: "superseded" },
    });
    expect(agreementBlock(superseded)).toBe("cancelled");
    expect(canAccept(superseded)).toBe(false);
  });

  it("treats a missing agreement as blocking", () => {
    expect(agreementBlock(state({ agreement: null }))).toBe("no_agreement");
    expect(isAgreementActive(null)).toBe(false);
    expect(canAccept(null)).toBe(false);
  });

  it("reports material re-acceptance in the renter's words", () => {
    const stale = state({
      agreement: { ...state().agreement!, status: "requires_reacceptance" },
    });
    expect(AGREEMENT_BLOCK_MESSAGE[agreementBlock(stale)!]).toContain("accepted again");
  });

  it("maps the deterministic server errors to plain wording", () => {
    expect(friendlyAgreementError("STORAGE_AGREEMENT_REQUIRED", "x")).toContain(
      "accept the Storage Terms",
    );
    expect(friendlyAgreementError("STORAGE_AGREEMENT_VERSION_CHANGED", "x")).toContain("changed");
    expect(friendlyAgreementError("something else", "fallback")).toBe("fallback");
  });
});

describe("finalisation gate", () => {
  const booking = {
    status: "confirmed",
    start_date: "2026-09-01",
    end_date: "2026-12-01",
    renter_id: "renter-1",
    host_id: "host-1",
  } as unknown as Booking;

  const facts = {
    booking,
    viewerId: "renter-1",
    paid: true,
    now: new Date("2026-09-05T12:00:00Z"),
  };

  it("blocks the handover while the agreement is not active", () => {
    const gate = handoverGate({ ...facts, agreementActive: false });
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toBe("agreement_required");
    expect(ACTIVATION_MESSAGE["agreement_required"]).toContain("Storage Terms");
  });

  it("allows the handover once the agreement is active", () => {
    expect(handoverGate({ ...facts, agreementActive: true }).allowed).toBe(true);
  });

  it("keeps the existing payment and date guards ahead of the agreement", () => {
    expect(handoverGate({ ...facts, paid: false, agreementActive: true }).reason).toBe("not_paid");
  });
});
