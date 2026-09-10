import { describe, expect, it } from "vitest";

import {
  buildCompositionPlan,
  validateComposition,
  OFFICIAL_LOCKUP_URL,
  OFFICIAL_WORDMARK_URL,
  type CompositionReceipt,
} from "./composition";

const plan = buildCompositionPlan({
  platform: "instagram",
  aspect: "9:16",
  width: 720,
  height: 1280,
  fps: 30,
  seconds: 10,
  tagline: "Make space earn.",
  cta: "Find space near you on EarnRoom.",
});

function receipt(overrides: Partial<CompositionReceipt> = {}): CompositionReceipt {
  return {
    planDigest: plan.digest,
    width: 720,
    height: 1280,
    fps: 30,
    seconds: 10,
    framesDrawn: 300,
    watermarkFrames: 210,
    taglineFrames: 210,
    ctaFrames: 90,
    endCardFrames: 90,
    artworkUrls: [OFFICIAL_LOCKUP_URL, OFFICIAL_WORDMARK_URL],
    audio: "copied",
    bytes: 2_400_000,
    ...overrides,
  };
}

describe("EarnRoom branding composition", () => {
  it("plans the approved artwork and the permanent tagline, never invented copy", () => {
    expect(plan.endCard.logoUrl).toBe(OFFICIAL_LOCKUP_URL);
    expect(plan.watermark?.url).toBe(OFFICIAL_WORDMARK_URL);
    expect(plan.persistentTagline?.text).toBe("Make space earn.");
    expect(plan.endCard.website).toBe("earnroom.co.uk");
  });

  it("honours TikTok's rules: no watermark and no burned-in web address", () => {
    const tiktok = buildCompositionPlan({
      platform: "tiktok",
      aspect: "9:16",
      width: 720,
      height: 1280,
      fps: 30,
      seconds: 10,
      tagline: "Make space earn.",
      cta: "Find storage when you need it.",
    });
    expect(tiktok.watermark).toBeNull();
    expect(tiktok.endCard.website).toBeNull();
    expect(tiktok.endCard.logoUrl).toBe(OFFICIAL_LOCKUP_URL);
  });

  it("accepts a film that really carried the logo and the tagline", () => {
    const verdict = validateComposition(plan, receipt());
    expect(verdict.passed).toBe(true);
    expect(verdict.failures).toEqual([]);
  });

  it("refuses a film with no closing lock-up", () => {
    const verdict = validateComposition(
      plan,
      receipt({ endCardFrames: 0, artworkUrls: [OFFICIAL_WORDMARK_URL] }),
    );
    expect(verdict.passed).toBe(false);
    expect(verdict.failures.join(" ")).toMatch(/lock-up/i);
  });

  it("refuses a film that never drew the persistent tagline or wordmark", () => {
    const verdict = validateComposition(plan, receipt({ taglineFrames: 0, watermarkFrames: 0 }));
    expect(verdict.passed).toBe(false);
    expect(verdict.failures.join(" ")).toMatch(/wordmark/i);
  });

  it("refuses artwork that is not the approved EarnRoom files", () => {
    const verdict = validateComposition(
      plan,
      receipt({ artworkUrls: [OFFICIAL_LOCKUP_URL, "https://example.com/fake-logo.png"] }),
    );
    expect(verdict.passed).toBe(false);
    expect(verdict.failures.join(" ")).toMatch(/not the approved/i);
  });

  it("refuses a file composed from a different plan or at the wrong size", () => {
    expect(validateComposition(plan, receipt({ planDigest: "deadbeef" })).passed).toBe(false);
    expect(validateComposition(plan, receipt({ width: 1080, height: 1920 })).passed).toBe(false);
  });
});
