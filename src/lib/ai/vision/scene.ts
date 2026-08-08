/**
 * Stage 11 — scene understanding.
 *
 * Reads the structure of a space rather than the things in it: walls, doors
 * and their swing, windows, shelving, columns, walkways, lighting and access
 * restrictions — then turns that into a spatial map of accessible, vertical,
 * blocked and dead space that the Space Planner can pack against.
 *
 * The output is advisory. Hosts confirm their own measurements; nothing here
 * is presented as surveyed fact.
 */
import type { BackendSceneReading } from "./backends";
import type {
  ProcessedImage,
  SceneElement,
  SceneElementKind,
  SceneUnderstanding,
  SpatialMap,
  SpatialZone,
} from "./types";

const round1 = (value: number) => Math.round(value * 10) / 10;
const round2 = (value: number) => Math.round(value * 100) / 100;

function element(
  kind: SceneElementKind,
  label: string,
  sizeCm: number | null,
  confidence: number,
  explanation: string,
  suffix = "",
): SceneElement {
  return {
    id: `scene-${kind}${suffix}`,
    kind,
    label,
    sizeCm,
    confidence: round2(confidence),
    explanation,
  };
}

function zone(
  id: string,
  kind: SpatialZone["kind"],
  label: string,
  areaM2: number,
  heightCm: number,
  confidence: number,
  explanation: string,
): SpatialZone {
  return {
    id,
    kind,
    label,
    areaM2: round1(areaM2),
    heightCm: Math.round(heightCm),
    volumeM3: round1(areaM2 * (heightCm / 100)),
    confidence: round2(confidence),
    explanation,
  };
}

