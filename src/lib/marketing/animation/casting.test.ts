import { describe, expect, it } from "vitest";

import {
  castingFor,
  castingWithDiversity,
  lookFor,
  seedFrom,
  signatureDigest,
  similarity,
  visualSignature,
  TOO_SIMILAR,
  type Casting,
  type VisualSignatureInput,
} from "./casting";
import { buildAnimatedPlan } from "./plan";
import type { CampaignStory, PlatformAsset } from "../types";

/** Five genuinely different campaigns, in the shape the intelligence produces. */
const CAMPAIGNS: { id: string; story: CampaignStory }[] = [
  {
    id: "camp-move",
    story: story(
      "Your completion date moved and the keys go back on Friday.",
      [
        "A family stands beside boxes in an empty house",
        "A neighbour's garage sitting empty",
        "Boxes stored, handover complete",
      ],
      "Find storage near you",
    ),
  },
  {
    id: "camp-student",
    story: story(
      "Term ends and the halls close on Saturday.",
      [
        "A student packs a room at the end of term",
        "A spare room five minutes from campus",
        "Everything stored until September",
      ],
      "Find student storage",
    ),
  },
  {
    id: "camp-host-garage",
    story: story(
      "Your garage has not held a car for years.",
      [
        "A garage full of nothing in particular",
        "The same garage, cleared and measured",
        "The space earning every month",
      ],
      "List your space",
    ),
  },
  {
    id: "camp-renovation",
    story: story(
      "The builders start on Monday and the furniture is in the way.",
      [
        "A living room mid-renovation",
        "Furniture wrapped and loaded",
        "A finished room, everything back",
      ],
      "Find storage near you",
    ),
  },
  {
    id: "camp-business",
    story: story(
      "Your stock is taking over the spare room again.",
      [
        "Boxes of stock stacked against a wall",
        "A nearby unit with room to spare",
        "Orders going out on time",
      ],
      "Find storage near you",
    ),
  },
];

function story(hook: string, visuals: string[], cta: string): CampaignStory {
  return {
    format: "PROBLEM_SOLUTION",
    hook,
    scenes: visuals.map((visual, index) => ({
      index,
      visual,
      voiceover: visual,
      caption: visual,
      seconds: 4,
    })),
    renterCta: cta,
    hostCta: "List your space",
    illustrative: true,
    seconds: 12,
  };
}

function asset(id: string): PlatformAsset {
  return {
    id: `asset-${id}`,
    platform: "instagram",
    aspect: "9:16",
    hook: "Storage between dates",
    title: "Storage between dates",
    description: "What to do when the dates do not line up.",
    caption: "Spare space near you",
    hashtags: ["#storage"],
    cta: "Find storage near you",
    seconds: 30,
    state: "GENERATED",
    videoUrl: null,
    thumbnailUrl: null,
    videoStatus: "NOT_REQUESTED",
  };
}

