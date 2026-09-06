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
  | { kind: "circle"; x: number; y: number; r: number; fill?: Paint; stroke?: Paint; lineWidth?: number }
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
};

export type SceneText = {
  text: string;
  motion: Motion;
  emphasis: "hook" | "body" | "cta" | "brand";
};

export type AnimatedScene = {
  index: number;
  seconds: number;
  background: Paint;
  items: readonly SceneItem[];
  caption: SceneText;
  subCaption: SceneText | null;
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
  /** Stable digest of the plan, so a re-render can be recognised as identical. */
  digest: string;
};

export const FRAME_SIZES: Record<AspectRatio, { width: number; height: number }> = {
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
  "16:9": { width: 1920, height: 1080 },
};
