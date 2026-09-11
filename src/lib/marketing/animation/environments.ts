/**
 * Browser Local environment library.
 *
 * Each environment is three layers of plain geometry — background, midground
 * and foreground — expressed in fractions of the frame. The renderer moves the
 * layers at slightly different speeds during a camera move, which is what gives
 * the video its 2.5D depth without any 3D engine or licensed artwork.
 *
 * Pure module: geometry only.
 */

export type EnvironmentId =
  | "ENV_HOME_LIVING_ROOM"
  | "ENV_MOVING_DAY"
  | "ENV_GARAGE"
  | "ENV_SPARE_ROOM"
  | "ENV_STORAGE_SPACE"
  | "ENV_STREET"
  | "ENV_MAP"
  | "ENV_PHONE_UI"
  | "ENV_CLOSING_BRAND";

export type EnvShape =
  | {
      kind: "rect";
      x: number;
      y: number;
      w: number;
      h: number;
      radius?: number;
      fill?: string;
      stroke?: string;
      lineWidth?: number;
    }
  | {
      kind: "circle";
      x: number;
      y: number;
      r: number;
      fill?: string;
      stroke?: string;
      lineWidth?: number;
    }
  | {
      kind: "path";
      points: readonly { x: number; y: number }[];
      closed?: boolean;
      fill?: string;
      stroke?: string;
      lineWidth?: number;
    };

export type Environment = {
  id: EnvironmentId;
  /** Where the floor sits, as a fraction of frame height. Characters stand here. */
  ground: number;
  /** Top and bottom of the ambient wash behind everything. */
  sky: readonly [string, string];
  back: readonly EnvShape[];
  mid: readonly EnvShape[];
  fore: readonly EnvShape[];
};

const WALL = "#e9efec";
const WALL_DEEP = "#dfe7e3";
const FLOOR = "#cbb79e";
const FLOOR_DARK = "#b8a289";
const CARD = "#f7faf8";
const LINE = "#c6d2cd";
const BOX = "#d7a86a";
const BOX_DARK = "#c1904f";
const TEAL = "#128a68";
const TEAL_SOFT = "#cdeadf";
const INK = "#1d2733";

function floor(ground: number, fill = FLOOR): EnvShape[] {
  return [
    { kind: "rect", x: 0, y: ground, w: 1, h: 1 - ground, fill },
    { kind: "rect", x: 0, y: ground, w: 1, h: 0.006, fill: FLOOR_DARK },
  ];
}

function crate(x: number, y: number, w: number, h: number, fill = BOX): EnvShape[] {
  return [
    { kind: "rect", x, y, w, h, radius: 0.006, fill },
    { kind: "rect", x, y, w, h: h * 0.16, fill: BOX_DARK },
    { kind: "rect", x: x + w / 2 - 0.004, y, w: 0.008, h, fill: BOX_DARK },
  ];
}

function shelving(x: number, y: number, w: number, h: number): EnvShape[] {
  const shelves: EnvShape[] = [
    { kind: "rect", x, y, w: 0.012, h, fill: "#9aa7a2" },
    { kind: "rect", x: x + w - 0.012, y, w: 0.012, h, fill: "#9aa7a2" },
  ];
  for (let i = 0; i < 3; i += 1) {
    shelves.push({ kind: "rect", x, y: y + (h / 3) * i, w, h: 0.012, fill: "#b3bfba" });
  }
  return shelves;
}

