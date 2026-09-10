/**
 * Human storytelling engine.
 *
 * Marketing here is problem-led, not slogan-led: the story starts with a real
 * situation, says why it matters, then shows how EarnRoom connects someone who
 * needs space with someone who has it. Every person in a story is explicitly
 * illustrative — no fabricated customer, testimonial or result.
 */
import { brandProfile, taglineFor } from "./brand";
import type { CreativeTreatment } from "./creative";
import type { CampaignStory, MarketingOpportunity, StoryFormat, StoryScene } from "./types";

function formatFor(opportunity: MarketingOpportunity): StoryFormat {
  if (opportunity.audience === "both_sides") return "TWO_SIDED";
  if (opportunity.audience === "hosts") return "HOST_OPPORTUNITY";
  if (opportunity.trigger === "SEASONAL") return "SEASONAL_STORY";
  if (opportunity.trigger === "SUPPLY_GAP") return "LOCAL_STORY";
  if (opportunity.trigger === "SEO_OPPORTUNITY") return "EDUCATIONAL";
  if (opportunity.trigger === "DEMAND_CREATION") return "PERSON_PAIN_DISCOVERY_RESOLUTION";
  return "PROBLEM_SOLUTION";
}

function hookFor(opportunity: MarketingOpportunity): string {
  const place = opportunity.location?.name;
  switch (formatFor(opportunity)) {
    case "HOST_OPPORTUNITY":
      return place ? `Got a spare garage in ${place}?` : opportunity.problem;
    case "LOCAL_STORY":
      return place
        ? `People in ${place} are looking for storage. There isn't much.`
        : opportunity.problem;
    case "TWO_SIDED":
      return "One person needs space. Another has space they never use.";
    case "EDUCATIONAL":
      return opportunity.problem;
    case "SEASONAL_STORY":
      return place ? `${place}: ${opportunity.problem}` : opportunity.problem;
    default:
      return opportunity.problem;
  }
}

/**
 * Builds a scene plan. Deterministic, so a founder regenerating the same
 * campaign sees the same structure unless they change something.
 */
export function buildStory(
  opportunity: MarketingOpportunity,
  options: { seconds?: number; creative?: CreativeTreatment } = {},
): CampaignStory {
  const profile = brandProfile();
  const place = opportunity.location?.name ?? "your area";
  const hostSide = opportunity.audience === "hosts";
  const total = options.seconds ?? 30;

  const renterCta = hostSide ? profile.renterCtas[1]! : profile.renterCtas[0]!;
  const hostCta = profile.hostCtas[0]!;
  const tagline = taglineFor(opportunity.key);

  // The creative treatment, when one was chosen, decides WHAT is filmed. The
  // voiceover still comes from the campaign's own evidence, so the picture
  // varies while the argument stays true to the opportunity.
  const creative = options.creative ?? null;
  const beat = (index: number, fallbackVisual: string, fallbackCaption: string) => ({
    visual: creative?.beats[index]?.visual ?? fallbackVisual,
    caption: creative?.beats[index]?.caption ?? fallbackCaption,
  });
  const openHook = creative?.hook ?? hookFor(opportunity);

  const one = beat(
    0,
    hostSide
      ? "A half-empty garage: a bike, a few paint tins, plenty of floor."
      : "A hallway stacked with boxes, a bike leaning against them.",
    openHook,
  );
  const two = beat(
    1,
    "Close, unhurried shots of the everyday things involved — boxes, furniture, a cot, seasonal crates.",
    "Why it matters",
  );
  const three = beat(
    2,
    hostSide
      ? "The same garage, tidied, with a few labelled boxes neatly in one bay."
      : `A map pin settling over ${place}, then a nearby garage door opening.`,
    hostSide ? "Space that could earn" : "Space closer than you think",
  );
  const four = beat(
    3,
    "Two people, two doorsteps, one handover of boxes — plain and ordinary.",
    "How EarnRoom works",
  );

  const scenes: StoryScene[] = [
    {
      index: 1,
      visual: one.visual,
      voiceover: openHook,
      caption: one.caption,
      seconds: 4,
    },
    {
      index: 2,
      visual: two.visual,
      voiceover: opportunity.evidence[1]?.statement.startsWith("If unresolved")
        ? opportunity.evidence[1].statement.replace("If unresolved: ", "")
        : `${opportunity.problem} It is more common than people think.`,
      caption: two.caption,
      seconds: 6,
    },
    {
      index: 3,
      visual: three.visual,
      voiceover: hostSide
        ? "What if part of that space could earn instead of sitting empty?"
        : "What if someone nearby had suitable spare space?",
      caption: three.caption,
      seconds: 6,
    },
    {
      index: 4,
      visual: four.visual,
      voiceover: "EarnRoom connects people who need storage with people who have space to spare.",
      caption: four.caption,
      seconds: 7,
    },
    {
      index: 5,
      visual:
        "End card: EarnRoom lock-up, approved tagline and website on a warm neutral background.",
      voiceover: hostSide ? hostCta : renterCta,
      caption: `${tagline} ${profile.website}`,
      seconds: Math.max(4, total - 23),
    },
  ];

  return {
    format: formatFor(opportunity),
    hook: openHook,
    ...(creative
      ? {
          creative: {
            treatmentId: creative.id,
            name: creative.name,
            family: creative.family,
            hook: creative.hook,
            setting: creative.setting,
            openingShot: creative.openingShot,
            ending: creative.ending,
            avoided: [],
          },
        }
      : {}),
    scenes,
    renterCta,
    hostCta: opportunity.secondaryAudience === "hosts" || hostSide ? hostCta : null,
    illustrative: true,
    seconds: scenes.reduce((sum, scene) => sum + scene.seconds, 0),
  };
}

/** Flat script text for the founder console and for voiceover generation. */
export function scriptText(story: CampaignStory): string {
  return story.scenes.map((scene) => `${scene.index}. ${scene.voiceover}`).join("\n");
}