describe("casting", () => {
  it("gives the same campaign the same look every single time", () => {
    const first = castingFor({
      campaignId: "camp-move",
      storyType: "MOVING_HOUSE",
      characters: ["RENTER_CHARACTER_01"],
      side: "renter",
    });
    const second = castingFor({
      campaignId: "camp-move",
      storyType: "MOVING_HOUSE",
      characters: ["RENTER_CHARACTER_01"],
      side: "renter",
    });
    expect(second).toEqual(first);
  });

  it("gives different campaigns different people, grades and openings", () => {
    const looks = CAMPAIGNS.map(
      (campaign) =>
        castingFor({
          campaignId: campaign.id,
          storyType: "MOVING_HOUSE",
          characters: ["RENTER_CHARACTER_01"],
          side: "renter",
        }).looks["RENTER_CHARACTER_01"]!,
    );
    expect(new Set(looks.map((look) => `${look.top}${look.hair}${look.skin}`)).size).toBeGreaterThan(
      1,
    );
  });

  it("keeps one person consistent across a whole film", () => {
    const casting = castingFor({
      campaignId: "camp-move",
      storyType: "MOVING_HOUSE",
      characters: ["RENTER_CHARACTER_01", "HOST_CHARACTER_01"],
      side: "both",
    });
    const look = casting.looks["RENTER_CHARACTER_01"]!;
    expect(look).toEqual(lookFor("RENTER_CHARACTER_01", casting.seed, 1));
    expect(casting.looks["HOST_CHARACTER_01"]).not.toEqual(look);
  });

  it("only ever picks an opening that suits the side of the marketplace", () => {
    const host = castingFor({
      campaignId: "camp-host-garage",
      storyType: "HOST_UNUSED_SPACE",
      characters: ["HOST_CHARACTER_01"],
      side: "host",
    });
    expect(["garageReveal", "emptyRoomReveal", "shelvesReveal", "phoneCheck"]).toContain(
      host.opening,
    );
  });

  it("recognises when two films would look like the same film", () => {
    const base = {
      storyType: "MOVING_HOUSE",
      side: "renter",
      opening: "boxesBlockingDoor",
      cameraStyle: "push",
      paletteName: "morning",
      environments: ["EMPTY_ROOM"],
      props: ["box"],
      looks: { a: { top: "#111111", hair: "#222222", skin: "#333333" } },
      shots: ["slowPush"],
    };
    const same = visualSignature(base);
    expect(similarity(same, visualSignature(base))).toBe(1);
    expect(
      similarity(same, visualSignature({ ...base, paletteName: "cool", storyType: "DOWNSIZING" })),
    ).toBeLessThan(TOO_SIMILAR);
    expect(signatureDigest(same)).toHaveLength(8);
    expect(seedFrom("a")).not.toBe(seedFrom("b"));
  });

  it("casts a campaign differently when it would repeat a recent film", () => {
    const first = castingWithDiversity({
      campaignId: "camp-move",
      storyType: "MOVING_HOUSE",
      characters: ["RENTER_CHARACTER_01"],
      side: "renter",
      describe: (casting) => describeFor(casting),
    });
    const again = castingWithDiversity({
      campaignId: "camp-move",
      storyType: "MOVING_HOUSE",
      characters: ["RENTER_CHARACTER_01"],
      side: "renter",
      recentSignatures: [first.signature],
      describe: (casting) => describeFor(casting),
    });
    expect(again.casting.variant).toBeGreaterThan(0);
    expect(similarity(again.signature, first.signature)).toBeLessThan(TOO_SIMILAR);
  });
});

function describeFor(casting: Casting): VisualSignatureInput {
  return {
    storyType: "MOVING_HOUSE",
    side: "renter",
    opening: casting.opening,
    cameraStyle: casting.cameraStyle,
    paletteName: casting.paletteName,
    environments: ["EMPTY_ROOM"],
    props: ["box"],
    looks: casting.looks,
    shots: ["slowPush", "reveal"],
  };
}

describe("five real campaigns produce five different films", () => {
  const plans = CAMPAIGNS.map((campaign) =>
    buildAnimatedPlan({
      campaignId: campaign.id,
      asset: asset(campaign.id),
      story: campaign.story,
      topic: campaign.story.hook,
    }),
  );

  it("never repeats a whole film", () => {
    expect(new Set(plans.map((plan) => plan.signature)).size).toBe(plans.length);
    for (const plan of plans) {
      for (const other of plans) {
        if (plan === other) continue;
        expect(similarity(plan.signature, other.signature)).toBeLessThan(TOO_SIMILAR);
      }
    }
  });

  it("opens each film on its own moment", () => {
    for (const plan of plans) expect(plan.scenes[0]!.items.length).toBeGreaterThan(0);
    expect(new Set(plans.map((plan) => plan.casting.opening)).size).toBeGreaterThan(1);
  });

  it("varies the grade and the soundtrack key between campaigns", () => {
    expect(new Set(plans.map((plan) => plan.casting.paletteName)).size).toBeGreaterThan(1);
    expect(new Set(plans.map((plan) => plan.audio.music[0]?.root)).size).toBeGreaterThan(1);
  });

  it("still regenerates the very same film for the very same campaign", () => {
    const repeat = buildAnimatedPlan({
      campaignId: CAMPAIGNS[0]!.id,
      asset: asset(CAMPAIGNS[0]!.id),
      story: CAMPAIGNS[0]!.story,
      topic: CAMPAIGNS[0]!.story.hook,
    });
    expect(repeat.digest).toBe(plans[0]!.digest);
    expect(repeat.signature).toBe(plans[0]!.signature);
  });

  it("keeps every campaign's own words and branding", () => {
    for (const [index, plan] of plans.entries()) {
      const campaign = CAMPAIGNS[index]!;
      expect(plan.campaignId).toBe(campaign.id);
      expect(plan.assetId).toBe(`asset-${campaign.id}`);
      expect(campaign.story.hook.startsWith(plan.scenes[0]!.caption.text)).toBe(true);
      expect(plan.brand.tagline.length).toBeGreaterThan(0);
    }
  });
});
