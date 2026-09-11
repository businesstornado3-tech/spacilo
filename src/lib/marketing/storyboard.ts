/**
 * Timed storyboard for a paid cinematic film.
 *
 * A 30-second film is NOT a stretched 10-second prompt. This module turns the
 * campaign the marketing intelligence already produced into a beat-by-beat
 * storyboard with a real beginning, middle and ending, and splits it into the
 * generation segments the hosted service can actually make (it films at most
 * `PROVIDER_MAX_SEGMENT_SECONDS` at a time, so a longer film is a chain of
 * continuations of the same scene).
 *
 * It also owns the on-screen wording. The video model is never trusted with
 * marketing copy, a web address, a logo or a brand mark: every caption here is
 * a timed instruction for EarnRoom's own deterministic overlay layer, with an
 * explicit start and end, one major line on screen at a time, and nothing left
 * standing when the next line arrives.
 *
 * The creative variety system still chooses WHAT is filmed — this module only
 * decides how the chosen story is paced, captioned and cut.
 *
 * Pure module: no clock, no network, no canvas.
 */
import { CREATIVE_TREATMENTS, treatmentDirectives } from "./creative";
import { PROVIDER_MAX_SEGMENT_SECONDS } from "./paid-presets";
import { PROHIBITION_LINE, findBrandTerms, sanitizeProviderText } from "./prompt-safety";
import type { MarketingCampaign, PlatformAsset } from "./types";

export type BeatRole = "HOOK" | "PERSON" | "PROBLEM" | "SOLUTION" | "PAYOFF" | "END_CARD";

export type StoryboardBeat = {
  role: BeatRole;
  fromSeconds: number;
  toSeconds: number;
  /** What the camera sees. Sent to the model. */
  direction: string;
  /** The major on-screen line for this beat, drawn by EarnRoom, not the model. */
  caption: string | null;
};

export type CaptionCue = { text: string; fromSeconds: number; toSeconds: number };

/** One spoken line of the film's narrative, timed against the beat it belongs to. */
export type NarrationCue = {
  role: BeatRole;
  text: string;
  fromSeconds: number;
  toSeconds: number;
};

/**
 * Whether the generation service can actually speak the narrative.
 *
 * The hosted video models EarnRoom uses produce pictures and ambient sound, not
 * speech. That is stated here rather than quietly implied: a film whose story
 * is carried by on-screen wording is never described as narrated.
 */
export type NarrationCapability = {
  /** True only when a service that genuinely speaks the script is in use. */
  spoken: boolean;
  detail: string;
};

export const NARRATION_CAPABILITY: NarrationCapability = {
  spoken: false,
  detail:
    "The video service EarnRoom uses makes pictures and ambient sound only — it cannot speak. The story is written first and then carried on screen, one readable line at a time. No voice is added and none is claimed.",
};

/** Words a viewer comfortably takes in per second of film. */
export const NARRATION_WORDS_PER_SECOND = 2.4;

export type StoryboardSegment = {
  index: number;
  fromSeconds: number;
  seconds: number;
  /** The prompt for this single generation. Continuations say so explicitly. */
  prompt: string;
};

export type VideoStoryboard = {
  campaignId: string;
  assetId: string;
  seconds: number;
  /** The closing EarnRoom card, always the last stretch of the film. */
  endCardFromSeconds: number;
  beats: readonly StoryboardBeat[];
  /** The written story, beat by beat. The captions are drawn from these lines. */
  narration: readonly NarrationCue[];
  /** Whether the film is actually spoken. Stated, never assumed. */
  narrationCapability: NarrationCapability;
  captions: readonly CaptionCue[];
  segments: readonly StoryboardSegment[];
  /** The creative treatment this film was built from, when one was chosen. */
  treatmentId: string | null;
};

/** Longest a single on-screen line may be, so it stays readable. */
export const MAX_CAPTION_CHARS = 52;
/** Clear gap between one major line disappearing and the next appearing. */
export const CAPTION_GAP_SECONDS = 0.4;
/** The closing EarnRoom card, in seconds. */
const END_CARD_SECONDS = 3;

