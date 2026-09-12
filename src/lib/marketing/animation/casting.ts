/**
 * Casting and visual identity for one campaign's browser film.
 *
 * Two campaigns must not look like the same film with different words. The
 * story engine already chooses what happens; this module chooses who the
 * viewer sees, how the place is lit, how the film opens and how the camera
 * behaves — deterministically, from the campaign's own id and story type.
 *
 * Rules:
 * - Same campaign, same look, every time it is regenerated.
 * - Different campaign, different look.
 * - Within one campaign a person keeps the same face, hair and clothes in
 *   every scene.
 * - Appearance varies by looks only. Nothing here assumes anything about who
 *   uses a storage marketplace.
 *
 * Pure module: no canvas, no clock, no randomness.
 */
import { character, type CharacterDesign, type CharacterId } from "./characters";

/** One campaign's fixed appearance for one person. */
export type CharacterLook = CharacterDesign & {
  glasses: boolean;
  /** Body width multiplier. Appearance only. */
  build: number;
  /** Head size relative to the body, for age presentation variety. */
  headScale: number;
};

/** How the film opens. The first seconds must belong to this story. */
export type OpeningId =
  | "boxesBlockingDoor"
  | "crowdedRoom"
  | "vanArrival"
  | "phoneCheck"
  | "suitcaseBySide"
  | "garageReveal"
  | "emptyRoomReveal"
  | "shelvesReveal";

export type CameraStyleId = "push" | "pull" | "pan" | "mixed";

export type Casting = {
  /** The exact key the seed was derived from, for diagnostics. */
  seedKey: string;
  seed: number;
  /** Which pass of the diversity check produced this look. */
  variant: number;
  looks: Record<string, CharacterLook>;
  /** A gentle grade over the whole scene, so places differ campaign to campaign. */
  tint: { colour: string; alpha: number };
  paletteName: string;
  opening: OpeningId;
  cameraStyle: CameraStyleId;
  /** Semitone offset applied to the soundtrack, so films do not all sound alike. */
  audioKey: number;
};

/* --------------------------------------------------------------- seeding */

