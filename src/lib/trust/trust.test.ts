/**
 * Prompt 23 — booking confidence, trust UX and listing quality.
 *
 * These tests defend the core principle: FACTS, NOT MARKETING CLAIMS, and
 * DETERMINISTIC RESULTS, NOT AI OPINIONS.
 */
import { describe, expect, it } from "vitest";

import {
  buildTrustSummary,
  containsForbiddenClaim,
  dimensionsSignal,
  historySignal,
  TRUST_DISCLAIMER,
  type TrustSpaceInput,
} from "@/lib/trust/signals";
import { listingQuality } from "@/lib/trust/quality";
import {
  commitmentCopy,
  journeySteps,
  nextStepCopy,
  stageFromStatus,
} from "@/lib/trust/journey";

const measuredSpace: TrustSpaceInput = {
  length_m: 3,
  width_m: 2,
  height_m: 2.4,
  photo_paths: ["a", "b", "c"],
  host_phone_verified: true,
  access_type: "independent",
  features: ["lockable", "indoor"],
  estimated_available_volume_m3: 9.2,
};

describe("trust signals", () => {
  it("never states a measurement is confirmed unless a human confirmed it", () => {
    expect(dimensionsSignal(measuredSpace).tone).toBe("declared");
    expect(
      dimensionsSignal({ ...measuredSpace, measurements_verified_at: "2026-01-01" }).tone,
    ).toBe("verified");
    expect(dimensionsSignal({ ...measuredSpace, measurement_source: "spacefit_ai" }).tone).toBe(
      "estimated",
    );
  });

  it("reports missing measurements as absent rather than softening them", () => {
    const signal = dimensionsSignal({});
    expect(signal.tone).toBe("absent");
    expect(signal.label).toMatch(/not provided/i);
  });

  it("treats a new listing as new, not as a negative", () => {
    const signal = historySignal({ completed_bookings: 0, review_count: 0 });
    expect(signal.tone).toBe("absent");
    expect(signal.detail).toMatch(/isn't a mark against/i);
  });

  it("only reports a rating when reviews exist", () => {
    expect(historySignal({ completed_bookings: 3, review_count: 0 }).label).toMatch(
      /3 completed bookings/,
    );
    expect(historySignal({ completed_bookings: 3, review_count: 2, average_rating: 4.5 }).label)
      .toMatch(/2 reviews/);
  });

  it("separates facts from gaps", () => {
    const summary = buildTrustSummary({ ...measuredSpace, photo_paths: [] }, null);
    expect(summary.gaps.some((signal) => signal.key === "photos")).toBe(true);
    expect(summary.signals.some((signal) => signal.key === "photos")).toBe(false);
    expect(summary.isNewListing).toBe(true);
  });

  it("is deterministic for identical input", () => {
    expect(JSON.stringify(buildTrustSummary(measuredSpace, { completed_bookings: 1 }))).toBe(
      JSON.stringify(buildTrustSummary(measuredSpace, { completed_bookings: 1 })),
    );
  });

  it("contains no forbidden marketing claims anywhere in the output", () => {
    const summary = buildTrustSummary(measuredSpace, { completed_bookings: 2, review_count: 1, average_rating: 5 });
    const text = [TRUST_DISCLAIMER, summary.headline, ...summary.signals.flatMap((s) => [s.label, s.detail])].join(" ");
    expect(containsForbiddenClaim(text)).toBe(false);
  });

  it("flags forbidden claims when they appear", () => {
    expect(containsForbiddenClaim("This space is 100% safe")).toBe(true);
    expect(containsForbiddenClaim("Fully insured storage")).toBe(true);
  });
});

describe("listing quality", () => {
  const complete = {
    ...measuredSpace,
    monthly_price_pence: 5000,
    description: "x".repeat(120),
    moisture_condition: "dry",
    temperature_condition: "unheated",
    suitability_confirmed: true,
    declarations_complete: true,
    accepted_categories: ["furniture"],
    minimum_stay_days: 30,
    measurements_verified_at: "2026-01-01",
  };

  it("reports ready only when every essential is present", () => {
    expect(listingQuality(complete).readyToPublish).toBe(true);
    expect(listingQuality({ ...complete, monthly_price_pence: null }).readyToPublish).toBe(false);
  });

  it("never produces a score or grade, only counts", () => {
    const report = listingQuality(complete);
    expect(report.completedEssentials).toBe(report.totalEssentials);
    expect(report).not.toHaveProperty("score");
  });

  it("gives an actionable next step when something is missing", () => {
    const report = listingQuality({ ...complete, photo_paths: ["only-one"] });
    expect(report.nextAction?.key).toBe("photos");
    expect(report.nextAction?.action.length).toBeGreaterThan(10);
  });

  it("requires confirmed suitability and declarations", () => {
    const report = listingQuality({ ...complete, suitability_confirmed: false, declarations_complete: false });
    expect(report.essentialMissing.map((c) => c.key)).toEqual(
      expect.arrayContaining(["suitability", "declarations"]),
    );
  });
});

describe("booking journey", () => {
  it("maps authoritative statuses onto stages", () => {
    expect(stageFromStatus("pending")).toBe("requested");
    expect(stageFromStatus("accepted")).toBe("accepted");
    expect(stageFromStatus("awaiting_payment")).toBe("booked");
    expect(stageFromStatus("confirmed")).toBe("paid");
    expect(stageFromStatus("completed")).toBe("finished");
    expect(stageFromStatus("something-new")).toBe("browsing");
  });

  it("marks exactly one current step", () => {
    const steps = journeySteps("booked");
    expect(steps.filter((step) => step.current)).toHaveLength(1);
    expect(steps.filter((step) => step.done)).toHaveLength(3);
  });

  it("is explicit that nothing is charged before payment", () => {
    expect(commitmentCopy("requested")).toMatch(/no money has been taken/i);
    expect(commitmentCopy("booked")).toMatch(/nothing has been charged/i);
    expect(commitmentCopy("paid")).toMatch(/cancellation terms/i);
  });

  it("always answers what happens next", () => {
    expect(nextStepCopy("browsing")).toMatch(/Send a request/);
    expect(nextStepCopy("finished")).toMatch(/finished/i);
  });

  it("identifies the single step where money moves", () => {
    expect(journeySteps("browsing").filter((step) => step.payment)).toHaveLength(1);
  });
});
