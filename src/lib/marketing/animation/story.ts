/**
 * Browser Local story engine.
 *
 * The campaign intelligence already decided what to say: the topic, the
 * audience, the geography and every line of copy arrive here finished. This
 * module decides only who the viewer sees, where they are, what they are doing
 * and how the camera behaves — a deterministic storyboard, produced from the
 * campaign the intelligence built.
 *
 * Nothing here invents claims, and nothing here calls a model.
 *
 * Pure module: no canvas, no network, no clock, no randomness.
 */
import type { CampaignStory, MarketingAudience, PlatformAsset } from "../types";
import type { CharacterId, CharacterMotion, Expression, Pose } from "./characters";
import { characterForRole } from "./characters";
import type { EnvironmentId } from "./environments";

/** The job a beat does in the advertisement. */
export type StoryBeat =
  | "hook"
  | "problem"
  | "pain"
  | "discovery"
  | "solution"
  | "connection"
  | "outcome"
  | "brand";

export type CameraShot =
  | "establishing"
  | "slowPush"
  | "slowPull"
  | "panLeft"
  | "panRight"
  | "focusCharacter"
  | "focusObject"
  | "reveal"
  | "twoShot";

export type CharacterCue = {
  character: CharacterId;
  pose: Pose;
  expression: Expression;
  motion: CharacterMotion;
  /** Horizontal centre as a fraction of frame width. */
  x: number;
  /** Height as a fraction of frame height. */
  scale: number;
  facing: 1 | -1;
  /** Seconds into the scene before the character acts. */
  delay: number;
};

/**
 * How close the camera sits to the action. Advertising reads as advertising
 * partly because the framing changes: a wide establishing shot, then a medium,
 * then a face, then a detail. A film of identical mid shots reads as a slide
 * deck however well it is drawn.
 */
export type Framing = "wide" | "medium" | "close" | "twoShot" | "detail";

/** The feeling the scene is meant to leave, so the film has an emotional arc. */
export type Mood = "tension" | "doubt" | "curiosity" | "hope" | "relief" | "delight";

export type StoryboardScene = {
  index: number;
  beat: StoryBeat;
  environment: EnvironmentId;
  cast: readonly CharacterCue[];
  /** Object library ids placed in the scene, on top of the environment. */
  props: readonly string[];
  shot: CameraShot;
  /** How close the camera sits. Derived from the shot, never guessed. */
  framing: Framing;
  /** Where this scene sits on the emotional arc. */
  mood: Mood;
  /** Plain-English note describing what changes in this scene. */
  note: string;
};

/** Framing follows the shot the storyboard already asked for. */
export function framingForShot(shot: CameraShot): Framing {
  switch (shot) {
    case "establishing":
    case "panLeft":
    case "panRight":
    case "reveal":
      return "wide";
    case "focusCharacter":
      return "close";
    case "focusObject":
      return "detail";
    case "twoShot":
      return "twoShot";
    default:
      return "medium";
  }
}

/**
 * The arc every EarnRoom advertisement follows: it starts unsettled and ends
 * settled. The beat decides the feeling, so the arc cannot drift.
 */
export function moodForBeat(beat: StoryBeat): Mood {
  switch (beat) {
    case "hook":
      return "curiosity";
    case "problem":
      return "tension";
    case "pain":
      return "doubt";
    case "discovery":
      return "curiosity";
    case "solution":
    case "connection":
      return "hope";
    case "outcome":
      return "relief";
    default:
      return "delight";
  }
}

/** Moods that mean the story has resolved. The film must end on one of them. */
export const RESOLVED_MOODS: readonly Mood[] = ["relief", "delight"];


export type StoryTemplateId =
  | "STORAGE_PROBLEM"
  | "MOVING_HOUSE"
  | "DECLUTTERING"
  | "HOST_UNUSED_SPACE"
  | "GARAGE_EARNING"
  | "SPARE_ROOM"
  | "STUDENT_STORAGE"
  | "RENOVATION_STORAGE"
  | "SEASONAL_STORAGE"
  | "LOCAL_STORAGE_NEED"
  | "TWO_SIDED_MARKETPLACE";