/** Small stable hash. Same input, same number, in every browser. */
export function seedFrom(...parts: readonly string[]): number {
  const text = parts.join("|");
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** A deterministic pick. `salt` separates one decision from the next. */
export function pick<T>(seed: number, salt: number, options: readonly T[]): T {
  const mixed = Math.imul(seed ^ Math.imul(salt + 1, 0x9e3779b1), 0x85ebca6b) >>> 0;
  return options[mixed % options.length]!;
}

/* ------------------------------------------------------------- wardrobe */

const SKINS = [
  "#f3d3ba",
  "#e8b894",
  "#d8a679",
  "#c98d63",
  "#a9714a",
  "#8d5c3d",
  "#6d452c",
  "#523320",
];
const HAIR = ["#1b1512", "#3b2f2a", "#5a3b23", "#7a5230", "#a97d४".replace("४", "4"), "#c9a227", "#8e8e93", "#4a2b2b"];
const HAIR_STYLES: CharacterDesign["hairStyle"][] = ["short", "bob", "tied"];
const TOPS = [
  "#2f6f8f",
  "#1f7f5f",
  "#8f4f6f",
  "#b8683f",
  "#4a5f9f",
  "#6a5f8f",
  "#3f7f7f",
  "#9f5f3f",
  "#557a3d",
  "#7a4a9a",
];
const TROUSERS = ["#33414d", "#3c4550", "#4a4038", "#2f3a35", "#453a4a"];
const SHOES = ["#22303a", "#252d34", "#3a2a22", "#2b2b2b"];
const BUILDS = [0.92, 1, 1.08, 1.16];
const HEAD_SCALES = [0.94, 1, 1.06];

function shift(hex: string, amount: number): string {
  const value = hex.replace("#", "");
  const channels = [0, 2, 4].map((at) => parseInt(value.slice(at, at + 2), 16));
  return `#${channels
    .map((channel) =>
      Math.max(0, Math.min(255, Math.round(channel * (1 + amount))))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/** One person's fixed appearance for this campaign. */
export function lookFor(id: CharacterId, seed: number, slot: number): CharacterLook {
  const base = character(id);
  const salt = slot * 17;
  const top = pick(seed, salt + 3, TOPS);
  return {
    ...base,
    skin: pick(seed, salt + 1, SKINS),
    hair: pick(seed, salt + 2, HAIR),
    hairStyle: pick(seed, salt + 6, HAIR_STYLES),
    top,
    sleeve: shift(top, -0.12),
    trousers: pick(seed, salt + 4, TROUSERS),
    shoes: pick(seed, salt + 5, SHOES),
    glasses: pick(seed, salt + 7, [true, false, false]),
    build: pick(seed, salt + 8, BUILDS),
    headScale: pick(seed, salt + 9, HEAD_SCALES),
  };
}

/* --------------------------------------------------------------- grading */

const PALETTES: readonly { name: string; colour: string; alpha: number }[] = [
  { name: "morning", colour: "#ffd9a8", alpha: 0.08 },
  { name: "overcast", colour: "#b9c6d2", alpha: 0.09 },
  { name: "evening", colour: "#f0a988", alpha: 0.1 },
  { name: "cool", colour: "#a8c4d8", alpha: 0.08 },
  { name: "warm", colour: "#f2c48c", alpha: 0.09 },
  { name: "neutral", colour: "#e7e3da", alpha: 0.06 },
];

/** Openings that suit each side of the marketplace. */
const OPENINGS: Record<"renter" | "host" | "both", readonly OpeningId[]> = {
  renter: ["boxesBlockingDoor", "crowdedRoom", "vanArrival", "phoneCheck", "suitcaseBySide"],
  host: ["garageReveal", "emptyRoomReveal", "shelvesReveal", "phoneCheck"],
  both: ["vanArrival", "garageReveal", "crowdedRoom", "emptyRoomReveal"],
};

const CAMERA_STYLES: readonly CameraStyleId[] = ["push", "pull", "pan", "mixed"];

/** Everything a campaign's film looks and sounds like, decided once. */
export function castingFor(input: {
  campaignId: string;
  storyType: string;
  characters: readonly string[];
  side: "renter" | "host" | "both";
  /** Diversity pass. 0 is the natural look for this campaign. */
  variant?: number;
}): Casting {
  const variant = input.variant ?? 0;
  const seedKey = `${input.campaignId}::${input.storyType}${variant ? `::${variant}` : ""}`;
  const seed = seedFrom(seedKey);
  const looks: Record<string, CharacterLook> = {};
  input.characters.forEach((id, index) => {
    looks[id] = lookFor(id as CharacterId, seed, index + 1);
  });
  const palette = pick(seed, 101, PALETTES);
  return {
    seedKey,
    seed,
    variant,
    looks,
    tint: { colour: palette.colour, alpha: palette.alpha },
    paletteName: palette.name,
    opening: pick(seed, 202, OPENINGS[input.side]),
    cameraStyle: pick(seed, 303, CAMERA_STYLES),
    audioKey: pick(seed, 404, [-3, -2, 0, 2, 3, 5]),
  };
}

/* ------------------------------------------------------------- signature */

/** What "this film looks like" means, in one comparable line. */
export type VisualSignatureInput = {
  storyType: string;
  side: string;
  opening: OpeningId | string;
  cameraStyle: CameraStyleId | string;
  paletteName: string;
  environments: readonly string[];
  props: readonly string[];
  looks: Record<string, CharacterLook> | Record<string, { top: string; hair: string; skin: string }>;
  shots: readonly string[];
};

export function visualSignature(input: VisualSignatureInput): string {
  const wardrobe = Object.keys(input.looks)
    .sort()
    .map((id) => {
      const look = input.looks[id] as { top: string; hair: string; skin: string };
      return `${id}:${look.top}${look.hair}${look.skin}`;
    })
    .join(",");
  return [
    input.storyType,
    input.side,
    input.opening,
    input.cameraStyle,
    input.paletteName,
    [...input.environments].join(">"),
    [...new Set(input.props)].sort().join("+"),
    [...input.shots].join(">"),
    wardrobe,
  ].join("|");
}

/** A short comparable digest of the signature. */
export function signatureDigest(signature: string): string {
  return seedFrom(signature).toString(16).padStart(8, "0");
}

/**
 * How alike two films are, 0 (nothing in common) to 1 (the same film). Compared
 * field by field, so "same person, different place" still counts as close.
 */
export function similarity(a: string, b: string): number {
  const left = a.split("|");
  const right = b.split("|");
  const total = Math.max(left.length, right.length);
  let same = 0;
  for (let i = 0; i < total; i += 1) if (left[i] && left[i] === right[i]) same += 1;
  return same / total;
}

/** Anything at or above this reads to a viewer as the same film again. */
export const TOO_SIMILAR = 0.7;

/**
 * Picks the first casting pass that is not too close to a recently made film.
 * Deterministic: the same campaign with the same history always lands on the
 * same pass, and with no history it always uses its natural look.
 */
export function castingWithDiversity(input: {
  campaignId: string;
  storyType: string;
  characters: readonly string[];
  side: "renter" | "host" | "both";
  /** Signatures of recently generated browser films, newest first. */
  recentSignatures?: readonly string[];
  /** Everything except the casting, so a candidate can be scored. */
  describe: (casting: Casting) => VisualSignatureInput;
  passes?: number;
}): { casting: Casting; signature: string } {
  const recent = input.recentSignatures ?? [];
  const passes = input.passes ?? 6;
  let fallback: { casting: Casting; signature: string } | null = null;
  let best = 1;
  for (let variant = 0; variant < passes; variant += 1) {
    const casting = castingFor({ ...input, variant });
    const signature = visualSignature(input.describe(casting));
    const worst = recent.reduce((high, other) => Math.max(high, similarity(signature, other)), 0);
    if (worst < TOO_SIMILAR) return { casting, signature };
    if (worst < best) {
      best = worst;
      fallback = { casting, signature };
    }
  }
  return fallback ?? { casting: castingFor({ ...input, variant: 0 }), signature: "" };
}
