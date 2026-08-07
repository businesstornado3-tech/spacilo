/**
 * Data for the signature Spacilo hero animation: one realistic UK residential
 * garage, the belongings a real household keeps in it, and where Spacilo AI
 * moves each of them.
 *
 * This module is pure data — no React, no AI, no network. It exists on its own
 * so the same scene can later drive host onboarding, marketing pages and the
 * investor demo without importing homepage code.
 */

export type GarageObjectKind =
  | "road-bike"
  | "mountain-bike"
  | "television"
  | "wardrobe"
  | "mattress"
  | "desk"
  | "suitcase"
  | "medium-box"
  | "large-box"
  | "tool-chest"
  | "golf-clubs"
  | "camping"
  | "christmas"
  | "sports"
  | "vacuum"
  | "ladder"
  | "bin"
  | "mower"
  | "stroller"
  | "chairs";

export interface GaragePose {
  /** Baseline centre of the object in scene units. */
  x: number;
  y: number;
  /** Depth scale — objects nearer the viewer are larger. */
  scale: number;
  /** Degrees, positive clockwise. */
  rotate: number;
}

export interface GarageObject {
  id: string;
  kind: GarageObjectKind;
  label: string;
  /** Naturally cluttered starting pose. */
  before: GaragePose;
  /** Optimised pose once the planner reaches `step`. */
  after: GaragePose;
  /** Narration step at which this object settles into place. */
  step: number;
}

/** Narration beats. Each names a real part of the planning pass. */
export interface GarageBeat {
  id: string;
  label: string;
  /** Milliseconds this beat holds. */
  ms: number;
  /** Usable floor space reclaimed by the end of this beat, as a percentage. */
  clear: number;
}

export const GARAGE_BEATS: GarageBeat[] = [
  { id: "idle", label: "Your garage today", ms: 2000, clear: 8 },
  { id: "dimensions", label: "Scanning room dimensions…", ms: 1150, clear: 8 },
  { id: "recognise", label: "Recognising stored belongings…", ms: 1150, clear: 15 },
  { id: "walls", label: "Finding unused wall space…", ms: 1300, clear: 24 },
  { id: "group", label: "Grouping similar belongings…", ms: 1300, clear: 33 },
  { id: "safest", label: "Calculating safest arrangement…", ms: 1300, clear: 41 },
  { id: "vertical", label: "Optimising vertical storage…", ms: 1300, clear: 48 },
  { id: "fragile", label: "Protecting fragile belongings…", ms: 1200, clear: 51 },
  { id: "walkway", label: "Maintaining walkway access…", ms: 1200, clear: 54 },
  { id: "checks", label: "Final safety checks…", ms: 1000, clear: 54 },
  { id: "done", label: "Storage optimisation complete.", ms: 4200, clear: 54 },
];

export const GARAGE_FINAL_CLEAR = GARAGE_BEATS.at(-1)!.clear;
export const GARAGE_START_CLEAR = GARAGE_BEATS[0]!.clear;
/** Index of the beat where the optimised state is presented. */
export const GARAGE_DONE_INDEX = GARAGE_BEATS.length - 1;

/**
 * Scene coordinate space. The back wall occupies the upper band, the concrete
 * floor recedes below it, and the viewer stands just inside the garage door.
 */
export const GARAGE_VIEWBOX = { width: 1000, height: 620 } as const;
export const GARAGE_HORIZON = 372;

const p = (x: number, y: number, scale = 1, rotate = 0): GaragePose => ({ x, y, scale, rotate });

/**
 * Every belonging in the scene. `before` is believable clutter — things left
 * where they were last dropped. `after` is wall-mounted, shelved, grouped and
 * pushed back, with the centre of the floor kept walkable.
 */