export type Storyboard = {
  template: StoryTemplateId;
  side: "renter" | "host" | "both";
  characters: readonly CharacterId[];
  scenes: readonly StoryboardScene[];
};

/**
 * Templates state the shot; framing and mood follow from the shot and the beat,
 * so no template can drift away from the arc.
 */
type BeatTemplate = Omit<StoryboardScene, "index" | "framing" | "mood"> &
  Partial<Pick<StoryboardScene, "framing" | "mood">>;

type StoryTemplate = {
  id: StoryTemplateId;
  side: "renter" | "host" | "both";
  /** Lower-case keywords that make this template the right fit. */
  keywords: readonly string[];
  beats: readonly BeatTemplate[];
};

const RENTER = characterForRole("renter");
const HOST = characterForRole("host");
const SECOND = characterForRole("secondary");

function cue(
  character: CharacterId,
  pose: Pose,
  expressionValue: Expression,
  motion: CharacterMotion,
  x = 0.4,
  scale = 0.46,
  facing: 1 | -1 = 1,
  delay = 0,
): CharacterCue {
  return { character, pose, expression: expressionValue, motion, x, scale, facing, delay };
}

/** The connection beat and the brand card are shared by every template. */
const CONNECTION: BeatTemplate = {
  beat: "connection",
  environment: "ENV_STORAGE_SPACE",
  cast: [
    cue(RENTER, "holdingBox", "hopeful", "putDown", 0.3, 0.44, 1),
    cue(HOST, "presenting", "confident", "gesture", 0.72, 0.44, -1, 0.4),
  ],
  props: ["box-stack"],
  shot: "twoShot",
  note: "One person needs space, one has space, and the two sides meet.",
};

const OUTCOME_RENTER: BeatTemplate = {
  beat: "outcome",
  environment: "ENV_STORAGE_SPACE",
  cast: [cue(RENTER, "relieved", "relieved", "relief", 0.36, 0.46, 1)],
  props: ["box-stack", "check"],
  shot: "slowPull",
  note: "The belongings are stored and the problem is solved.",
};

const OUTCOME_HOST: BeatTemplate = {
  beat: "outcome",
  environment: "ENV_GARAGE",
  cast: [cue(HOST, "relieved", "happy", "relief", 0.34, 0.46, 1)],
  props: ["earning", "check"],
  shot: "slowPull",
  note: "The space is in use and earning rather than sitting empty.",
};

const BRAND: BeatTemplate = {
  beat: "brand",
  environment: "ENV_CLOSING_BRAND",
  cast: [],
  props: [],
  shot: "reveal",
  note: "The EarnRoom lock-up, tagline, call to action and web address.",
};

const DISCOVERY_PHONE: BeatTemplate = {
  beat: "discovery",
  environment: "ENV_HOME_LIVING_ROOM",
  cast: [cue(RENTER, "lookingAtPhone", "searching", "lookAtPhone", 0.34, 0.48, 1)],
  props: ["search-bar"],
  shot: "focusObject",
  note: "They start looking for somewhere nearby to put things.",
};

const SOLUTION_MAP: BeatTemplate = {
  beat: "solution",
  environment: "ENV_MAP",
  cast: [],
  props: ["pin", "marketplace-link"],
  shot: "slowPush",
  note: "EarnRoom shows spare space close by.",
};

