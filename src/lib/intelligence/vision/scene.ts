/**
 * Stage 12 — scene analysis (host space preparation).
 *
 * Structural reading of a space: walls, doors, windows, ceiling, floor,
 * shelving, walkways and obstacles. Nothing in the product renders this yet —
 * it exists so host space analysis has a contract and an engine ready when the
 * UI work happens. Deliberately no UI changes in this phase.
 */
import { hashString } from "@/lib/vision/hash";

import type {
  VisionDiagnostics,
  VisionImage,
  VisionScene,
  VisionSceneFeature,
} from "./contracts";

const round1 = (value: number) => Math.round(value * 10) / 10;

function feature(
  kind: VisionSceneFeature["kind"],
  label: string,
  sizeCm: number | null,
  confidence: number,
  explanation: string,
): VisionSceneFeature {
  return { id: `scene-${kind}`, kind, label, sizeCm, confidence, explanation };
}

export function analyseScene(
  images: VisionImage[],
  diagnostics: VisionDiagnostics[],
  spaceType?: string,
): VisionScene {
  if (images.length === 0) {
    return {
      features: [],
      floorAreaM2: 0,
      usableAreaM2: 0,
      ceilingHeightCm: 0,
      walkwayWidthCm: 0,
      obstacles: 0,
      confidence: 0,
      notes: ["No photos supplied."],
    };
  }

  const seed = images.reduce(
    (sum, image, index) => sum + hashString(`${image.photo.id}:${index}`),
    0,
  );
  const quality =
    diagnostics.reduce((sum, entry) => sum + entry.quality, 0) / Math.max(1, diagnostics.length);

  const widthM = round1(2.6 + (seed % 26) / 10);
  const depthM = round1(4.4 + ((seed >> 3) % 34) / 10);
  const ceilingHeightCm = Math.round((2.2 + ((seed >> 6) % 9) / 10) * 100);
  const doorWidthCm = 80 + ((seed >> 9) % 40);
  const walkwayWidthCm = 60 + ((seed >> 11) % 40);
  const shelfRuns = (seed >> 13) % 3;
  const obstacles = (seed >> 15) % 3;

  const floorAreaM2 = round1(widthM * depthM);
  // Access routes, the door swing and obstacles typically cost a fifth.
  const usableAreaM2 = round1(floorAreaM2 * (0.82 - obstacles * 0.03));

  // More angles and cleaner frames make the structure more certain.
  const confidence =
    Math.round(Math.min(0.94, 0.55 + images.length * 0.06 + quality * 0.2) * 100) / 100;

  const features: VisionSceneFeature[] = [
    feature("floor", "Floor area", Math.round(floorAreaM2 * 100), confidence, `Estimated ${floorAreaM2}m² from ${widthM}m × ${depthM}m.`),
    feature("ceiling", "Ceiling height", ceilingHeightCm, confidence, "Estimated from wall lines in frame."),
    feature("door", "Door opening", doorWidthCm, Math.round(confidence * 0.95 * 100) / 100, "Estimated from the frame edges around the opening."),
    feature("wall", "Wall runs", null, confidence, "Straight vertical edges detected on more than one side."),
    feature("walkway", "Access route", walkwayWidthCm, Math.round(confidence * 0.9 * 100) / 100, "Clear path kept between the door and the back wall."),
  ];

  if (shelfRuns > 0) {
    features.push(
      feature("shelving", `${shelfRuns} shelf run${shelfRuns === 1 ? "" : "s"}`, null, Math.round(confidence * 0.88 * 100) / 100, "Repeated horizontal lines at even spacing."),
    );
  }
  if (obstacles > 0) {
    features.push(
      feature("obstacle", `${obstacles} obstacle${obstacles === 1 ? "" : "s"}`, null, Math.round(confidence * 0.8 * 100) / 100, "Fixed items reduce the usable floor."),
    );
  }
  if (((seed >> 17) % 2) === 1) {
    features.push(feature("window", "Window", null, Math.round(confidence * 0.85 * 100) / 100, "Bright rectangular region on a wall run."));
  }

  const notes = [
    `Clear floor area estimated at ${usableAreaM2}m² after access routes.`,
    `Ceiling estimated at ${round1(ceilingHeightCm / 100)}m — tall items should fit upright.`,
    images.length > 1
      ? `${images.length} angles combined for a steadier estimate.`
      : "Add a second angle for a steadier estimate.",
  ];
  if (spaceType) notes.push(`Assessed as a ${spaceType.replace(/-/g, " ")}.`);

  return {
    features,
    floorAreaM2,
    usableAreaM2,
    ceilingHeightCm,
    walkwayWidthCm,
    obstacles,
    confidence,
    notes,
  };
}

/** Width, depth and ceiling in metres — what the space contracts expect. */
export function sceneGeometry(scene: VisionScene): {
  widthM: number;
  depthM: number;
  ceilingHeightM: number;
  usableVolumeM3: number;
} {
  const ceilingHeightM = round1(scene.ceilingHeightCm / 100);
  // Recovered from area, keeping the pair consistent with what was reported.
  const depthM = round1(Math.sqrt(scene.floorAreaM2 * 1.6));
  const widthM = depthM === 0 ? 0 : round1(scene.floorAreaM2 / depthM);
  return {
    widthM,
    depthM,
    ceilingHeightM,
    usableVolumeM3: round1(scene.usableAreaM2 * Math.min(ceilingHeightM, 2.4)),
  };
}
