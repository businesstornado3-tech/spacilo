/**
 * Simulated Vision AI.
 *
 * Deterministic by design: the same photos always propose the same objects, so
 * the experience is honest and unit-testable. There is no network call and no
 * randomness — a real provider replaces this file alone.
 */
import { VISION_CLASSES, VISION_CLASS_BY_KEY, classVolume } from "./taxonomy";
import type { VisionProvider } from "./provider";
import type {
  DetectedObject,
  SpaceScanResult,
  SpaceSuitability,
  VisionPhoto,
  VisionResult,
} from "./types";

/** Small stable string hash — same input, same output, everywhere. */
export function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

function photoSeed(photo: VisionPhoto, index: number): number {
  return hashString(`${photo.name}:${photo.sizeBytes}:${index}`);
}

/** Classes a single photo proposes. Between two and four, drawn stably. */
function classesForPhoto(photo: VisionPhoto, index: number): string[] {
  const seed = photoSeed(photo, index);
  const count = 2 + (seed % 3);
  const keys: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const pick = VISION_CLASSES[(seed + i * 7919) % VISION_CLASSES.length]!;
    if (!keys.includes(pick.key)) keys.push(pick.key);
  }
  return keys;
}

function confidenceFor(seed: number): number {
  // 0.62 – 0.98, weighted towards confident proposals.
  return Math.round((0.62 + ((seed % 37) / 36) * 0.36) * 100) / 100;
}

function quantityFor(key: string, seed: number): number {
  const bulk = key.includes("box") || key === "book-crate" || key === "plastic-tub";
  if (bulk) return 2 + (seed % 6);
  if (key === "dining-chair") return 2 + (seed % 4);
  return 1;
}

export function detectFromPhotos(photos: VisionPhoto[]): DetectedObject[] {
  const objects: DetectedObject[] = [];

  photos.forEach((photo, index) => {
    for (const key of classesForPhoto(photo, index)) {
      const entry = VISION_CLASS_BY_KEY.get(key)!;
      const seed = hashString(`${photo.id}:${key}`);
      objects.push({
        id: `det-${photo.id}-${key}`,
        label: entry.label,
        category: entry.category,
        confidence: confidenceFor(seed),
        width: entry.width,
        depth: entry.depth,
        height: entry.height,
        weight: entry.weight,
        quantity: quantityFor(key, seed),
        fragile: entry.fragile,
        stackable: entry.stackable,
        catalogueId: entry.catalogueId,
        photoIds: [photo.id],
        source: "ai",
      });
    }
  });

  return objects;
}

function suitabilityFor(volume: number): SpaceSuitability {
  if (volume >= 40) return "excellent";
  if (volume >= 18) return "good";
  return "limited";
}

export const simulationVisionProvider: VisionProvider = {
  id: "spacilo-vision-simulation-v1",
  model: "simulation",

  async analyseBelongings(photos) {
    const result: VisionResult = {
      objects: detectFromPhotos(photos),
      photoIds: photos.map((photo) => photo.id),
      provider: "spacilo-vision-simulation-v1",
      model: "simulation",
      analysedAt: Date.now(),
    };
    return result;
  },

  async analyseSpace(photos, spaceType) {
    const seed = photos.reduce((sum, photo, index) => sum + photoSeed(photo, index), 0);
    const widthM = Math.round((2.6 + (seed % 26) / 10) * 10) / 10;
    const depthM = Math.round((4.4 + ((seed >> 3) % 34) / 10) * 10) / 10;
    const ceilingHeightM = Math.round((2.2 + ((seed >> 6) % 9) / 10) * 10) / 10;
    // Access routes, doors and obstacles typically cost a fifth of the floor.
    const usableAreaM2 = Math.round(widthM * depthM * 0.8 * 10) / 10;
    const usableVolumeM3 = Math.round(usableAreaM2 * Math.min(ceilingHeightM, 2.4) * 10) / 10;

    const observations = [
      `Clear floor area estimated at ${usableAreaM2}m² after access routes.`,
      `Ceiling estimated at ${ceilingHeightM}m — tall items should fit upright.`,
      photos.length > 1
        ? `${photos.length} angles combined for a steadier estimate.`
        : "Add a second angle for a steadier estimate.",
    ];
    if (spaceType) observations.push(`Assessed as a ${spaceType.replace(/-/g, " ")}.`);

    return {
      usableAreaM2,
      widthM,
      depthM,
      ceilingHeightM,
      usableVolumeM3,
      suitability: suitabilityFor(usableVolumeM3),
      observations,
      confidence: Math.min(0.94, 0.68 + photos.length * 0.07),
      provider: "spacilo-vision-simulation-v1",
      analysedAt: Date.now(),
    } satisfies SpaceScanResult;
  },
};

export { classVolume };
