/**
 * Prompt 15 — handover evidence rules.
 *
 * These mirror the database policies (`booking_stage_open`,
 * `booking_party_role`) so a regression in either surface is visible here.
 */
import { describe, expect, it } from "vitest";

import {
  CONFIRMATION_STATEMENT,
  EVIDENCE_DISCLAIMER,
  ISSUE_CATEGORIES,
  attribution,
  evidencePath,
  partyFor,
  stageOpen,
  stageReadOnly,
  visibleStages,
} from "@/lib/handover";
import { bookingItems } from "@/lib/bookings";
import { handoverProgress, lifecycleState } from "@/lib/bookings-lifecycle";

const booking = (over: Record<string, unknown> = {}) =>
  ({
    id: "b1",
    renter_id: "renter-1",
    host_id: "host-1",
    status: "confirmed",
    start_date: "2026-08-01",
    end_date: "2026-09-01",
    ...over,
  }) as never;

describe("evidence stage gating", () => {
  it("opens check-in from confirmed until storage ends", () => {
    expect(stageOpen("confirmed", "check_in")).toBe(true);
    expect(stageOpen("active", "check_in")).toBe(true);
    expect(stageOpen("completed", "check_in")).toBe(false);
    expect(stageOpen("cancelled", "check_in")).toBe(false);
    expect(stageOpen("pending_payment", "check_in")).toBe(false);
  });

  it("opens checkout only while the belongings are in storage", () => {
    expect(stageOpen("confirmed", "check_out")).toBe(false);
    expect(stageOpen("active", "check_out")).toBe(true);
    expect(stageOpen("completed", "check_out")).toBe(false);
  });

  it("marks closed stages read-only", () => {
    expect(stageReadOnly("completed", "check_in")).toBe(true);
    expect(stageReadOnly("active", "check_in")).toBe(false);
  });

  it("never shows handover stages for a cancelled or unpaid booking", () => {
    expect(visibleStages({ status: "cancelled" } as never)).toEqual([]);
    expect(visibleStages({ status: "pending_payment" } as never)).toEqual([]);
    expect(visibleStages({ status: "confirmed" } as never)).toEqual(["check_in"]);
    expect(visibleStages({ status: "active" } as never)).toEqual(["check_in", "check_out"]);
    expect(visibleStages({ status: "completed" } as never)).toEqual(["check_in", "check_out"]);
  });
});

describe("attribution and authorisation", () => {
  it("identifies each party and rejects unrelated users", () => {
    expect(partyFor(booking(), "renter-1")).toBe("renter");
    expect(partyFor(booking(), "host-1")).toBe("host");
    expect(partyFor(booking(), "stranger")).toBeNull();
    expect(partyFor(booking(), null)).toBeNull();
  });

  it("attributes notes to the submitting party without claiming verification", () => {
    expect(attribution("renter")).toBe("Recorded by the renter");
    expect(attribution("host")).toBe("Recorded by the host");
    expect(EVIDENCE_DISCLAIMER).toContain("provided by the renter and host");
    expect(EVIDENCE_DISCLAIMER.toLowerCase()).not.toContain("verified");
  });

  it("uses first-person confirmation statements for each stage", () => {
    expect(CONFIRMATION_STATEMENT.check_in.renter).toContain("handed to the host");
    expect(CONFIRMATION_STATEMENT.check_in.host).toContain("received the belongings");
    expect(CONFIRMATION_STATEMENT.check_out.renter).toContain("collected my belongings");
    expect(CONFIRMATION_STATEMENT.check_out.host).toContain("storage space is clear");
  });

  it("offers the structured issue categories dispute handling will need", () => {
    expect(ISSUE_CATEGORIES).toContain("items_differ");
    expect(ISSUE_CATEGORIES).toContain("quantity_differs");
    expect(ISSUE_CATEGORIES).toContain("condition_concern");
    expect(ISSUE_CATEGORIES).toContain("restricted_item");
  });
});

describe("evidence file paths", () => {
  it("scopes every file to booking / stage / uploader", () => {
    const path = evidencePath({
      bookingId: "book-1",
      stage: "check_in",
      uploaderId: "user-9",
      fileName: "photo.PNG",
    });
    const [bookingFolder, stageFolder, uploaderFolder, file] = path.split("/");
    expect(bookingFolder).toBe("book-1");
    expect(stageFolder).toBe("check_in");
    expect(uploaderFolder).toBe("user-9");
    expect(file).toMatch(/\.png$/);
  });

  it("never produces a public URL", () => {
    const path = evidencePath({
      bookingId: "b",
      stage: "check_out",
      uploaderId: "u",
      fileName: "x.jpg",
    });
    expect(path).not.toContain("http");
    expect(path).not.toContain("/public/");
  });
});

describe("booking inventory snapshot", () => {
  it("reads only from the booking snapshot, so My Stuff edits cannot change it", () => {
    // The live "My Stuff" inventory the renter keeps editing.
    const liveInventory = [{ label: "Boxes", quantity: 12, estimated_volume_m3: 1.2 }];
    // The booking copies it at creation time (server-side jsonb snapshot).
    const row = booking({ inventory_items_snapshot: JSON.parse(JSON.stringify(liveInventory)) });

    liveInventory[0] = { label: "Sofa", quantity: 1, estimated_volume_m3: 2 };
    liveInventory.push({ label: "Bike", quantity: 3, estimated_volume_m3: 0.9 });

    const items = bookingItems(row);
    expect(items).toHaveLength(1);
    expect(items[0]?.label).toBe("Boxes");
    expect(items[0]?.quantity).toBe(12);
  });
});

describe("Prompt 14 lifecycle is unchanged by evidence", () => {
  it("still needs both parties, in either order, to start storage", () => {
    const renterFirst = booking({ renter_handover_confirmed_at: "2026-08-02T09:00:00Z" });
    expect(lifecycleState(renterFirst, new Date("2026-08-02"))).toBe(
      "awaiting_handover_confirmation",
    );
    const hostFirst = booking({ host_handover_confirmed_at: "2026-08-02T09:00:00Z" });
    expect(lifecycleState(hostFirst, new Date("2026-08-02"))).toBe(
      "awaiting_handover_confirmation",
    );
    const both = booking({
      status: "active",
      activated_at: "2026-08-02T10:00:00Z",
      renter_handover_confirmed_at: "2026-08-02T09:00:00Z",
      host_handover_confirmed_at: "2026-08-02T10:00:00Z",
    });
    expect(handoverProgress(both, "handover").bothConfirmed).toBe(true);
    expect(lifecycleState(both, new Date("2026-08-10"))).toBe("active");
  });

  it("still needs both parties to complete a booking", () => {
    const renterOnly = booking({
      status: "active",
      renter_collection_confirmed_at: "2026-09-01T09:00:00Z",
    });
    expect(lifecycleState(renterOnly, new Date("2026-09-01"))).toBe(
      "awaiting_collection_confirmation",
    );
    const completed = booking({ status: "completed" });
    expect(lifecycleState(completed, new Date("2026-09-02"))).toBe("completed");
  });

  it("keeps a cancelled booking out of the handover flow entirely", () => {
    const cancelled = booking({ status: "cancelled" });
    expect(visibleStages(cancelled)).toEqual([]);
    expect(stageOpen("cancelled", "check_in")).toBe(false);
    expect(stageOpen("cancelled", "check_out")).toBe(false);
  });
});
