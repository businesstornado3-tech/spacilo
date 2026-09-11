import { describe, expect, it } from "vitest";

import {
  containsUnsupportedClaim,
  linkedinCopy,
  pinterestCopy,
  tiktokCopy,
  type CampaignCopySource,
} from "./platform-copy";

const source: CampaignCopySource = {
  hook: "Spare room sitting empty?",
  title: "Make space earn.",
  description: "EarnRoom connects people who need storage with neighbours who have space spare.",
  cta: "See spaces near you.",
  hashtags: ["#earnroom", "#StorageUK"],
};

describe("platform-native copy", () => {
  it("writes a different, longer post for LinkedIn than for TikTok", () => {
    const linkedin = linkedinCopy(source);
    const tiktok = tiktokCopy(source);
    expect(linkedin.body).not.toEqual(tiktok.body);
    expect(linkedin.body.length).toBeGreaterThan(tiktok.body.length);
  });

  it("keeps every platform within its own length limit", () => {
    const long = { ...source, description: "word ".repeat(2000), title: "t".repeat(400) };
    expect(pinterestCopy(long).title.length).toBeLessThanOrEqual(100);
    expect(pinterestCopy(long).body.length).toBeLessThanOrEqual(800);
    expect(tiktokCopy(long).title.length).toBeLessThanOrEqual(150);
    expect(linkedinCopy(long).body.length).toBeLessThanOrEqual(2800);
  });

  it("links only to EarnRoom's real site", () => {
    expect(pinterestCopy(source).link).toBe("https://earnroom.co.uk");
  });

  it("drops an invented statistic or earnings promise instead of publishing it", () => {
    const dishonest = {
      ...source,
      description: "Trusted by thousands of hosts. Guaranteed earnings of £300 a month.",
    };
    const body = linkedinCopy(dishonest).body;
    expect(body).not.toMatch(/thousands/i);
    expect(body).not.toMatch(/guaranteed/i);
    expect(containsUnsupportedClaim("Rated 5 by 400 customers")).toBe(true);
    expect(containsUnsupportedClaim("Storage space near you.")).toBe(false);
  });
});
