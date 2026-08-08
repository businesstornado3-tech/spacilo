/**
 * Milestone 8 — camera modes.
 *
 * Presets are data, expressed relative to the room so they work in a 2.4m
 * loft and a 30m warehouse alike. A renderer converts them to world units;
 * nothing here knows what a camera object is.
 */
import { vec3, type CameraMode, type CameraPreset, type RoomShell, type Vec3 } from "./contracts";

export const CAMERA_PRESETS: Record<CameraMode, CameraPreset> = {
  perspective: {
    mode: "perspective",
    label: "Perspective",
    description: "Standing in the opening, looking in — how you first see the space.",
    position: vec3(0.5, 0.75, 1.85),
    target: vec3(0.5, 0.2, 0.45),
    fov: 45,
    orbit: true,
  },
  top_down: {
    mode: "top_down",
    label: "Top down",
    description: "Straight down on the floor plan, for walkways and footprints.",
    position: vec3(0.5, 2.6, 0.52),
    target: vec3(0.5, 0, 0.5),
    fov: 35,
    orbit: false,
  },
  isometric: {
    mode: "isometric",
    label: "Isometric",
    description: "The whole layout at a glance, with no perspective distortion.",
    position: vec3(1.7, 1.6, 1.7),
    target: vec3(0.5, 0.15, 0.5),
    fov: 30,
    orbit: true,
  },
  walkthrough: {
    mode: "walkthrough",
    label: "Walkthrough",
    description: "Eye level inside the space, to judge headroom and reach.",
    position: vec3(0.5, 0.68, 1.05),
    target: vec3(0.5, 0.6, 0),
    fov: 62,
    orbit: true,
  },
  orbit: {
    mode: "orbit",
    label: "Free orbit",
    description: "Drag to look from anywhere.",
    position: vec3(1.4, 1.1, 1.6),
    target: vec3(0.5, 0.2, 0.5),
    fov: 45,
    orbit: true,
  },
  host: {
    mode: "host",
    label: "Host view",
    description: "Occupancy and free capacity across the whole space.",
    position: vec3(0.5, 1.9, 1.5),
    target: vec3(0.5, 0.1, 0.5),
    fov: 40,
    orbit: true,
  },
  renter: {
    mode: "renter",
    label: "Renter view",
    description: "From the doorway, showing what you can reach and what fits.",
    position: vec3(0.5, 0.62, 1.55),
    target: vec3(0.5, 0.25, 0.35),
    fov: 52,
    orbit: true,
  },
};

export const CAMERA_MODES = Object.keys(CAMERA_PRESETS) as CameraMode[];

/** Converts a preset to metres for a given room. */
export function cameraPositionFor(preset: CameraPreset, room: RoomShell): Vec3 {
  const span = Math.max(room.widthM, room.depthM);
  return vec3(
    room.widthM * preset.position.x,
    Math.max(0.6, room.heightM * preset.position.y),
    room.depthM * preset.position.z + (preset.position.z > 1 ? span * 0.1 : 0),
  );
}

export function cameraTargetFor(preset: CameraPreset, room: RoomShell): Vec3 {
  return vec3(
    room.widthM * preset.target.x,
    room.heightM * preset.target.y,
    room.depthM * preset.target.z,
  );
}

/** A viewpoint the user chose to keep. */
export interface SavedViewpoint {
  id: string;
  label: string;
  mode: CameraMode;
  position: Vec3;
  target: Vec3;
  at: number;
}

export function saveViewpoint(
  saved: SavedViewpoint[],
  entry: Omit<SavedViewpoint, "at"> & { at?: number },
  limit = 6,
): SavedViewpoint[] {
  const next: SavedViewpoint = { ...entry, at: entry.at ?? Date.now() };
  return [next, ...saved.filter((item) => item.id !== next.id)].slice(0, limit);
}