/** Six-beat share of a 30-second film, before natural variation. */
const LONG_SHARES: { role: BeatRole; seconds: number }[] = [
  { role: "HOOK", seconds: 5 },
  { role: "PERSON", seconds: 6 },
  { role: "PROBLEM", seconds: 6 },
  { role: "SOLUTION", seconds: 6 },
  { role: "PAYOFF", seconds: 4 },
  { role: "END_CARD", seconds: END_CARD_SECONDS },
];

/** A short film has no room for six beats; it keeps the essential three. */
const SHORT_SHARES: { role: BeatRole; seconds: number }[] = [
  { role: "HOOK", seconds: 4 },
  { role: "SOLUTION", seconds: 3 },
  { role: "END_CARD", seconds: 3 },
];

function seedOf(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

/** Trims a line to something a viewer can actually read, on a word boundary. */
export function shortLine(text: string, limit = MAX_CAPTION_CHARS): string {
  const clean = text.replace(/\s+/g, " ").trim().replace(/[.]+$/, "");
  if (clean.length <= limit) return clean;
  const cut = clean.slice(0, limit);
  const space = cut.lastIndexOf(" ");
  return (space > limit * 0.5 ? cut.slice(0, space) : cut).trim();
}

/**
 * Shares out the exact total, with a small deterministic variation so two
 * campaigns do not cut on the same frame. The total is always preserved.
 */
function beatLengths(
  shares: { role: BeatRole; seconds: number }[],
  seconds: number,
  seed: number,
): { role: BeatRole; seconds: number }[] {
  const planned = shares.reduce((sum, share) => sum + share.seconds, 0);
  const lengths = shares.map((share) => ({ ...share }));

  // Natural variation: one second moves between two middle beats.
  const movable = lengths.filter((beat) => beat.role !== "END_CARD" && beat.seconds > 4);
  if (movable.length >= 2) {
    const give = movable[seed % movable.length]!;
    const take = movable[(seed + 1 + (seed % (movable.length - 1))) % movable.length]!;
    if (give !== take && give.seconds > 4) {
      give.seconds -= 1;
      take.seconds += 1;
    }
  }

  // Absorb any difference from the requested duration on the longest body beat.
  let drift = seconds - planned;
  while (drift !== 0) {
    const body = lengths.filter((beat) => beat.role !== "END_CARD");
    const target =
      drift > 0
        ? body.reduce((a, b) => (b.seconds > a.seconds ? b : a))
        : body.reduce((a, b) => (b.seconds < a.seconds ? b : a));
    const step = drift > 0 ? 1 : -1;
    if (step < 0 && target.seconds <= 2) break;
    target.seconds += step;
    drift -= step;
  }
  return lengths;
}

/**
 * Campaign-specific direction for each beat, never a fixed script.
 *
 * Everything here is written by the intelligence layer, so every line is put
 * through the brand filter before it can reach a generation service.
 */
function directions(campaign: MarketingCampaign, asset: PlatformAsset): Record<BeatRole, string> {
  const scenes = campaign.story.scenes;
  const place = sanitizeProviderText(campaign.opportunity.location?.name ?? "the UK");
  const visual = (index: number) => {
    const raw = scenes[Math.min(index, Math.max(0, scenes.length - 1))]?.visual;
    const clean = raw ? sanitizeProviderText(raw) : "";
    return clean.length > 0 ? clean : undefined;
  };
  const problem = sanitizeProviderText(campaign.opportunity.problem);
  const plan: Record<BeatRole, string> = {
    HOOK: visual(0) ?? `The situation opens in ${place}: ${problem}`,
    PERSON:
      visual(1) ??
      `Stay with the person this happens to. Show their day, their home and their face.`,
    PROBLEM:
      visual(Math.max(1, scenes.length - 3)) ??
      `The storage problem becomes unmistakable: there is simply nowhere to put it.`,
    SOLUTION:
      visual(Math.max(2, scenes.length - 2)) ??
      `A neighbour's clean, dry, empty space nearby — the everyday answer.`,
    PAYOFF:
      visual(scenes.length - 1) ??
      `The relief afterwards: the room back, the person calm, life continuing.`,
    END_CARD: `Hold a still, calm, warm neutral frame with an empty centre and nothing drawn in it. ${asset.aspect} framing.`,
  };
  for (const role of Object.keys(plan) as BeatRole[]) {
    plan[role] = sanitizeProviderText(plan[role]);
  }
  return plan;
}

/**
 * The written story, one line per beat.
 *
 * This is the single source of the film's words: the on-screen captions are cut
 * from these very lines, so what a viewer reads is the story being told and
 * never a second, competing script. Each line is trimmed to what the beat has
 * time for at a comfortable reading pace.
 */
function narrationLines(
  campaign: MarketingCampaign,
  asset: PlatformAsset,
): Record<BeatRole, string | null> {
  const scenes = campaign.story.scenes;
  const used = new Set<string>();
  const scene = (index: number) => {
    const entry = scenes[Math.max(0, Math.min(index, scenes.length - 1))];
    const record = (entry ?? {}) as Record<string, unknown>;
    const voice = typeof record["voiceover"] === "string" ? record["voiceover"] : null;
    const caption = typeof record["caption"] === "string" ? record["caption"] : null;
    return voice ?? caption;
  };
  const take = (candidate: string | undefined | null): string | null => {
    if (!candidate) return null;
    const line = candidate.replace(/\s+/g, " ").trim();
    const key = shortLine(line).toLowerCase();
    if (!line || !key || used.has(key)) return null;
    used.add(key);
    return line;
  };
  return {
    HOOK: take(asset.hook ?? campaign.story.hook),
    PERSON: take(scene(1)),
    PROBLEM: take(scene(scenes.length - 3)),
    SOLUTION: take(scene(scenes.length - 2)),
    PAYOFF: take(asset.cta ?? campaign.story.renterCta),
    END_CARD: null,
  };
}

/** Trims a spoken line to the number of words the beat has room for. */
function pacedLine(text: string, seconds: number): string {
  const words = text.split(" ").filter(Boolean);
  const room = Math.max(3, Math.floor(seconds * NARRATION_WORDS_PER_SECOND));
  if (words.length <= room) return words.join(" ");
  return words.slice(0, room).join(" ").replace(/[,;:]$/, "");
}

/**
 * Instructions the model must obey on every segment of every film.
 *
 * Deliberately free of any identity: the model is told to draw nothing written
 * at all, and is never told which company the film is for.
 */
function guardrails(asset: PlatformAsset): string[] {
  return [
    PROHIBITION_LINE,
    "Photograph only real surroundings. Keep shop fronts, packaging, screens and posters out of shot or out of focus so no writing is legible.",
    "Real UK homes, streets, weather and people. No American signage, no dollar signs, no imperial units.",
    "Every person is a general illustration, not a named or real person. No testimonials, no statistics, no money figures.",
    `Vertical ${asset.aspect} framing, cinematic, natural light, unhurried. Keep faces and key objects out of the lower third of the frame, which is reserved and must stay clear.`,
    "Audio: natural room tone and quiet, unobtrusive music only. No speech, no narration, no spoken names.",
  ];
}

function segmentPrompt(input: {
  campaign: MarketingCampaign;
  asset: PlatformAsset;
  beats: StoryboardBeat[];
  index: number;
  fromSeconds: number;
  seconds: number;
  total: number;
  treatmentLines: string[];
}): string {
  const { campaign, asset, beats, index, fromSeconds, seconds } = input;
  const opening =
    index === 0
      ? `Part 1 of ${Math.ceil(input.total / PROVIDER_MAX_SEGMENT_SECONDS)} of a single ${input.total}-second ${asset.aspect} cinematic film. Establish the setting, the person and the situation.`
      : `Part ${index + 1} of ${Math.ceil(input.total / PROVIDER_MAX_SEGMENT_SECONDS)}. The scene continues, unbroken, from the previous part of the same ${input.total}-second film: the same people, the same place, the same light, the same lens and the same grade, carrying straight on from the final frame. Do not restart the story, do not repeat the opening shot, and do not cut to an unrelated location.`;

  const timed = beats.map((beat) => {
    const from = Math.max(0, Math.round(beat.fromSeconds - fromSeconds));
    const to = Math.min(seconds, Math.round(beat.toSeconds - fromSeconds));
    return `[${from}-${to}s] ${beat.role.replace("_", " ").toLowerCase()}: ${beat.direction}`;
  });

  const prompt = [
    opening,
    `Situation: ${sanitizeProviderText(campaign.opportunity.problem)}`,
    `Audience: ${sanitizeProviderText(campaign.opportunity.audience.replace(/_/g, " "))}.`,
    ...input.treatmentLines.map(sanitizeProviderText),
    "Shot plan for this part, timed from its own start:",
    ...timed,
    "One continuous, coherent piece of filmmaking with a small number of deliberate shots. Give each shot room to breathe; do not cram the whole story into the first seconds.",
    ...guardrails(asset),
  ].join("\n");

  // Last line of defence: nothing brand-shaped may survive into a prompt.
  return prompt
    .split("\n")
    .map((line) => (line === PROHIBITION_LINE ? line : sanitizeProviderText(line)))
    .filter((line) => line.length > 0)
    .join("\n");
}

/**
 * Builds the storyboard for one paid film.
 *
 * `seconds` is the preset's duration; `maxSegmentSeconds` is what the provider
 * will actually film in one job — the two are kept separate deliberately, so a
 * provider limit can never be silently assumed.
 */
export function buildStoryboard(input: {
  campaign: MarketingCampaign;
  asset: PlatformAsset;
  seconds: number;
  maxSegmentSeconds?: number;
}): VideoStoryboard {
  const { campaign, asset } = input;
  const seconds = Math.max(5, Math.round(input.seconds));
  const maxSegment = Math.max(
    3,
    Math.round(input.maxSegmentSeconds ?? PROVIDER_MAX_SEGMENT_SECONDS),
  );
  const seed = seedOf(`${campaign.id}:${asset.id}:${seconds}`);
  const shares = seconds >= 20 ? LONG_SHARES : SHORT_SHARES;
  const lengths = beatLengths(shares, seconds, seed);
  const direction = directions(campaign, asset);
  const captionFor = captionLines(campaign, asset);

  let cursor = 0;
  const beats: StoryboardBeat[] = lengths.map((entry) => {
    const from = cursor;
    cursor += entry.seconds;
    return {
      role: entry.role,
      fromSeconds: from,
      toSeconds: Math.min(seconds, cursor),
      direction: direction[entry.role],
      caption: entry.role === "END_CARD" ? null : (captionFor[entry.role] ?? null),
    };
  });

  // One major line at a time: each caption ends before the next one begins,
  // and every line is gone before the closing EarnRoom card starts.
  const endCardFromSeconds =
    beats.find((beat) => beat.role === "END_CARD")?.fromSeconds ?? seconds - END_CARD_SECONDS;
  const captions: CaptionCue[] = [];
  for (const beat of beats) {
    if (!beat.caption) continue;
    const to = Math.min(beat.toSeconds, endCardFromSeconds) - CAPTION_GAP_SECONDS;
    const from = beat.fromSeconds + (beat.fromSeconds === 0 ? 0.3 : CAPTION_GAP_SECONDS / 2);
    if (to - from < 1) continue;
    captions.push({
      text: beat.caption,
      fromSeconds: Number(from.toFixed(2)),
      toSeconds: Number(to.toFixed(2)),
    });
  }

  const treatment = CREATIVE_TREATMENTS.find(
    (entry) => entry.id === campaign.story.creative?.treatmentId,
  );
  const treatmentLines = treatment ? treatmentDirectives(treatment) : [];

  const segments: StoryboardSegment[] = [];
  for (let from = 0, index = 0; from < seconds; from += maxSegment, index += 1) {
    const length = Math.min(maxSegment, seconds - from);
    const to = from + length;
    const within = beats.filter((beat) => beat.toSeconds > from && beat.fromSeconds < to);
    segments.push({
      index,
      fromSeconds: from,
      seconds: length,
      prompt: segmentPrompt({
        campaign,
        asset,
        beats: within,
        index,
        fromSeconds: from,
        seconds: length,
        total: seconds,
        treatmentLines,
      }),
    });
  }

  return {
    campaignId: campaign.id,
    assetId: asset.id,
    seconds,
    endCardFromSeconds,
    beats,
    captions,
    segments,
    treatmentId: treatment?.id ?? null,
  };
}

export type StoryboardVerdict = { passed: boolean; failures: string[] };

/**
 * The gate. A storyboard that could put two lines on screen at once, run past
 * its duration, or leave no time for the closing card never reaches a
 * generation request.
 */
export function validateStoryboard(
  storyboard: VideoStoryboard,
  expected: { seconds: number; maxSegmentSeconds?: number },
): StoryboardVerdict {
  const failures: string[] = [];
  const maxSegment = expected.maxSegmentSeconds ?? PROVIDER_MAX_SEGMENT_SECONDS;

  if (storyboard.seconds !== expected.seconds) {
    failures.push(
      `The storyboard runs ${storyboard.seconds}s but ${expected.seconds}s was requested.`,
    );
  }

  const beatTotal = storyboard.beats.reduce(
    (sum, beat) => sum + (beat.toSeconds - beat.fromSeconds),
    0,
  );
  if (Math.round(beatTotal) !== storyboard.seconds) {
    failures.push(`The beats add up to ${beatTotal}s, not ${storyboard.seconds}s.`);
  }
  storyboard.beats.forEach((beat, index) => {
    const previous = storyboard.beats[index - 1];
    if (previous && beat.fromSeconds !== previous.toSeconds) {
      failures.push("The beats do not run back to back.");
    }
    if (beat.toSeconds <= beat.fromSeconds) failures.push("A beat has no time in it.");
  });

  const last = storyboard.beats.at(-1);
  if (!last || last.role !== "END_CARD") {
    failures.push("The film does not end on the EarnRoom card.");
  } else if (last.toSeconds - last.fromSeconds < 2.5) {
    failures.push("The EarnRoom end card does not have enough time on screen.");
  }
  if (storyboard.endCardFromSeconds >= storyboard.seconds) {
    failures.push("The end card starts after the film has finished.");
  }

  const sorted = [...storyboard.captions].sort((a, b) => a.fromSeconds - b.fromSeconds);
  const seen = new Set<string>();
  sorted.forEach((caption, index) => {
    const previous = sorted[index - 1];
    if (previous && caption.fromSeconds < previous.toSeconds) {
      failures.push(`"${caption.text}" appears while "${previous.text}" is still on screen.`);
    }
    if (previous && caption.fromSeconds - previous.toSeconds < CAPTION_GAP_SECONDS - 0.01) {
      failures.push(`There is no clear gap before "${caption.text}" appears.`);
    }
    if (caption.toSeconds <= caption.fromSeconds) {
      failures.push(`"${caption.text}" has no time on screen.`);
    }
    if (caption.toSeconds > storyboard.endCardFromSeconds + 0.01) {
      failures.push(`"${caption.text}" is still on screen when the EarnRoom card starts.`);
    }
    if (caption.text.length > MAX_CAPTION_CHARS) {
      failures.push(`"${caption.text}" is too long to read at this pace.`);
    }
    const key = caption.text.toLowerCase();
    if (seen.has(key)) failures.push(`"${caption.text}" is repeated across scenes.`);
    seen.add(key);
  });

  const segmentTotal = storyboard.segments.reduce((sum, segment) => sum + segment.seconds, 0);
  if (segmentTotal !== storyboard.seconds) {
    failures.push(`The generation parts add up to ${segmentTotal}s, not ${storyboard.seconds}s.`);
  }
  for (const segment of storyboard.segments) {
    if (segment.seconds > maxSegment) {
      failures.push(
        `One generation part asks for ${segment.seconds}s, more than the ${maxSegment}s the service will film.`,
      );
    }
    if (!segment.prompt.includes(PROHIBITION_LINE)) {
      failures.push("A generation part does not forbid the model from drawing text.");
    }
    const leaked = findBrandTerms(segment.prompt);
    if (leaked.length > 0) {
      failures.push(`A generation part still mentions ${leaked.join(", ")}.`);
    }
  }

  return { passed: failures.length === 0, failures };
}
