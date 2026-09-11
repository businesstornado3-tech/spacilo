import { describe, expect, it } from "vitest";

import { PROVIDER_MAX_SEGMENT_SECONDS } from "./paid-presets";
import { PROHIBITION_LINE, findBrandTerms } from "./prompt-safety";
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
      {
        seconds: 5,
        visual: "A cluttered hallway.",
        voiceover: "No room left.",
        caption: "No room left",
      },
      {
        seconds: 5,
        visual: "A family beside boxes.",
        voiceover: "Nowhere to go.",
        caption: "Nowhere to put it",
      },
      {
        seconds: 10,
        visual: "A neighbour's empty garage.",
        voiceover: "Space nearby.",
        caption: "Space nearby",
      },
      {
        seconds: 10,
        visual: "The hallway clear again.",
        voiceover: "Room back.",
        caption: "Room back again",
      },
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
    const line = shortLine(
      "Find affordable, insured, flexible storage space near you this weekend",
    );
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

  it("asks later stretches to continue the same take, not start a new film", () => {
    const board = long();
    expect(board.segments[0]!.prompt).toMatch(/one single continuous/i);
    expect(board.segments[1]!.prompt).toMatch(/carry straight on/i);
    expect(board.segments[2]!.prompt).toMatch(/do not restart/i);
    expect(board.segments[2]!.prompt).toMatch(/the same person, the same face/i);
  });

  it("never tells the service it is filming a numbered part", () => {
    for (const segment of long().segments) {
      expect(segment.prompt).not.toMatch(/\bpart\s*\d/i);
      expect(segment.prompt).not.toMatch(/\bsegment\s*\d/i);
    }
  });

  it("shows the written story on screen and claims no spoken voice", () => {
    const board = long();
    expect(board.narration.length).toBeGreaterThan(0);
    expect(board.narrationCapability.spoken).toBe(false);
    board.narration.forEach((cue, index) => {
      expect(board.captions[index]!.text).toBe(cue.text);
      expect(board.captions[index]!.fromSeconds).toBe(cue.fromSeconds);
    });
  });

  it("leaves every line on screen long enough to read", () => {
    for (const caption of long().captions) {
      const words = caption.text.split(" ").filter(Boolean).length;
      expect(caption.toSeconds - caption.fromSeconds).toBeGreaterThanOrEqual(words / 2.4 - 0.01);
    }
  });

  it("forbids the model from drawing anything written", () => {
    for (const segment of long().segments) {
      expect(segment.prompt).toContain(PROHIBITION_LINE);
    }
    expect(validateStoryboard(long(), { seconds: 30 }).passed).toBe(true);
  });

  it("sends no brand identity to the generation service, in any part", () => {
    for (const segment of long().segments) {
      expect(findBrandTerms(segment.prompt)).toEqual([]);
      expect(segment.prompt.toLowerCase()).not.toContain("earnroom");
      expect(segment.prompt.toLowerCase()).not.toContain("make space earn");
      expect(segment.prompt.toLowerCase()).not.toContain(".co.uk");
    }
  });

  it("strips branding that campaign copy tries to bring into a scene", () => {
    const branded = {
      ...campaign,
      opportunity: {
        ...campaign.opportunity,
        problem: "EarnRoom helps when there is no room — make space earn at earnroom.co.uk.",
      },
      story: {
        ...campaign.story,
        scenes: campaign.story.scenes.map((scene) => ({
          ...scene,
          visual: `${scene.visual} The EarnRoom logo appears on the wall.`,
        })),
      },
    } as unknown as MarketingCampaign;

    const board = buildStoryboard({ campaign: branded, asset, seconds: 30 });
    for (const segment of board.segments) {
      expect(findBrandTerms(segment.prompt)).toEqual([]);
    }
    expect(validateStoryboard(board, { seconds: 30 }).passed).toBe(true);
  });

  it("refuses a part that still carries branding", () => {
    const board = long();
    const tampered = {
      ...board,
      segments: board.segments.map((segment, index) =>
        index === 1
          ? { ...segment, prompt: `${segment.prompt}\nShow the EarnRoom logo.` }
          : segment,
      ),
    };
    const verdict = validateStoryboard(tampered, { seconds: 30 });
    expect(verdict.passed).toBe(false);
    expect(verdict.failures.join(" ").toLowerCase()).toContain("mentions");
  });
});