export function buildSceneUnderstanding(
  reading: BackendSceneReading,
  processed: ProcessedImage[],
  spaceType?: string,
): SceneUnderstanding {
  const floorAreaM2 = round1(reading.widthM * reading.depthM);
  // Access routes, the door swing and fixed obstacles typically cost a fifth.
  const doorSwingM2 = round1(Math.pow(reading.doorWidthCm / 100, 2) * 0.35);
  const walkwayM2 = round1((reading.walkwayWidthCm / 100) * reading.depthM);
  const obstacleM2 = round1(reading.obstacles * 0.5);
  const blockedAreaM2 = round1(Math.min(floorAreaM2 * 0.5, doorSwingM2 + obstacleM2));
  const deadSpaceM2 = round1(Math.min(floorAreaM2 * 0.12, 0.4 + reading.obstacles * 0.2));
  const usableFloorAreaM2 = round1(
    Math.max(0, floorAreaM2 - blockedAreaM2 - walkwayM2 - deadSpaceM2),
  );
  const shelfAreaM2 = round1(reading.shelfRuns * (reading.widthM * 0.4));
  const verticalStorageM3 = round1(
    shelfAreaM2 * Math.max(0, (reading.ceilingHeightCm - 100) / 100),
  );

  const confidence = round2(
    Math.min(
      0.92,
      reading.confidence * 0.8 +
        (processed.length > 1 ? 0.08 : 0) +
        (processed.every((entry) => !entry.blurred) ? 0.06 : 0),
    ),
  );

  const elements: SceneElement[] = [
    element("floor", "Floor area", Math.round(floorAreaM2 * 100), confidence, `Around ${floorAreaM2}m² from roughly ${reading.widthM}m × ${reading.depthM}m.`),
    element("ceiling", "Ceiling height", reading.ceilingHeightCm, confidence, "Estimated from the wall lines in frame."),
    element("wall", "Wall runs", null, confidence, "Straight vertical edges on more than one side."),
    element("door", "Door opening", reading.doorWidthCm, confidence * 0.95, "Estimated from the frame edges around the opening."),
    element("door_swing", "Door swing", Math.round(reading.doorWidthCm), confidence * 0.85, "Floor kept clear so the door can open fully."),
    element("walkway", "Access route", reading.walkwayWidthCm, confidence * 0.9, "Clear path kept between the door and the back wall."),
    element("lighting", `Lighting looks ${reading.lighting}`, null, confidence * 0.8, "Judged from the exposure across the frames."),
    element("floor", "Floor surface", null, confidence * 0.8, `Reads as a ${reading.floorType} floor.`, "-surface"),
  ];

  for (let i = 0; i < reading.shelfRuns; i += 1) {
    elements.push(
      element("shelving", `Shelf run ${i + 1}`, null, confidence * 0.88, "Repeated horizontal lines at even spacing.", `-${i + 1}`),
    );
  }
  for (let i = 0; i < reading.obstacles; i += 1) {
    elements.push(
      element("obstacle", `Obstacle ${i + 1}`, null, confidence * 0.8, "A fixed item that reduces the usable floor.", `-${i + 1}`),
    );
  }
  for (let i = 0; i < reading.windows; i += 1) {
    elements.push(
      element("window", `Window ${i + 1}`, null, confidence * 0.85, "Bright rectangular region on a wall run.", `-${i + 1}`),
    );
  }
  if (reading.doorWidthCm < 85) {
    elements.push(
      element("access_restriction", "Narrow opening", reading.doorWidthCm, confidence * 0.9, "Wide furniture may not pass through without dismantling."),
    );
  }

  const zones: SpatialZone[] = [
    zone("zone-accessible", "accessible", "Reachable floor", usableFloorAreaM2, Math.min(reading.ceilingHeightCm, 200), confidence, "Floor you can load and unload without moving anything else."),
    zone("zone-walkway", "blocked", "Access route", walkwayM2, reading.ceilingHeightCm, confidence * 0.9, "Kept clear so everything stays reachable."),
    zone("zone-dead", "dead", "Awkward corners", deadSpaceM2, reading.ceilingHeightCm, confidence * 0.75, "Corners too tight to use for anything sizeable."),
  ];
  if (shelfAreaM2 > 0) {
    zones.push(
      zone("zone-vertical", "vertical", "Shelving", shelfAreaM2, Math.max(0, reading.ceilingHeightCm - 100), confidence * 0.88, "Shelf runs add storage without taking floor."),
    );
  }
  if (reading.ceilingHeightCm > 240) {
    zones.push(
      zone("zone-potential", "potential", "Height above head level", usableFloorAreaM2 * 0.4, reading.ceilingHeightCm - 200, confidence * 0.7, "Tall ceiling leaves room to stack, with the right racking."),
    );
  }

  const spatial: SpatialMap = {
    floorAreaM2,
    usableFloorAreaM2,
    verticalStorageM3,
    accessibleAreaM2: usableFloorAreaM2,
    blockedAreaM2,
    deadSpaceM2,
    ceilingHeightCm: reading.ceilingHeightCm,
    zones,
    confidence,
  };

  const accessNotes: string[] = [
    `Opening measures roughly ${reading.doorWidthCm}cm across.`,
    `Access route about ${reading.walkwayWidthCm}cm wide.`,
  ];
  if (reading.doorWidthCm < 85) accessNotes.push("Check wide items will fit through the opening.");
  if (reading.lighting === "poor") accessNotes.push("Lighting is dim — a light makes loading easier.");

  const explanations = [
    `Clear floor estimated at ${usableFloorAreaM2}m² once access and obstacles are taken out.`,
    `Ceiling around ${round1(reading.ceilingHeightCm / 100)}m — tall items should stand upright.`,
    processed.length > 1
      ? `${processed.length} angles combined for a steadier reading.`
      : "Add a second angle for a steadier reading.",
  ];
  if (spaceType) explanations.push(`Assessed as a ${spaceType.replace(/-/g, " ")}.`);

  return {
    elements,
    spatial,
    floorType: reading.floorType,
    lighting: reading.lighting,
    accessNotes,
    confidence,
    explanations,
    photoIds: processed.map((entry) => entry.photoId),
  };
}
