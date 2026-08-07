/**
 * Spacilo Digital Twin™ — data contracts (Phase 6, Milestone 1).
 *
 * The twin is the single visual truth of a space. It is renderer-independent
 * by construction: nothing here imports Three.js, React, or any GPU concept,
 * because the same twin must be able to drive an SVG plan today, a WebGL
 * scene now, and a WebXR/ARKit session later without a redesign.
 *
 * Conventions, fixed once so every consumer agrees:
 *   • Units are metres. Angles are degrees.
 *   • The origin is the back-left floor corner, looking in from the opening.
 *   • `x` runs left→right across the width, `z` runs back→front along the
 *     depth, `y` runs floor→ceiling. (Renderers may map these as they wish;
 *     the twin never assumes a handedness.)
 *   • Every object position is the centre of its footprint at its base.
 *
 * FUTURE HOOK — immersive targets. `TwinScene` carries everything a WebXR,
 * Vision Pro, Quest, ARKit or ARCore session needs: absolute metric geometry,
 * a stable object identity, and an anchor frame. A LiDAR room scan becomes a
 * `RoomShell` with `source: "scanned"`; live camera measurement becomes a
 * `TwinMeasurement` with its own confidence. No contract below changes.
 */
import type { IconKey, Placement, SpaceKind, StorageSpace, WeightClass } from "@/lib/spaceplanner/types";

export type { IconKey, SpaceKind, StorageSpace, WeightClass };

export const TWIN_CONTRACT_VERSION = "twin-1";
export const TWIN_ENGINE_ID = "spacilo-digital-twin-v1";

/* ------------------------------------------------------------ primitives */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Size3 {
  widthM: number;
  heightM: number;
  depthM: number;
}

/** Where an object is and how it sits. Everything animatable lives here. */
export interface TwinTransform {
  position: Vec3;
  /** Rotation about the vertical axis, in degrees. */
  rotationDeg: number;
  /** True when the object is stood on its edge rather than laid flat. */
  upright: boolean;
}

/* --------------------------------------------------------------- objects */

/**
 * A single body in the twin. `modelKey` selects a mesh recipe from the object
 * library; a renderer that has no recipe for it falls back to a proportioned
 * box, so an unknown item is never an error.
 */
export interface TwinObject {
  id: string;
  itemId: string;
  label: string;
  modelKey: string;
  icon: IconKey;
  size: Size3;
  transform: TwinTransform;
  /** Units this body represents — a stack of four boxes is one object. */
  units: number;
  /** 0 on the floor, 1 stacked once, and so on. */
  level: number;
  weight: WeightClass;
  fragile: boolean;
  /** Fixed bodies are part of the space (shelving, workbench) and never move. */
  fixed: boolean;
  zone: "back" | "middle" | "front";
}

/* ------------------------------------------------------------------ room */

export type RoomFeatureKind =
  | "shelving"
  | "workbench"
  | "roller_door"
  | "window"
  | "socket"
  | "light"
  | "floor_marking"
  | "pillar";

/** A built-in part of the space. Rendered, never packed. */
export interface RoomFeature {
  id: string;
  kind: RoomFeatureKind;
  label: string;
  /** Centre of the feature's footprint at its base, in metres. */
  position: Vec3;
  size: Size3;
  rotationDeg: number;
}

/**
 * The shell: geometry plus fixtures. `source` is deliberately explicit so a
 * surface can never present an estimate as a survey.
 */
export interface RoomShell {
  spaceId: string;
  name: string;
  kind: SpaceKind;
  widthM: number;
  depthM: number;
  heightM: number;
  doorWidthM: number;
  doorHeightM: number;
  features: RoomFeature[];
  source: "estimated" | "host_confirmed" | "scanned";
}

/* ----------------------------------------------------------------- scene */

export interface TwinScene {
  room: RoomShell;
  objects: TwinObject[];
  /** Walkway kept clear, as a footprint in metres, when the plan has one. */
  walkway: { x: number; z: number; widthM: number; depthM: number } | null;
  /** Monotonic version number; every committed change increments it. */
  version: number;
  label: string;
}

/* ------------------------------------------------------------- animation */

export type MotionKind =
  | "slide"
  | "rotate"
  | "stand_upright"
  | "lift"
  | "stack"
  | "settle";

/**
 * One explainable movement. A step without a reason cannot be constructed,
 * which is what stops the animation ever becoming decoration: if the engine
 * cannot say why an object moves, it does not move.
 */
export interface MotionStep {
  id: string;
  objectId: string;
  label: string;
  kind: MotionKind;
  from: TwinTransform;
  to: TwinTransform;
  /** Plain-English justification shown beside the moving object. */
  reason: string;
  /** The facts behind the reason. */
  evidence: string[];
  /** Milliseconds the movement should take. */
  durationMs: number;
  /** Milliseconds to wait after the previous step ends. */
  delayMs: number;
  confidence: number;
}

/** A caption tied to a real reasoning stage, never to a timer. */
export interface MotionCaption {
  id: string;
  text: string;
  /** Index of the first step this caption covers. */
  fromStep: number;
  /** Index of the last step this caption covers, inclusive. */
  toStep: number;
  confidence: number;
}

export interface MotionPlan {
  steps: MotionStep[];
  captions: MotionCaption[];
  totalMs: number;
}

/* ----------------------------------------------------------------- diffs */

export interface TwinChange {
  at: number;
  kind:
    | "scene_loaded"
    | "step_applied"
    | "step_reverted"
    | "object_added"
    | "object_removed"
    | "layout_committed"
    | "room_changed";
  detail: string;
  by: "engine" | "host" | "renter";
}

export interface TwinVersion {
  version: number;
  label: string;
  at: number;
  scene: TwinScene;
}

/* --------------------------------------------------------------- cameras */

export type CameraMode =
  | "perspective"
  | "top_down"
  | "isometric"
  | "walkthrough"
  | "orbit"
  | "host"
  | "renter";

export interface CameraPreset {
  mode: CameraMode;
  label: string;
  description: string;
  /** Camera position relative to the room centre, as multiples of room size. */
  position: Vec3;
  /** Where the camera looks, relative to the room, 0–1 on each axis. */
  target: Vec3;
  fov: number;
  /** True when the user may orbit freely from this preset. */
  orbit: boolean;
}

/* ---------------------------------------------------------- measurements */

/** FUTURE HOOK: LiDAR and live camera measurement land here, not in geometry. */
export interface TwinMeasurement {
  id: string;
  label: string;
  valueM: number;
  confidence: number;
  source: "host_confirmed" | "ai_estimated" | "scanned";
}

/* --------------------------------------------------------------- helpers */

export function vec3(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

/** Turns a planner placement into the twin's absolute frame. */
export function transformFromPlacement(placement: Placement, heightM: number): TwinTransform {
  return {
    position: vec3(placement.x + placement.w / 2, placement.level * heightM, placement.y + placement.d / 2),
    rotationDeg: placement.rotated ? 90 : 0,
    upright: placement.upright,
  };
}

export function sameTransform(a: TwinTransform, b: TwinTransform): boolean {
  return (
    Math.abs(a.position.x - b.position.x) < 0.005 &&
    Math.abs(a.position.y - b.position.y) < 0.005 &&
    Math.abs(a.position.z - b.position.z) < 0.005 &&
    a.rotationDeg === b.rotationDeg &&
    a.upright === b.upright
  );
}
