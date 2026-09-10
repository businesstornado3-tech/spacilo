import { describe, expect, it } from "vitest";

import { buildVideoPrompt } from "./prompt";
import type { MarketingCampaign, PlatformAsset } from "./types";

const asset: PlatformAsset = {
  id: "ER-CAMP-2026-000001-A01-instagram",
  platform: "instagram",
  aspect: "9:16",
  hook: "Spare room sitting empty?",
  title: "Make space earn.",
  description: "EarnRoom connects people who need storage with people who have space to spare.",
  caption: "Make space earn.",
  hashtags: ["#earnroom"],
  cta: "Find storage when you need it.",
  seconds: 15,
  state: "PLANNED",
  videoUrl: null,
  thumbnailUrl: null,
  videoStatus: "NOT_REQUESTED",
};

const campaign = {
  id: "ER-CAMP-2026-000001",
  opportunity: {
    key: "portsmouth-storage",
    topic: "Storage in Portsmouth",
    problem: "No room for the pram in a small flat.",
    audience: "SMALL_HOME_OWNERS",
    objective: "RENTER_ACQUISITION",
    evidenceClass: "REAL_MARKET_DEMAND",
    location: { name: "Portsmouth" },
  },
  story: {
    scenes: [
      { seconds: 5, visual: "A cluttered hallway.", voiceover: "No room left.", caption: "No room" },
      { seconds: 10, visual: "A neighbour's empty garage.", voiceover: "Space nearby.", caption: "Space nearby" },
    ],
  },
} as unknown as MarketingCampaign;

describe("video prompt brand protection", () => {
  it("forbids the model from inventing any logo or brand mark", () => {
    const spec = buildVideoPrompt(campaign, asset);
    expect(spec.prompt).toContain(
      "Do not generate any logo, company logo, brand mark, watermark, or textual brand identity.",
    );
    expect(spec.prompt).toContain("applied separately by the deterministic post-production");
    expect(spec.prompt).toContain("Never write the word EarnRoom");
  });

  it("still carries the approved end-card wording for the deterministic layer", () => {
    const spec = buildVideoPrompt(campaign, asset);
    expect(spec.endCard.website).toBe("earnroom.co.uk");
    expect(spec.endCard.cta).toBe(asset.cta);
    expect(spec.endCard.tagline.length).toBeGreaterThan(0);
  });
});
