import { describe, expect, it } from "vitest";

import { PROVIDER_MAX_SEGMENT_SECONDS } from "./paid-presets";
import { buildStoryboard, validateStoryboard, shortLine, MAX_CAPTION_CHARS } from "./storyboard";
import type { MarketingCampaign, PlatformAsset } from "./types";

const asset: PlatformAsset = {
  id: "ER-CAMP-2026-000001-A01-instagram",
  platform: "instagram",
  aspect: "9:16",
  hook: "Your completion date moved. The boxes did not.",
  title: "Storage between moves",
  description: "EarnRoom connects people who need storage with people who have space to spare.",
  caption: "Space nearby",
  hashtags: ["#earnroom"],
  cta: "Find storage near you",
  seconds: 30,
  state: "GENERATED",
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
    hook: "Your completion date moved. The boxes did not.",
    renterCta: "Find storage near you",
    scenes: [
      { seconds: 5, visual: "A cluttered hallway.", voiceover: "No room left.", caption: "No room left" },
      { seconds: 5, visual: "A family beside boxes.", voiceover: "Nowhere to go.", caption: "Nowhere to put it" },
      { seconds: 10, visual: "A neighbour's empty garage.", voiceover: "Space nearby.", caption: "Space nearby" },
      { seconds: 10, visual: "The hallway clear again.", voiceover: "Room back.", caption: "Room back again" },
    ],
  },
} as unknown as MarketingCampaign;

const long = () => buildStoryboard({ campaign, asset, seconds: 30 });
const short = () => buildStoryboard({ campaign, asset, seconds: 10 });

describe("storyboard timing", () => {
  it("tells a full six-beat story across thirty seconds", () => {
    const board = long();
    expect(board.seconds).toBe(30);
    expect(board.beats.map((beat) => beat.role)).toEqual([
      "HOOK",
      "PERSON",
      "PROBLEM",
      "SOLUTION",
      "PAYOFF",
      "END_CARD",
    ]);
    expect(validateStoryboard(board, { seconds: 30 }).passed).toBe(true);
  });

  it("keeps the ten-second film to the essentials, still with an ending", () => {
    const board = short();
    expect(board.seconds).toBe(10);
    expect(board.beats.at(-1)?.role).toBe("END_CARD");
    expect(validateStoryboard(board, { seconds: 10 }).passed).toBe(true);
  });

  it("gives the closing EarnRoom card time to be read", () => {
    for (const board of [long(), short()]) {
      const end = board.beats.at(-1)!;
      expect(end.toSeconds - end.fromSeconds).toBeGreaterThanOrEqual(2.5);
      expect(board.endCardFromSeconds).toBeLessThan(board.seconds);
    }
  });

  it("runs the beats back to back and uses the whole film", () => {
    const board = long();
    let cursor = 0;
    for (const beat of board.beats) {
      expect(beat.fromSeconds).toBe(cursor);
      cursor = beat.toSeconds;
    }
    expect(cursor).toBe(30);
  });
});

describe("on-screen wording", () => {
  it("shows one line at a time, with a clear gap between them", () => {
    const captions = long().captions;
    expect(captions.length).toBeGreaterThan(2);
    captions.forEach((caption, index) => {
      const previous = captions[index - 1];
      if (previous) expect(caption.fromSeconds).toBeGreaterThanOrEqual(previous.toSeconds);
      expect(caption.toSeconds).toBeGreaterThan(caption.fromSeconds);
    });
  });

  it("never repeats a line and never runs one into the end card", () => {
    const board = long();
    const seen = new Set(board.captions.map((caption) => caption.text.toLowerCase()));
    expect(seen.size).toBe(board.captions.length);
    for (const caption of board.captions) {
      expect(caption.toSeconds).toBeLessThanOrEqual(board.endCardFromSeconds);
      expect(caption.text.length).toBeLessThanOrEqual(MAX_CAPTION_CHARS);
    }
  });

  it("trims a long line on a word boundary rather than mid-word", () => {
    const line = shortLine("Find affordable, insured, flexible storage space near you this weekend");
    expect(line.length).toBeLessThanOrEqual(MAX_CAPTION_CHARS);
    expect(line.endsWith(" ")).toBe(false);
  });

  it("catches a storyboard whose lines would overlap", () => {
    const board = long();
    const broken = {
      ...board,
      captions: [
        { text: "One", fromSeconds: 1, toSeconds: 8 },
        { text: "Two", fromSeconds: 5, toSeconds: 12 },
      ],
    };
    expect(validateStoryboard(broken, { seconds: 30 }).failures.join(" ")).toMatch(
      /still on screen/i,
    );
  });
});

describe("generation parts", () => {
  it("splits the film into parts the service will actually film", () => {
    const board = long();
    expect(board.segments.length).toBe(3);
    for (const segment of board.segments) {
      expect(segment.seconds).toBeLessThanOrEqual(PROVIDER_MAX_SEGMENT_SECONDS);
    }
    expect(board.segments.reduce((sum, segment) => sum + segment.seconds, 0)).toBe(30);
  });

  it("asks later parts to continue the same scene, not start a new film", () => {
    const board = long();
    expect(board.segments[0]!.prompt).toContain("Part 1 of 3");
    expect(board.segments[1]!.prompt).toContain("continues");
    expect(board.segments[2]!.prompt).toMatch(/do not restart the story/i);
  });

  it("forbids the model from drawing text or any EarnRoom mark", () => {
    for (const segment of long().segments) {
      expect(segment.prompt).toMatch(/Do not render any text/);
      expect(segment.prompt).toMatch(/Never invent a company, brand, logo or website/);
    }
    expect(validateStoryboard(long(), { seconds: 30 }).passed).toBe(true);
  });
});
