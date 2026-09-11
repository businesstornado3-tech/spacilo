import { describe, expect, it } from "vitest";

import {
  buildCompositionPlan,
  validateComposition,
  validateCompositionPlan,
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

describe("timed on-screen wording", () => {
  const withCaptions = (
    captions: { text: string; fromSeconds: number; toSeconds: number }[],
    seconds = 30,
  ) =>
    buildCompositionPlan({
      platform: "instagram",
      aspect: "9:16",
      width: 720,
      height: 1280,
      fps: 30,
      seconds,
      tagline: "Make space earn.",
      cta: "Find space near you on EarnRoom.",
      captions,
    });

  it("keeps captions in order and never lets two share the screen", () => {
    const built = withCaptions([
      { text: "The move completes Friday", fromSeconds: 0.5, toSeconds: 4 },
      { text: "Nowhere to put any of it", fromSeconds: 5, toSeconds: 9 },
    ]);
    expect(built.captions).toHaveLength(2);
    expect(validateCompositionPlan(built).passed).toBe(true);
  });

  it("drops a caption that would appear on top of the one before it", () => {
    const built = withCaptions([
      { text: "The move completes Friday", fromSeconds: 0.5, toSeconds: 6 },
      { text: "Nowhere to put any of it", fromSeconds: 4, toSeconds: 9 },
    ]);
    expect(built.captions.map((cue) => cue.text)).toEqual(["The move completes Friday"]);
  });

  it("never lets wording run into the EarnRoom card", () => {
    const built = withCaptions([
      { text: "Book only the weeks you need", fromSeconds: 24, toSeconds: 30 },
    ]);
    for (const cue of built.captions) {
      expect(cue.toSeconds).toBeLessThanOrEqual(built.endCard.fromSeconds);
    }
    expect(validateCompositionPlan(built).passed).toBe(true);
  });

  it("rejects repeated or unreadably long wording", () => {
    const repeated = {
      ...withCaptions([]),
      captions: [
        { text: "Same line", fromSeconds: 0, toSeconds: 3 },
        { text: "Same line", fromSeconds: 4, toSeconds: 7 },
      ],
    };
    expect(validateCompositionPlan(repeated).failures.join(" ")).toMatch(/repeats/i);
    const long = {
      ...withCaptions([]),
      captions: [{ text: "x".repeat(80), fromSeconds: 0, toSeconds: 3 }],
    };
    expect(validateCompositionPlan(long).failures.join(" ")).toMatch(/too long/i);
  });

  it("holds the closing EarnRoom card long enough to read", () => {
    const built = withCaptions([]);
    expect(built.seconds - built.endCard.fromSeconds).toBeGreaterThanOrEqual(2.5);
  });
});