const TEMPLATES: Record<StoryTemplateId, StoryTemplate> = {
  MOVING_HOUSE: {
    id: "MOVING_HOUSE",
    side: "renter",
    keywords: ["moving", "move", "completion", "removal", "new place", "house move"],
    beats: [
      {
        beat: "hook",
        environment: "ENV_MOVING_DAY",
        cast: [cue(RENTER, "carryingBoxes", "neutral", "walkIn", 0.32, 0.48, 1)],
        props: ["box"],
        shot: "establishing",
        note: "Someone carries a box into a home already full of boxes.",
      },
      {
        beat: "problem",
        environment: "ENV_MOVING_DAY",
        cast: [cue(RENTER, "placingBox", "concerned", "putDown", 0.36, 0.48, 1)],
        props: ["box-stack"],
        shot: "slowPush",
        note: "There is nowhere left to put the next box.",
      },
      {
        beat: "pain",
        environment: "ENV_HOME_LIVING_ROOM",
        cast: [cue(RENTER, "worried", "concerned", "lookAround", 0.34, 0.48, 1)],
        props: ["warning", "box-stack"],
        shot: "focusCharacter",
        note: "The dates do not line up and the pressure shows.",
      },
      DISCOVERY_PHONE,
      SOLUTION_MAP,
      {
        beat: "connection",
        environment: "ENV_GARAGE",
        cast: [cue(HOST, "openingGarage", "confident", "gesture", 0.36, 0.46, 1)],
        props: ["garage"],
        shot: "reveal",
        note: "A nearby host opens a garage that is sitting empty.",
      },
      CONNECTION,
      OUTCOME_RENTER,
      BRAND,
    ],
  },

  STORAGE_PROBLEM: {
    id: "STORAGE_PROBLEM",
    side: "renter",
    keywords: ["storage", "store", "space", "nowhere to put"],
    beats: [
      {
        beat: "hook",
        environment: "ENV_HOME_LIVING_ROOM",
        cast: [cue(RENTER, "lookingAround", "searching", "lookAround", 0.34, 0.48, 1)],
        props: ["box-stack"],
        shot: "establishing",
        note: "A home with more belongings than room for them.",
      },
      {
        beat: "problem",
        environment: "ENV_HOME_LIVING_ROOM",
        cast: [cue(RENTER, "worried", "concerned", "idle", 0.34, 0.48, 1)],
        props: ["warning"],
        shot: "slowPush",
        note: "The overflow becomes a real problem.",
      },
      DISCOVERY_PHONE,
      SOLUTION_MAP,
      CONNECTION,
      OUTCOME_RENTER,
      BRAND,
    ],
  },

  DECLUTTERING: {
    id: "DECLUTTERING",
    side: "renter",
    keywords: ["declutter", "clutter", "tidy", "clear out", "spring clean"],
    beats: [
      {
        beat: "hook",
        environment: "ENV_HOME_LIVING_ROOM",
        cast: [cue(RENTER, "lookingAround", "confused", "lookAround", 0.32, 0.48, 1)],
        props: ["box-stack", "sofa"],
        shot: "establishing",
        note: "A crowded room, with things stacked where they should not be.",
      },
      {
        beat: "pain",
        environment: "ENV_HOME_LIVING_ROOM",
        cast: [cue(RENTER, "thinking", "thinking", "idle", 0.34, 0.48, 1)],
        props: ["warning"],
        shot: "focusCharacter",
        note: "Nothing can be thrown away, and nothing fits.",
      },
      DISCOVERY_PHONE,
      SOLUTION_MAP,
      CONNECTION,
      OUTCOME_RENTER,
      BRAND,
    ],
  },

  STUDENT_STORAGE: {
    id: "STUDENT_STORAGE",
    side: "renter",
    keywords: ["student", "university", "term", "halls", "campus", "semester"],
    beats: [
      {
        beat: "hook",
        environment: "ENV_SPARE_ROOM",
        cast: [cue(RENTER, "carryingBoxes", "concerned", "walkIn", 0.34, 0.46, 1)],
        props: ["box"],
        shot: "establishing",
        note: "Term ends and the room has to be cleared.",
      },
      {
        beat: "pain",
        environment: "ENV_STREET",
        cast: [cue(RENTER, "worried", "concerned", "lookAround", 0.34, 0.44, 1)],
        props: ["box-stack", "warning"],
        shot: "slowPush",
        note: "Home is too far to take everything back.",
      },
      DISCOVERY_PHONE,
      SOLUTION_MAP,
      CONNECTION,
      OUTCOME_RENTER,
      BRAND,
    ],
  },

  RENOVATION_STORAGE: {
    id: "RENOVATION_STORAGE",
    side: "renter",
    keywords: ["renovation", "builder", "refurb", "extension", "decorating", "kitchen"],
    beats: [
      {
        beat: "hook",
        environment: "ENV_HOME_LIVING_ROOM",
        cast: [cue(RENTER, "lookingAround", "concerned", "lookAround", 0.33, 0.48, 1)],
        props: ["sofa", "box-stack"],
        shot: "establishing",
        note: "Furniture pushed into the middle of the room while work starts.",
      },
      {
        beat: "pain",
        environment: "ENV_HOME_LIVING_ROOM",
        cast: [cue(RENTER, "worried", "concerned", "idle", 0.33, 0.48, 1)],
        props: ["warning"],
        shot: "focusCharacter",
        note: "There is nowhere to keep it while the work runs on.",
      },
      DISCOVERY_PHONE,
      SOLUTION_MAP,
      CONNECTION,
      OUTCOME_RENTER,
      BRAND,
    ],
  },

  SEASONAL_STORAGE: {
    id: "SEASONAL_STORAGE",
    side: "renter",
    keywords: ["seasonal", "christmas", "winter", "summer", "bike", "garden", "camping"],
    beats: [
      {
        beat: "hook",
        environment: "ENV_GARAGE",
        cast: [cue(RENTER, "holdingBox", "neutral", "idle", 0.32, 0.46, 1)],
        props: ["bike"],
        shot: "establishing",
        note: "Seasonal kit taking up room it does not need to.",
      },
      {
        beat: "pain",
        environment: "ENV_HOME_LIVING_ROOM",
        cast: [cue(RENTER, "worried", "concerned", "lookAround", 0.34, 0.48, 1)],
        props: ["warning", "box-stack"],
        shot: "slowPush",
        note: "Half the year it is simply in the way.",
      },
      DISCOVERY_PHONE,
      SOLUTION_MAP,
      CONNECTION,
      OUTCOME_RENTER,
      BRAND,
    ],
  },

  LOCAL_STORAGE_NEED: {
    id: "LOCAL_STORAGE_NEED",
    side: "both",
    keywords: ["near me", "local", "nearby", "neighbourhood", "area"],
    beats: [
      {
        beat: "hook",
        environment: "ENV_STREET",
        cast: [cue(RENTER, "walking", "searching", "walkIn", 0.3, 0.42, 1)],
        props: ["box"],
        shot: "establishing",
        note: "An ordinary street, and someone who needs space on it.",
      },
      {
        beat: "problem",
        environment: "ENV_STREET",
        cast: [cue(RENTER, "worried", "concerned", "lookAround", 0.32, 0.44, 1)],
        props: ["warning"],
        shot: "panRight",
        note: "Commercial storage is a drive away and priced by the month.",
      },
      SOLUTION_MAP,
      {
        beat: "discovery",
        environment: "ENV_GARAGE",
        cast: [cue(HOST, "openingGarage", "confident", "gesture", 0.36, 0.46, 1)],
        props: ["garage"],
        shot: "reveal",
        note: "The space that fits is on the next road.",
      },
      CONNECTION,
      OUTCOME_RENTER,
      BRAND,
    ],
  },

  HOST_UNUSED_SPACE: {
    id: "HOST_UNUSED_SPACE",
    side: "host",
    keywords: ["unused space", "empty space", "spare", "host", "list your space"],
    beats: [
      {
        beat: "hook",
        environment: "ENV_SPARE_ROOM",
        cast: [cue(HOST, "lookingAround", "neutral", "lookAround", 0.34, 0.46, 1)],
        props: [],
        shot: "establishing",
        note: "A room that nobody uses.",
      },
      {
        beat: "problem",
        environment: "ENV_SPARE_ROOM",
        cast: [cue(HOST, "thinking", "thinking", "idle", 0.34, 0.46, 1)],
        props: [],
        shot: "slowPush",
        note: "It has been empty for months.",
      },
      {
        beat: "discovery",
        environment: "ENV_PHONE_UI",
        cast: [],
        props: ["search-bar"],
        shot: "focusObject",
        note: "Listing it takes a few minutes.",
      },
      {
        beat: "solution",
        environment: "ENV_MAP",
        cast: [],
        props: ["pin", "marketplace-link"],
        shot: "slowPush",
        note: "Someone nearby is already looking for space like it.",
      },
      CONNECTION,
      OUTCOME_HOST,
      BRAND,
    ],
  },

  GARAGE_EARNING: {
    id: "GARAGE_EARNING",
    side: "host",
    keywords: ["garage", "driveway", "lock-up", "shed"],
    beats: [
      {
        beat: "hook",
        environment: "ENV_GARAGE",
        cast: [cue(HOST, "openingGarage", "neutral", "gesture", 0.34, 0.46, 1)],
        props: ["garage"],
        shot: "establishing",
        note: "A garage opens on a space that holds nothing.",
      },
      {
        beat: "problem",
        environment: "ENV_GARAGE",
        cast: [cue(HOST, "lookingAround", "thinking", "lookAround", 0.34, 0.46, 1)],
        props: [],
        shot: "slowPush",
        note: "Square metres doing nothing at all.",
      },
      {
        beat: "discovery",
        environment: "ENV_PHONE_UI",
        cast: [],
        props: ["search-bar"],
        shot: "focusObject",
        note: "The space gets listed on EarnRoom.",
      },
      {
        beat: "solution",
        environment: "ENV_MAP",
        cast: [],
        props: ["pin", "earning"],
        shot: "slowPush",
        note: "A renter nearby needs exactly that.",
      },
      CONNECTION,
      OUTCOME_HOST,
      BRAND,
    ],
  },

  SPARE_ROOM: {
    id: "SPARE_ROOM",
    side: "host",
    keywords: ["spare room", "box room", "loft", "attic"],
    beats: [
      {
        beat: "hook",
        environment: "ENV_SPARE_ROOM",
        cast: [cue(HOST, "presenting", "neutral", "gesture", 0.34, 0.46, 1)],
        props: [],
        shot: "establishing",
        note: "A spare room with room to spare.",
      },
      {
        beat: "pain",
        environment: "ENV_SPARE_ROOM",
        cast: [cue(HOST, "thinking", "thinking", "idle", 0.34, 0.46, 1)],
        props: [],
        shot: "focusCharacter",
        note: "Empty space costs the same as used space.",
      },
      {
        beat: "solution",
        environment: "ENV_MAP",
        cast: [],
        props: ["pin", "marketplace-link"],
        shot: "slowPush",
        note: "EarnRoom puts it in front of people who need it.",
      },
      CONNECTION,
      OUTCOME_HOST,
      BRAND,
    ],
  },

  TWO_SIDED_MARKETPLACE: {
    id: "TWO_SIDED_MARKETPLACE",
    side: "both",
    keywords: ["marketplace", "both", "connect", "community", "neighbour"],
    beats: [
      {
        beat: "hook",
        environment: "ENV_HOME_LIVING_ROOM",
        cast: [cue(RENTER, "carryingBoxes", "concerned", "walkIn", 0.32, 0.48, 1)],
        props: ["box-stack"],
        shot: "establishing",
        note: "One person has more than fits.",
      },
      {
        beat: "problem",
        environment: "ENV_GARAGE",
        cast: [cue(HOST, "lookingAround", "neutral", "lookAround", 0.36, 0.46, 1)],
        props: ["garage"],
        shot: "panLeft",
        note: "Another person has space nobody uses.",
      },
      SOLUTION_MAP,
      CONNECTION,
      {
        beat: "outcome",
        environment: "ENV_STORAGE_SPACE",
        cast: [
          cue(RENTER, "relieved", "relieved", "relief", 0.3, 0.44, 1),
          cue(HOST, "waving", "happy", "smallWave", 0.72, 0.44, -1, 0.3),
        ],
        props: ["check"],
        shot: "slowPull",
        note: "Both sides end better off than they started.",
      },
      BRAND,
    ],
  },
};

