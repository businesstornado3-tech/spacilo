/**
 * Milestone 3 — the EarnRoom garage shell.
 *
 * Derives a believable room from the measurements the platform already holds.
 * Nothing here is decorative for its own sake: shelving, a workbench and a
 * roller door are the fixtures that actually change how a space packs, so they
 * are modelled as real geometry rather than painted on.
 */
import type { StorageSpace } from "@/lib/spaceplanner/types";

import { vec3, type RoomFeature, type RoomShell } from "./contracts";

const round2 = (value: number) => Math.round(value * 100) / 100;

function shelving(space: StorageSpace): RoomFeature[] {
  // A run along the left wall, only where the wall is long enough to be useful.
  if (space.depth < 2.4 || space.width < 2) return [];
  const depthM = 0.45;
  const lengthM = round2(Math.min(space.depth - 0.6, 3.2));
  const heightM = round2(Math.min(space.height - 0.3, 2));
  return [
    {
      id: "shelving-left",
      kind: "shelving",
      label: "Wall shelving",
      position: vec3(round2(depthM / 2), 0, round2(0.3 + lengthM / 2)),
      size: { widthM: depthM, heightM, depthM: lengthM },
      rotationDeg: 0,
    },
  ];
}

function workbench(space: StorageSpace): RoomFeature[] {
  if (space.kind !== "garage" || space.width < 2.6) return [];
  const lengthM = round2(Math.min(space.width - 1, 1.8));
  return [
    {
      id: "workbench-back",
      kind: "workbench",
      label: "Workbench",
      position: vec3(round2(space.width - lengthM / 2 - 0.2), 0, 0.35),
      size: { widthM: lengthM, heightM: 0.9, depthM: 0.6 },
      rotationDeg: 0,
    },
  ];
}

function openings(space: StorageSpace): RoomFeature[] {
  const doorHeightM = round2(Math.min(space.height - 0.15, 2.1));
  const features: RoomFeature[] = [
    {
      id: "door-front",
      kind: space.kind === "garage" ? "roller_door" : "window",
      label: space.kind === "garage" ? "Roller door" : "Entrance",
      position: vec3(round2(space.width / 2), 0, round2(space.depth)),
      size: { widthM: space.doorWidth, heightM: doorHeightM, depthM: 0.08 },
      rotationDeg: 0,
    },
  ];
  if (space.kind === "garage" && space.depth > 3) {
    features.push({
      id: "window-right",
      kind: "window",
      label: "Side window",
      position: vec3(round2(space.width), round2(space.height * 0.62), round2(space.depth * 0.35)),
      size: { widthM: 0.06, heightM: 0.5, depthM: 0.7 },
      rotationDeg: 0,
    });
  }
  return features;
}

function services(space: StorageSpace): RoomFeature[] {
  const lights: RoomFeature[] = [];
  const runs = space.depth > 5 ? 2 : 1;
  for (let index = 0; index < runs; index += 1) {
    lights.push({
      id: `light-${index}`,
      kind: "light",
      label: "Strip light",
      position: vec3(
        round2(space.width / 2),
        round2(space.height - 0.12),
        round2(((index + 1) * space.depth) / (runs + 1)),
      ),
      size: { widthM: 0.12, heightM: 0.08, depthM: round2(Math.min(1.2, space.depth / 3)) },
      rotationDeg: 0,
    });
  }
  return [
    ...lights,
    {
      id: "socket-back",
      kind: "socket",
      label: "Power socket",
      position: vec3(round2(space.width - 0.35), 0.4, 0.04),
      size: { widthM: 0.14, heightM: 0.09, depthM: 0.03 },
      rotationDeg: 0,
    },
  ];
}

function markings(space: StorageSpace, walkwayWidthM: number): RoomFeature[] {
  if (walkwayWidthM <= 0) return [];
  return [
    {
      id: "marking-walkway",
      kind: "floor_marking",
      label: "Keep-clear walkway",
      position: vec3(round2(space.width / 2), 0.001, round2(space.depth / 2)),
      size: { widthM: walkwayWidthM, heightM: 0.002, depthM: space.depth },
      rotationDeg: 0,
    },
  ];
}

export interface RoomShellOptions {
  /** Width of the keep-clear strip drawn on the floor, in metres. */
  walkwayWidthM?: number;
  /** Where the measurements came from. Defaults to an honest estimate. */
  source?: RoomShell["source"];
  /** Set false to model a bare shell with no fixtures. */
  fixtures?: boolean;
}

/** Builds the shell for a space. Deterministic: same space, same room. */
export function buildRoomShell(space: StorageSpace, options: RoomShellOptions = {}): RoomShell {
  const { walkwayWidthM = 0.7, source = "estimated", fixtures = true } = options;
  const features = fixtures
    ? [
        ...shelving(space),
        ...workbench(space),
        ...openings(space),
        ...services(space),
        ...markings(space, walkwayWidthM),
      ]
    : openings(space);

  return {
    spaceId: space.id,
    name: space.name,
    kind: space.kind,
    widthM: space.width,
    depthM: space.depth,
    heightM: space.height,
    doorWidthM: space.doorWidth,
    doorHeightM: round2(Math.min(space.height - 0.15, 2.1)),
    features,
    source,
  };
}

/** Footprints fixtures occupy on the floor, so packing never overlaps them. */
export function fixtureFootprints(room: RoomShell): Array<{ x: number; z: number; w: number; d: number }> {
  return room.features
    .filter((feature) => feature.kind === "shelving" || feature.kind === "workbench")
    .map((feature) => ({
      x: feature.position.x - feature.size.widthM / 2,
      z: feature.position.z - feature.size.depthM / 2,
      w: feature.size.widthM,
      d: feature.size.depthM,
    }));
}
