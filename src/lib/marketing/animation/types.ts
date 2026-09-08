/**
 * Free animated marketing engine — contracts.
 *
 * This layer turns an existing EarnRoom campaign story into a fully specified
 * animated scene plan. It owns no intelligence: what to say is decided by the
 * existing Marketing Intelligence, and this module only decides how to draw it.
 *
 * Pure module: no canvas, no DOM, no network, no clock.
 */
import type { AspectRatio, PlatformId } from "../types";

/** Palette slots. Values mirror the design tokens; never invented per campaign. */
export type Paint =
  | "ink"
  | "inkSoft"
  | "primary"
  | "primarySoft"
  | "canvas"
  | "surface"
  | "line"
  | "warning"
  | "success"
  | "white";

export type Shape =
  | {
      kind: "rect";
      x: number;
      y: number;
      w: number;
      h: number;
      radius?: number;
      fill?: Paint;
      stroke?: Paint;
      lineWidth?: number;
    }
  | {
      kind: "circle";
      x: number;
      y: number;
      r: number;
      fill?: Paint;
      stroke?: Paint;
      lineWidth?: number;
    }
  | {
      kind: "path";
      points: readonly { x: number; y: number }[];
      closed?: boolean;
      fill?: Paint;
      stroke?: Paint;
      lineWidth?: number;
    };

/** A reusable illustration, drawn inside a unit square (0..1 on both axes). */
export type Element = { id: string; shapes: readonly Shape[] };

export type Motion =
  | "none"
  | "fade"
  | "slide-left"
  | "slide-right"
  | "slide-up"
  | "rise"
  | "zoom"
  | "bounce"
  | "pop"
  | "reveal"
  | "map-zoom";

/**
 * The narrative job a scene does. Ordering of these roles is what gives every
 * campaign video a beginning, a middle and an end.
 */
export type SceneRole =
  | "problem"
  | "pain"
  | "solution"
  | "renter"
  | "host"
  | "both"
  | "endcard";

/** One illustration placed in a scene. Coordinates are fractions of the frame. */
export type SceneItem = {
  element: string;
  x: number;
  y: number;
  /** Width as a fraction of the frame width; height follows the element ratio. */
  size: number;
  motion: Motion;
  /** Seconds after the scene starts before this item animates in. */
  delay: number;
  /** 0 = far background, 1 = foreground. Drives parallax and camera response. */
  depth: number;
};

export type SceneText = {
  text: string;
  motion: Motion;
  emphasis: "hook" | "body" | "cta" | "brand";
};

/** A slow, deliberate camera move across the scene — never a random drift. */
export type CameraMove = {
  fromScale: number;
  toScale: number;
  /** Pan in fractions of the frame. */
  fromX: number;
  toX: number;
  fromY: number;
  toY: number;
};

/** Backdrop treatment. Consistent across a campaign, varied only in tone. */
export type SceneBackdrop = {
  base: Paint;
  tint: Paint;
  /** Soft shapes drifting behind the illustration, for depth. */
  motes: number;
  /** A faint horizon band, so a scene never reads as a flat slide. */
  horizon: boolean;
};

export type AnimatedScene = {
  index: number;
  role: SceneRole;
  seconds: number;
  background: Paint;
  backdrop: SceneBackdrop;
  camera: CameraMove;
  items: readonly SceneItem[];
  caption: SceneText;
  subCaption: SceneText | null;
  /** The narration line this scene is timed against, from the campaign story. */
  narration: string;
  /** Where the real EarnRoom artwork is drawn in this scene, if anywhere. */
  logo: "none" | "watermark" | "endcard";
  transition: "cut" | "fade";
};

/** Branding actually applied, after the platform's own rules are honoured. */
export type AppliedBranding = {
  platform: PlatformId;
  showWatermark: boolean;
  showEndCard: boolean;
  showWebsite: boolean;
  tagline: string | null;
  website: string | null;
  cta: string;
  /** Plain-English record of anything the platform's rules removed. */
  notes: readonly string[];
};

/** How the frame is composed for one aspect ratio. Not a crop of another. */
export type Composition = {
  aspect: AspectRatio;
  /** Safe area as fractions of the frame. */
  safe: { top: number; bottom: number; side: number };
  /** Vertical centre of the illustration stage. */
  stageY: number;
  stageScale: number;
  /** Vertical centre of the caption block. */
  captionY: number;
  hookScale: number;
  bodyScale: number;
  ctaScale: number;
  /** Longest caption line as a fraction of frame width. */
  textWidth: number;
  logoScale: number;
};

export type AnimatedPlan = {
  campaignId: string;
  assetId: string;
  platform: PlatformId;
  aspect: AspectRatio;
  width: number;
  height: number;
  fps: number;
  seconds: number;
  scenes: readonly AnimatedScene[];
  branding: AppliedBranding;
  composition: Composition;
  /** The official EarnRoom artwork, taken from the app's own asset pointers. */
  brand: {
    name: string;
    tagline: string;
    website: string;
    logoUrl: string;
    wordmarkUrl: string;
  };
  /** Stable digest of the plan, so a re-render can be recognised as identical. */
  digest: string;
};

export const FRAME_SIZES: Record<AspectRatio, { width: number; height: number }> = {
  // 720p-class frames: sharp on every platform, and small enough to send back
  // to the server in one request without a paid upload path.
  "9:16": { width: 720, height: 1280 },
  "1:1": { width: 720, height: 720 },
  "16:9": { width: 1280, height: 720 },
};

/**
 * Each aspect ratio is composed on its own terms — the tall frame gives the
 * illustration room above the caption, the square balances the two, and the
 * wide frame sets the caption low and keeps type smaller relative to width.
 */
export const COMPOSITIONS: Record<AspectRatio, Composition> = {
  "9:16": {
    aspect: "9:16",
    safe: { top: 0.12, bottom: 0.16, side: 0.08 },
    stageY: 0.4,
    stageScale: 1,
    captionY: 0.72,
    hookScale: 0.082,
    bodyScale: 0.062,
    ctaScale: 0.046,
    textWidth: 0.82,
    logoScale: 0.5,
  },
  "1:1": {
    aspect: "1:1",
    safe: { top: 0.09, bottom: 0.11, side: 0.08 },
    stageY: 0.38,
    stageScale: 0.92,
    captionY: 0.74,
    hookScale: 0.072,
    bodyScale: 0.056,
    ctaScale: 0.042,
    textWidth: 0.84,
    logoScale: 0.46,
  },
  "16:9": {
    aspect: "16:9",
    safe: { top: 0.09, bottom: 0.12, side: 0.07 },
    stageY: 0.42,
    stageScale: 0.7,
    captionY: 0.79,
    hookScale: 0.05,
    bodyScale: 0.04,
    ctaScale: 0.03,
    textWidth: 0.74,
    logoScale: 0.3,
  },
};