export const STORY_TEMPLATE_IDS = Object.keys(TEMPLATES) as StoryTemplateId[];

export function template(id: StoryTemplateId): StoryTemplate {
  const found = TEMPLATES[id];
  if (!found) throw new Error(`Unknown story template: ${id}`);
  return found;
}

/** Registration point for future templates. */
export function addTemplate(value: StoryTemplate): void {
  TEMPLATES[value.id] = value;
}

/** Which side of the marketplace the campaign is speaking to. */
export function sideForAudience(audience: MarketingAudience | null | undefined): "renter" | "host" | "both" {
  const value = String(audience ?? "").toLowerCase();
  if (value.includes("host") || value.includes("owner") || value.includes("landlord")) return "host";
  if (value.includes("both") || value.includes("marketplace")) return "both";
  return "renter";
}

/**
 * Picks the template the campaign's own words point at. Deterministic: the
 * same campaign text always selects the same template, and ties are broken by
 * a fixed order rather than by chance.
 */
export function selectTemplate(input: {
  text: string;
  side: "renter" | "host" | "both";
}): StoryTemplateId {
  const text = input.text.toLowerCase();
  let best: { id: StoryTemplateId; score: number } | null = null;
  for (const id of STORY_TEMPLATE_IDS) {
    const candidate = TEMPLATES[id]!;
    let score = 0;
    for (const keyword of candidate.keywords) if (text.includes(keyword)) score += 2;
    if (candidate.side === input.side) score += 1;
    if (score > 0 && (!best || score > best.score)) best = { id, score };
  }
  if (best) return best.id;
  if (input.side === "host") return "HOST_UNUSED_SPACE";
  if (input.side === "both") return "TWO_SIDED_MARKETPLACE";
  return "STORAGE_PROBLEM";
}

