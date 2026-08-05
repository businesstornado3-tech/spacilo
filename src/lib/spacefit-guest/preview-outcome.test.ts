/**
 * Guest host-scan outcome contract.
 *
 * A scan that produces no usable dimensions must be an explicit, non-failing
 * state — never a crash and never a silent blank result.
 */
import { describe, expect, it } from "vitest";

import {
  GUEST_SPACE_OUTCOME_COPY,
  guestProposalFromScan,
  spaceMeasurementOutcome,
} from "@/lib/spacefit-guest/preview";

describe("guestProposalFromScan", () => {
  it("survives a missing scan payload", () => {
    const proposal = guestProposalFromScan(undefined, "garage");
    expect(proposal.widthM).toBeNull();
    expect(proposal.obstacles).toEqual([]);
    expect(proposal.spaceType).toBe("garage");
    expect(proposal.confidence).toBe("low");
  });

  it("rejects non-positive dimensions", () => {
    const proposal = guestProposalFromScan(
      { estimated_width_m: 0, estimated_depth_m: 4, estimated_usable_height_m: null } as never,
      null,
    );
    expect(proposal.widthM).toBeNull();
    expect(proposal.depthM).toBe(4);
  });
});

describe("spaceMeasurementOutcome", () => {
  const base = {
    confidence: "low" as const,
    referenceUsed: null,
    obstacles: [],
    limitations: [],
    notes: null,
    spaceType: null,
  };

  it("reports insufficient information when nothing was measured", () => {
    expect(spaceMeasurementOutcome(null)).toBe("insufficient_information");
    expect(
      spaceMeasurementOutcome({ ...base, widthM: null, depthM: null, usableHeightM: null }),
    ).toBe("insufficient_information");
  });

  it("reports partial when some dimensions are missing", () => {
    expect(spaceMeasurementOutcome({ ...base, widthM: 3, depthM: null, usableHeightM: 2 })).toBe(
      "partial",
    );
  });

  it("reports measured only when all three are present", () => {
    expect(spaceMeasurementOutcome({ ...base, widthM: 3, depthM: 5, usableHeightM: 2.2 })).toBe(
      "measured",
    );
  });

  it("has user-facing copy for every outcome", () => {
    for (const outcome of ["measured", "partial", "insufficient_information"] as const) {
      expect(GUEST_SPACE_OUTCOME_COPY[outcome].title.length).toBeGreaterThan(0);
      expect(GUEST_SPACE_OUTCOME_COPY[outcome].body.length).toBeGreaterThan(0);
    }
  });
});