export const GARAGE_OBJECTS: GarageObject[] = [
  // — Wall mounting ————————————————————————————————————————————————
  {
    id: "road-bike",
    kind: "road-bike",
    label: "Road bike",
    before: p(300, 560, 1, -6),
    after: p(120, 232, 0.72, -90),
    step: 3,
  },
  {
    id: "mountain-bike",
    kind: "mountain-bike",
    label: "Mountain bike",
    before: p(470, 606, 1.05, 4),
    after: p(232, 232, 0.72, -90),
    step: 3,
  },
  {
    id: "ladder",
    kind: "ladder",
    label: "Ladder",
    before: p(690, 590, 1, -14),
    after: p(966, 372, 0.95, 0),
    step: 3,
  },

  // — Shelving ——————————————————————————————————————————————————————
  {
    id: "box-1",
    kind: "medium-box",
    label: "Medium box",
    before: p(360, 520, 0.9, -5),
    after: p(78, 300, 0.6, 0),
    step: 6,
  },
  {
    id: "box-2",
    kind: "medium-box",
    label: "Medium box",
    before: p(415, 545, 0.95, 7),
    after: p(140, 300, 0.6, 0),
    step: 6,
  },
  {
    id: "box-3",
    kind: "large-box",
    label: "Large box",
    before: p(560, 545, 1, -3),
    after: p(214, 300, 0.62, 0),
    step: 6,
  },
  {
    id: "christmas",
    kind: "christmas",
    label: "Christmas decorations",
    before: p(230, 520, 0.9, 8),
    after: p(78, 236, 0.58, 0),
    step: 6,
  },
  {
    id: "sports",
    kind: "sports",
    label: "Sports equipment",
    before: p(760, 520, 0.9, -8),
    after: p(150, 236, 0.58, 0),
    step: 4,
  },
  {
    id: "bin-1",
    kind: "bin",
    label: "Storage bin",
    before: p(640, 480, 0.8, 5),
    after: p(222, 236, 0.58, 0),
    step: 4,
  },
  {
    id: "bin-2",
    kind: "bin",
    label: "Storage bin",
    before: p(520, 470, 0.75, -6),
    after: p(60, 372, 0.72, 0),
    step: 4,
  },
  {
    id: "box-4",
    kind: "large-box",
    label: "Large box",
    before: p(300, 480, 0.8, 4),
    after: p(140, 372, 0.74, 0),
    step: 6,
  },

  // — Grouped along the back wall ————————————————————————————————
  {
    id: "wardrobe",
    kind: "wardrobe",
    label: "Wardrobe",
    before: p(410, 470, 0.86, -4),
    after: p(320, 372, 0.86, 0),
    step: 4,
  },
  {
    id: "mattress",
    kind: "mattress",
    label: "Mattress",
    before: p(560, 618, 1.05, -84),
    after: p(404, 372, 0.86, 0),
    step: 6,
  },
  {
    id: "desk",
    kind: "desk",
    label: "Desk",
    before: p(700, 540, 0.95, 6),
    after: p(500, 372, 0.8, 0),
    step: 5,
  },
  {
    id: "television",
    kind: "television",
    label: "Television",
    before: p(520, 590, 1, -9),
    after: p(872, 300, 0.62, 0),
    step: 7,
  },
  {
    id: "suitcase-1",
    kind: "suitcase",
    label: "Suitcase",
    before: p(250, 590, 1, 10),
    after: p(566, 372, 0.72, 0),
    step: 4,
  },
  {
    id: "suitcase-2",
    kind: "suitcase",
    label: "Suitcase",
    before: p(620, 610, 1.05, -7),
    after: p(614, 372, 0.72, 0),
    step: 4,
  },
  {
    id: "camping",
    kind: "camping",
    label: "Camping equipment",
    before: p(790, 590, 1, 9),
    after: p(668, 372, 0.72, 0),
    step: 4,
  },
  {
    id: "golf",
    kind: "golf-clubs",
    label: "Golf clubs",
    before: p(360, 600, 1, -70),
    after: p(716, 372, 0.78, 0),
    step: 5,
  },
  {
    id: "chairs",
    kind: "chairs",
    label: "Folding chairs",
    before: p(830, 560, 0.9, -22),
    after: p(756, 372, 0.74, 0),
    step: 5,
  },
  {
    id: "vacuum",
    kind: "vacuum",
    label: "Vacuum cleaner",
    before: p(430, 610, 1, 12),
    after: p(792, 372, 0.7, 0),
    step: 5,
  },

  // — Under the workbench and out of the walkway ————————————————
  {
    id: "tool-chest",
    kind: "tool-chest",
    label: "Tool chest",
    before: p(190, 560, 0.95, -6),
    after: p(872, 372, 0.78, 0),
    step: 8,
  },
  {
    id: "mower",
    kind: "mower",
    label: "Lawn mower",
    before: p(560, 500, 0.85, 8),
    after: p(236, 372, 0.8, 0),
    step: 8,
  },
  {
    id: "stroller",
    kind: "stroller",
    label: "Baby stroller",
    before: p(700, 615, 1.05, -10),
    after: p(944, 300, 0.6, 0),
    step: 8,
  },
];

/** Objects settle a little apart from one another, so nothing teleports. */
export function objectDelayMs(index: number): number {
  return (index % 7) * 110;
}
