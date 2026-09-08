import { beforeEach, describe, expect, it } from "vitest";

import { registerChannel, resetChannels, getChannel } from "./channels";
import { resetGrowthConfig } from "./config";
import { evaluateOutreachEligibility, type OutreachEligibilityInput } from "./eligibility";

function input(overrides: Partial<OutreachEligibilityInput> = {}): OutreachEligibilityInput {
  return {
    recipient: "rcp_1",
    channel: "email",
    sourceTermsPermitOutreach: true,
    sourceTermsReviewed: true,
    contactMechanismPermitsOutreach: true,
    consent: "granted",
    suppressed: false,
    hoursSinceLastContact: null,
    duplicateFingerprint: false,
    ...overrides,
  };
}

function authoriseEmail() {
  const existing = getChannel("email");
  if (!existing) throw new Error("email channel missing");
  registerChannel({
    ...existing,
    enabled: true,
    deliveryMode: "live",
    credentialState: "verified",
    termsStatus: "authorised",
  });
}

describe("outreach eligibility gate", () => {
  beforeEach(() => {
    resetGrowthConfig();
    resetChannels();
  });

  it("is ELIGIBLE only when every deterministic condition holds", () => {
    authoriseEmail();
    const result = evaluateOutreachEligibility(input());
    expect(result.verdict).toBe("ELIGIBLE");
    expect(result.mayContact).toBe(true);
  });

  it("treats suppression as absolute", () => {
    authoriseEmail();
    expect(evaluateOutreachEligibility(input({ suppressed: true })).verdict).toBe("DO_NOT_CONTACT");
  });

  it("refuses when the source's terms do not permit outreach", () => {
    authoriseEmail();
    expect(evaluateOutreachEligibility(input({ sourceTermsPermitOutreach: false })).verdict).toBe(
      "SOURCE_RESTRICTED",
    );
  });

  it("refuses when the contact route does not allow the message", () => {
    authoriseEmail();
    expect(
      evaluateOutreachEligibility(input({ contactMechanismPermitsOutreach: false })).verdict,
    ).toBe("CONTACT_NOT_PERMITTED");
  });

  it("catches duplicates and repeat contact", () => {
    authoriseEmail();
    expect(evaluateOutreachEligibility(input({ duplicateFingerprint: true })).verdict).toBe(
      "DUPLICATE",
    );
    expect(evaluateOutreachEligibility(input({ hoursSinceLastContact: 2 })).verdict).toBe(
      "ALREADY_CONTACTED",
    );
  });

  it("asks for review when the source terms have not been checked by a person", () => {
    authoriseEmail();
    expect(evaluateOutreachEligibility(input({ sourceTermsReviewed: false })).verdict).toBe(
      "REQUIRES_REVIEW",
    );
  });

  it("refuses an unauthorised channel even with perfect inputs", () => {
    // Default email channel is disabled and unverified.
    expect(evaluateOutreachEligibility(input()).verdict).toBe("NOT_ELIGIBLE");
  });

  it("never lets an AI recommendation override the gate", () => {
    const blocked = evaluateOutreachEligibility(
      input({ suppressed: true, aiRecommendation: "CONTACT" }),
    );
    expect(blocked.verdict).toBe("DO_NOT_CONTACT");
    expect(blocked.mayContact).toBe(false);
    expect(blocked.aiRecommendation).toBe("CONTACT");

    authoriseEmail();
    const allowed = evaluateOutreachEligibility(input({ aiRecommendation: "DO_NOT_CONTACT" }));
    expect(allowed.verdict).toBe("ELIGIBLE");
  });
});