const ENVIRONMENTS: Record<EnvironmentId, Environment> = {
  ENV_HOME_LIVING_ROOM: {
    id: "ENV_HOME_LIVING_ROOM",
    ground: 0.74,
    sky: ["#f7faf8", "#e6eeea"],
    back: [
      { kind: "rect", x: 0, y: 0, w: 1, h: 0.74, fill: WALL },
      {
        kind: "rect",
        x: 0.08,
        y: 0.16,
        w: 0.26,
        h: 0.3,
        radius: 0.01,
        fill: "#dceaf2",
        stroke: LINE,
        lineWidth: 0.004,
      },
      { kind: "rect", x: 0.2, y: 0.16, w: 0.006, h: 0.3, fill: LINE },
      ...floor(0.74),
    ],
    mid: [
      { kind: "rect", x: 0.56, y: 0.5, w: 0.34, h: 0.16, radius: 0.02, fill: TEAL_SOFT },
      { kind: "rect", x: 0.56, y: 0.6, w: 0.34, h: 0.14, radius: 0.02, fill: "#b9dbcd" },
      { kind: "rect", x: 0.6, y: 0.74, w: 0.02, h: 0.04, fill: INK },
      { kind: "rect", x: 0.84, y: 0.74, w: 0.02, h: 0.04, fill: INK },
    ],
    fore: [...crate(0.06, 0.62, 0.13, 0.12), ...crate(0.2, 0.66, 0.11, 0.08)],
  },

  ENV_MOVING_DAY: {
    id: "ENV_MOVING_DAY",
    ground: 0.76,
    sky: ["#f4f8f6", "#e2ebe7"],
    back: [
      { kind: "rect", x: 0, y: 0, w: 1, h: 0.76, fill: WALL_DEEP },
      {
        kind: "rect",
        x: 0.62,
        y: 0.24,
        w: 0.24,
        h: 0.52,
        radius: 0.01,
        fill: "#cfe0d9",
        stroke: LINE,
        lineWidth: 0.004,
      },
      ...floor(0.76),
    ],
    mid: [
      ...crate(0.08, 0.5, 0.16, 0.26),
      ...crate(0.24, 0.58, 0.13, 0.18),
      ...crate(0.1, 0.36, 0.12, 0.14, "#e0b884"),
    ],
    fore: [...crate(0.78, 0.6, 0.17, 0.16), ...crate(0.8, 0.46, 0.13, 0.14, "#e0b884")],
  },

  ENV_GARAGE: {
    id: "ENV_GARAGE",
    ground: 0.78,
    sky: ["#eef2f1", "#dde5e2"],
    back: [
      { kind: "rect", x: 0, y: 0, w: 1, h: 0.78, fill: "#dce4e1" },
      {
        kind: "rect",
        x: 0.14,
        y: 0.14,
        w: 0.72,
        h: 0.64,
        radius: 0.01,
        fill: "#c9d4d0",
        stroke: "#a9b7b2",
        lineWidth: 0.004,
      },
      { kind: "rect", x: 0.14, y: 0.14, w: 0.72, h: 0.1, fill: "#bcc9c4" },
      { kind: "rect", x: 0.14, y: 0.3, w: 0.72, h: 0.01, fill: "#aebcb7" },
      { kind: "rect", x: 0.14, y: 0.46, w: 0.72, h: 0.01, fill: "#aebcb7" },
      { kind: "rect", x: 0.14, y: 0.62, w: 0.72, h: 0.01, fill: "#aebcb7" },
      ...floor(0.78, "#b9c2be"),
    ],
    mid: [
      ...shelving(0.64, 0.4, 0.24, 0.38),
      ...crate(0.66, 0.52, 0.09, 0.1),
      ...crate(0.77, 0.66, 0.09, 0.1),
    ],
    fore: [...crate(0.1, 0.64, 0.14, 0.14)],
  },

  ENV_SPARE_ROOM: {
    id: "ENV_SPARE_ROOM",
    ground: 0.75,
    sky: ["#f8fbf9", "#e8f0ec"],
    back: [
      { kind: "rect", x: 0, y: 0, w: 1, h: 0.75, fill: CARD },
      {
        kind: "rect",
        x: 0.66,
        y: 0.18,
        w: 0.24,
        h: 0.28,
        radius: 0.01,
        fill: "#dceaf2",
        stroke: LINE,
        lineWidth: 0.004,
      },
      ...floor(0.75, "#d8c7ae"),
    ],
    mid: [
      {
        kind: "rect",
        x: 0.1,
        y: 0.52,
        w: 0.26,
        h: 0.23,
        radius: 0.02,
        fill: "#e3e9ec",
        stroke: LINE,
        lineWidth: 0.004,
      },
      { kind: "rect", x: 0.12, y: 0.48, w: 0.1, h: 0.06, radius: 0.02, fill: "#ffffff" },
    ],
    fore: [...crate(0.42, 0.66, 0.11, 0.09)],
  },

  ENV_STORAGE_SPACE: {
    id: "ENV_STORAGE_SPACE",
    ground: 0.78,
    sky: ["#f2f6f4", "#e2ebe7"],
    back: [{ kind: "rect", x: 0, y: 0, w: 1, h: 0.78, fill: WALL_DEEP }, ...floor(0.78, "#c2cbc7")],
    mid: [
      ...shelving(0.08, 0.34, 0.34, 0.44),
      ...crate(0.1, 0.46, 0.12, 0.12),
      ...crate(0.26, 0.6, 0.12, 0.12),
      ...shelving(0.58, 0.34, 0.34, 0.44),
      ...crate(0.6, 0.6, 0.12, 0.12),
      ...crate(0.76, 0.46, 0.12, 0.12),
    ],
    fore: [],
  },

  ENV_STREET: {
    id: "ENV_STREET",
    ground: 0.8,
    sky: ["#e8f2f6", "#dbe9ee"],
    back: [
      { kind: "rect", x: 0.04, y: 0.3, w: 0.24, h: 0.5, fill: "#d5e0dc" },
      {
        kind: "path",
        points: [
          { x: 0.04, y: 0.3 },
          { x: 0.16, y: 0.2 },
          { x: 0.28, y: 0.3 },
        ],
        closed: true,
        fill: "#bccac5",
      },
      { kind: "rect", x: 0.34, y: 0.36, w: 0.26, h: 0.44, fill: "#e0e9e5" },
      {
        kind: "path",
        points: [
          { x: 0.34, y: 0.36 },
          { x: 0.47, y: 0.26 },
          { x: 0.6, y: 0.36 },
        ],
        closed: true,
        fill: "#c6d3ce",
      },
      { kind: "rect", x: 0.66, y: 0.32, w: 0.28, h: 0.48, fill: "#d5e0dc" },
      {
        kind: "path",
        points: [
          { x: 0.66, y: 0.32 },
          { x: 0.8, y: 0.22 },
          { x: 0.94, y: 0.32 },
        ],
        closed: true,
        fill: "#bccac5",
      },
      ...floor(0.8, "#c9cfcc"),
    ],
    mid: [
      { kind: "rect", x: 0.1, y: 0.52, w: 0.06, h: 0.1, fill: "#dceaf2" },
      { kind: "rect", x: 0.4, y: 0.5, w: 0.07, h: 0.1, fill: "#dceaf2" },
      { kind: "rect", x: 0.74, y: 0.48, w: 0.07, h: 0.1, fill: "#dceaf2" },
    ],
    fore: [{ kind: "rect", x: 0, y: 0.86, w: 1, h: 0.02, fill: "#b6bfbb" }],
  },

  ENV_MAP: {
    id: "ENV_MAP",
    ground: 0.86,
    sky: ["#eef5f2", "#dfeae5"],
    back: [
      {
        kind: "rect",
        x: 0.06,
        y: 0.16,
        w: 0.88,
        h: 0.6,
        radius: 0.03,
        fill: "#e7efeb",
        stroke: LINE,
        lineWidth: 0.004,
      },
      { kind: "rect", x: 0.06, y: 0.36, w: 0.88, h: 0.02, fill: "#d3dedb" },
      { kind: "rect", x: 0.06, y: 0.58, w: 0.88, h: 0.02, fill: "#d3dedb" },
      { kind: "rect", x: 0.36, y: 0.16, w: 0.02, h: 0.6, fill: "#d3dedb" },
      { kind: "rect", x: 0.68, y: 0.16, w: 0.02, h: 0.6, fill: "#d3dedb" },
    ],
    mid: [
      { kind: "circle", x: 0.3, y: 0.44, r: 0.05, fill: TEAL_SOFT },
      { kind: "circle", x: 0.62, y: 0.6, r: 0.045, fill: TEAL_SOFT },
    ],
    fore: [],
  },

  ENV_PHONE_UI: {
    id: "ENV_PHONE_UI",
    ground: 0.9,
    sky: ["#f4f8f6", "#e4ece9"],
    back: [{ kind: "rect", x: 0.24, y: 0.1, w: 0.52, h: 0.76, radius: 0.06, fill: INK }],
    mid: [
      { kind: "rect", x: 0.265, y: 0.13, w: 0.47, h: 0.7, radius: 0.045, fill: CARD },
      { kind: "rect", x: 0.3, y: 0.2, w: 0.4, h: 0.06, radius: 0.03, fill: "#e6eeea" },
      { kind: "rect", x: 0.3, y: 0.31, w: 0.4, h: 0.13, radius: 0.02, fill: "#e9f3ee" },
      { kind: "rect", x: 0.3, y: 0.47, w: 0.4, h: 0.13, radius: 0.02, fill: "#e9f3ee" },
      { kind: "rect", x: 0.3, y: 0.63, w: 0.4, h: 0.13, radius: 0.02, fill: "#e9f3ee" },
    ],
    fore: [
      { kind: "circle", x: 0.35, y: 0.375, r: 0.026, fill: TEAL },
      { kind: "circle", x: 0.35, y: 0.535, r: 0.026, fill: TEAL },
      { kind: "circle", x: 0.35, y: 0.695, r: 0.026, fill: TEAL },
    ],
  },

  ENV_CLOSING_BRAND: {
    id: "ENV_CLOSING_BRAND",
    ground: 0.92,
    sky: ["#0f6a52", "#128a68"],
    back: [],
    mid: [
      { kind: "circle", x: 0.18, y: 0.22, r: 0.16, fill: "rgba(255,255,255,0.06)" },
      { kind: "circle", x: 0.84, y: 0.78, r: 0.2, fill: "rgba(255,255,255,0.05)" },
    ],
    fore: [],
  },
};

export const ENVIRONMENT_IDS = Object.keys(ENVIRONMENTS) as EnvironmentId[];

export function hasEnvironment(id: string): id is EnvironmentId {
  return Object.prototype.hasOwnProperty.call(ENVIRONMENTS, id);
}

export function environment(id: EnvironmentId): Environment {
  const found = ENVIRONMENTS[id];
  if (!found) throw new Error(`Unknown environment: ${id}`);
  return found;
}

/** Registration point for future environments. */
export function addEnvironment(env: Environment): void {
  ENVIRONMENTS[env.id] = env;
}
