/**
 * Demo storage spaces.
 *
 * These are representative UK space types with cautious usable dimensions —
 * they are not real listings and never claim to be. Real listings carry the
 * host's own measurements and EarnRoom AI estimates.
 */
import type { StorageSpace } from "./types";

/** Share of the cube that is realistically usable once access is preserved. */
export const USABLE_VOLUME_FACTOR = 0.78;

/** Nothing is stacked above this height in the demo, whatever the ceiling. */
export const MAX_STACK_HEIGHT_M = 2.2;

export const DEMO_SPACES: StorageSpace[] = [
  {
    id: "garage",
    name: "Single garage",
    kind: "garage",
    width: 2.6,
    depth: 5.2,
    height: 2.3,
    door: "front",
    doorWidth: 2.2,
    blurb: "The classic UK lock-up — deep, tall and easy to load.",
  },
  {
    id: "bedroom",
    name: "Spare bedroom",
    kind: "bedroom",
    width: 3,
    depth: 3.4,
    height: 2.4,
    door: "front",
    doorWidth: 0.8,
    blurb: "Dry, heated and inside the home, with a narrow doorway.",
  },
  {
    id: "container",
    name: "Shipping container",
    kind: "container",
    width: 2.3,
    depth: 6,
    height: 2.4,
    door: "front",
    doorWidth: 2.3,
    blurb: "Full-width doors and a weather-tight steel shell.",
  },
  {
    id: "warehouse",
    name: "Warehouse bay",
    kind: "warehouse",
    width: 6,
    depth: 8,
    height: 4,
    door: "front",
    doorWidth: 3.5,
    blurb: "Large-volume space for a whole household or business stock.",
  },
  {
    id: "loft",
    name: "Loft space",
    kind: "loft",
    width: 3.2,
    depth: 4,
    height: 1.7,
    door: "front",
    doorWidth: 0.7,
    blurb: "Low headroom and a hatch, so light items only.",
  },
  {
    id: "shed",
    name: "Garden shed",
    kind: "shed",
    width: 2.1,
    depth: 3,
    height: 2,
    door: "front",
    doorWidth: 0.9,
    blurb: "Outdoor timber store for garden and leisure kit.",
  },
  {
    id: "commercial",
    name: "Commercial unit",
    kind: "commercial",
    width: 4.5,
    depth: 6,
    height: 3,
    door: "front",
    doorWidth: 2.6,
    blurb: "Roller-shutter unit with room for a vehicle-loaded move.",
  },
  {
    id: "storage-room",
    name: "Storage room",
    kind: "storage_room",
    width: 2.4,
    depth: 2.8,
    height: 2.4,
    door: "front",
    doorWidth: 0.9,
    blurb: "A dedicated internal room, secure and out of the way.",
  },
  {
    id: "parking",
    name: "Parking space",
    kind: "parking",
    width: 2.4,
    depth: 4.8,
    height: 2.1,
    door: "front",
    doorWidth: 2.4,
    blurb: "Open bay suited to vehicles, trailers and covered loads.",
  },
];

export const SPACE_BY_ID = new Map(DEMO_SPACES.map((space) => [space.id, space]));

/** Cubic metres a visitor can realistically fill in this space. */
export function usableVolume(space: StorageSpace): number {
  const stackHeight = Math.min(space.height, MAX_STACK_HEIGHT_M);
  return Math.round(space.width * space.depth * stackHeight * USABLE_VOLUME_FACTOR * 100) / 100;
}

/** Depth of the access strip kept clear in front of the door, in metres. */
export function walkwayDepth(space: StorageSpace): number {
  if (space.depth < 2.4) return 0;
  return space.depth >= 5 ? 1 : 0.8;
}