/**
 * Compresses a template to the number of scenes the campaign actually has,
 * without ever losing its beginning or its ending.
 */
export function compressBeats(beats: readonly BeatTemplate[], count: number): BeatTemplate[] {
  const wanted = Math.max(1, count);
  if (wanted >= beats.length) return [...beats];
  if (wanted === 1) return [beats[beats.length - 1]!];
  const kept: BeatTemplate[] = [beats[0]!];
  const middle = beats.slice(1, -1);
  const slots = wanted - 2;
  for (let i = 0; i < slots; i += 1) {
    // Evenly spaced through the middle, so the story still progresses.
    const at = Math.round(((i + 1) * (middle.length - 1)) / Math.max(1, slots + 1));
    const pick = middle[Math.min(middle.length - 1, at)];
    if (pick) kept.push(pick);
  }
  kept.push(beats[beats.length - 1]!);
  return kept;
}

/**
 * Builds the storyboard for one campaign asset.
 *
 * `sceneCount` is the number of story scenes to fill, excluding the brand card;
 * the brand card is added by the caller's plan when the platform allows it.
 */
export function buildStoryboard(input: {
  story: CampaignStory;
  asset: PlatformAsset;
  audience?: MarketingAudience | null;
  topic?: string | null;
  /** Story scenes to fill, excluding the closing brand card. */
  sceneCount: number;
}): Storyboard {
  const side = sideForAudience(input.audience);
  const text = [
    input.topic ?? "",
    input.asset.title,
    input.asset.description,
    input.story.hook,
    ...input.story.scenes.map((scene) => `${scene.visual} ${scene.caption} ${scene.voiceover}`),
  ].join(" ");

  const chosen = template(selectTemplate({ text, side }));
  // The brand card is planned separately, so the storyboard covers the story.
  const storyBeats = chosen.beats.filter((beat) => beat.beat !== "brand");
  const beats = compressBeats(storyBeats, input.sceneCount);

  const scenes: StoryboardScene[] = beats.map((beat, index) => ({
    ...beat,
    index,
    framing: beat.framing ?? framingForShot(beat.shot),
    mood: beat.mood ?? moodForBeat(beat.beat),
  }));

  const characters = [
    ...new Set(scenes.flatMap((scene) => scene.cast.map((member) => member.character))),
  ];

  return { template: chosen.id, side: chosen.side, characters, scenes };
}

/** Convenience for tests and diagnostics: the beats in order. */
export function beatsOf(board: Storyboard): StoryBeat[] {
  return board.scenes.map((scene) => scene.beat);
}

export { SECOND as SECONDARY_CHARACTER };
