/**
 * Signed-in SpaceFit hub state (`spacefit-hub-v1`).
 *
 * Guards two properties the product depends on: the derivation is deterministic
 * and purely local (no AI, no network), and an AI proposal is never surfaced as
 * a verified measurement.
 */
import { describe, expect, it } from "vitest";

import {
  HOST_MEASUREMENT_LABEL,
  hostMeasurementStatus,
  hostSpaceFitState,
  isVerifiedMeasurement,
  renterSpaceFitState,
  summariseHostSpace,
  type HostSpaceLike,
} from "@/lib/spacefit-hub";
import type { InventoryItem } from "@/lib/inventory-model";

function item(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: "item-1",
    inventory_id: "inv-1",
    user_id: "user-1",
    catalogue_key: null,
    label: "Cardboard box",
    category: "boxes",
    quantity: 2,
    length_cm: 50,
    width_cm: 40,
    height_cm: 40,
    stackable: "yes",
    fragile: false,
    orientation_flexible: "yes",
    notes: null,
    source: "manual",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  } as InventoryItem;
}

function space(overrides: Partial<HostSpaceLike> = {}): HostSpaceLike {
  return {
    id: "space-1",
    title: "Dry garage",
    space_type: "garage",
    listing_status: "draft",
    measurement_source: "ai_estimated",
    measurements_verified_at: null,
    estimated_available_volume_m3: 18,
    ...overrides,
  };
}

describe("renterSpaceFitState", () => {
  it("reports an explicit empty state rather than a blank card", () => {
    expect(renterSpaceFitState(null)).toEqual({ state: "empty" });
    expect(renterSpaceFitState([])).toEqual({ state: "empty" });
  });

  it("derives the requirement from confirmed items only", () => {
    const state = renterSpaceFitState([item()]);
    expect(state.state).toBe("ready");
    if (state.state !== "ready") return;
    expect(state.itemCount).toBe(2);
    expect(state.itemVolumeM3).toBeGreaterThan(0);
  });

  it("always recommends at least the raw volume of the belongings", () => {
    const state = renterSpaceFitState([item(), item({ id: "item-2", label: "Sofa", quantity: 1 })]);
    if (state.state !== "ready") throw new Error("expected ready");
    expect(state.requirementM3).toBeGreaterThanOrEqual(state.itemVolumeM3);
  });

  it("is deterministic for the same input", () => {
    const items = [item(), item({ id: "item-2" })];
    expect(renterSpaceFitState(items)).toEqual(renterSpaceFitState(items));
  });
});

describe("hostMeasurementStatus", () => {
  it("treats an AI proposal as unconfirmed", () => {
    const status = hostMeasurementStatus(space());
    expect(status).toBe("ai_estimate");
    expect(isVerifiedMeasurement(space())).toBe(false);
    expect(HOST_MEASUREMENT_LABEL[status]).toMatch(/confirmation/i);
  });

  it("only counts an explicitly confirmed measurement as verified", () => {
    expect(
      isVerifiedMeasurement(
        space({ measurement_source: "host_verified", measurements_verified_at: null }),
      ),
    ).toBe(false);
    expect(
      isVerifiedMeasurement(
        space({
          measurement_source: "host_verified",
          measurements_verified_at: new Date().toISOString(),
        }),
      ),
    ).toBe(true);
  });

  it("reports an unmeasured space as unmeasured", () => {
    expect(
      hostMeasurementStatus(
        space({ measurement_source: null, estimated_available_volume_m3: null }),
      ),
    ).toBe("unmeasured");
  });
});

describe("hostSpaceFitState", () => {
  it("reports no spaces explicitly", () => {
    expect(hostSpaceFitState([])).toEqual({ state: "none" });
    expect(hostSpaceFitState(null)).toEqual({ state: "none" });
  });

  it("features a verified published space over a proposal", () => {
    const state = hostSpaceFitState([
      space({ id: "proposal" }),
      space({
        id: "verified",
        listing_status: "published",
        measurement_source: "host_verified",
        measurements_verified_at: new Date().toISOString(),
      }),
    ]);
    expect(state.state).toBe("verified");
    if (state.state === "none") return;
    expect(state.featured.space.id).toBe("verified");
    expect(state.spaceCount).toBe(2);
  });

  it("labels a proposal-only host as a proposal", () => {
    const state = hostSpaceFitState([space()]);
    expect(state.state).toBe("proposal");
  });

  it("gives pricing guidance from the shared deterministic engine", () => {
    const summary = summariseHostSpace(space());
    expect(summary.price.monthlyPricePence).toBeGreaterThan(0);
    expect(summariseHostSpace(space())).toEqual(summary);
  });

  it("gives no usable volume for an unmeasured space", () => {
    expect(summariseHostSpace(space({ estimated_available_volume_m3: null })).usableVolumeM3).toBe(
      null,
    );
  });
});
