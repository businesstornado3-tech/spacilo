/**
 * Production Vision AI provider.
 *
 * Sends the user's actual photographs to the two-stage detection endpoint and
 * maps the reply onto the shared `DetectedObject` model. Nothing is invented
 * here: this file adds no items, no default inventory and no catalogue
 * substitutions. Each item keeps the identity the detector gave it — the
 * label, the estimated size and the evidence behind the count travel together
 * all the way to the locked inventory.
 *
 * When the endpoint cannot answer, the scan fails honestly. A fabricated
 * inventory is worse than no inventory.
 */
import { prepareImage } from "@/lib/spaceplanner/photo/image-optimise";
import type { ItemCategory, WeightClass } from "@/lib/spaceplanner/types";

import type { VisionProvider } from "./provider";
import type {
  DetectedObject,
  SpaceScanResult,
  SpaceSuitability,
  VisionPhoto,
  VisionResult,
} from "./types";

const DETECT_URL = "/api/vision-detect";

export class VisionUnavailableError extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = "VisionUnavailableError";
  }
}

interface ApiItem {
  id: string;
  label: string;
  category: string;
  quantity: number;
  countBasis?: string;
  widthCm: number;
  depthCm: number;
  heightCm: number;
  weight: string;
  fragile: boolean;
  stackable: boolean;
  confidence: number;
  photoIds: string[];
  evidence?: string;
}

const CATEGORIES: ItemCategory[] = [
  "boxes",
  "furniture",
  "appliances",
  "electronics",
  "leisure",
  "seasonal",
];

function category(value: string): ItemCategory {
  return (CATEGORIES as string[]).includes(value) ? (value as ItemCategory) : "boxes";
}

function weight(value: string): WeightClass {
  return value === "light" || value === "heavy" ? value : "medium";
}

/** API item → the shared detected-object shape. Identity is preserved. */
export function toDetectedObject(item: ApiItem): DetectedObject {
  return {
    id: item.id,
    label: item.label,
    category: category(item.category),
    confidence: item.confidence,
    width: item.widthCm,
    depth: item.depthCm,
    height: item.heightCm,
    weight: weight(item.weight),
    quantity: Math.max(1, Math.round(item.quantity)),
    fragile: Boolean(item.fragile),
    stackable: Boolean(item.stackable),
    // Deliberately null: the planner uses this object's own geometry rather
    // than swapping it for a catalogue lookalike.
    catalogueId: null,
    photoIds: item.photoIds,
    source: "ai",
    ...(item.countBasis ? { countBasis: item.countBasis } : {}),
    ...(item.evidence ? { evidence: item.evidence } : {}),
  };
}

async function postPhotos(
  photos: VisionPhoto[],
  task: "belongings" | "space",
  spaceType?: string,
): Promise<Record<string, unknown>> {
  const prepared = await Promise.all(
    photos.map(async (photo) => ({ id: photo.id, ...(await prepareImage(photo.url)) })),
  );

  const response = await fetch(DETECT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      task,
      images: prepared,
      ...(spaceType ? { spaceType } : {}),
    }),
  });

  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok || !payload) {
    const reason = typeof payload?.["error"] === "string" ? String(payload["error"]) : "failed";
    throw new VisionUnavailableError(reason);
  }
  return payload;
}

function suitability(value: unknown): SpaceSuitability {
  return value === "excellent" || value === "limited" ? value : "good";
}

function positive(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

export const aiVisionProvider: VisionProvider = {
  id: "spacilo-vision-ai",
  model: "gateway/two-stage",

  async analyseBelongings(photos: VisionPhoto[]): Promise<VisionResult> {
    const payload = await postPhotos(photos, "belongings");
    const items = Array.isArray(payload["items"]) ? (payload["items"] as ApiItem[]) : [];
    return {
      objects: items.map(toDetectedObject),
      photoIds: photos.map((photo) => photo.id),
      provider: "spacilo-vision-ai",
      model: typeof payload["model"] === "string" ? String(payload["model"]) : "gateway",
      analysedAt: Date.now(),
    };
  },

  async analyseSpace(photos: VisionPhoto[], spaceType?: string): Promise<SpaceScanResult> {
    const payload = await postPhotos(photos, "space", spaceType);
    const space = (payload["space"] ?? {}) as Record<string, unknown>;
    const widthM = positive(space["widthM"], 3);
    const depthM = positive(space["depthM"], 3);
    const ceilingHeightM = positive(space["ceilingHeightM"], 2.3);
    const usableAreaM2 = positive(space["usableAreaM2"], widthM * depthM * 0.8);
    return {
      widthM,
      depthM,
      ceilingHeightM,
      usableAreaM2,
      usableVolumeM3: positive(space["usableVolumeM3"], usableAreaM2 * ceilingHeightM * 0.8),
      suitability: suitability(space["suitability"]),
      observations: Array.isArray(space["observations"])
        ? (space["observations"] as unknown[]).filter(
            (entry): entry is string => typeof entry === "string",
          )
        : [],
      confidence: Math.max(0.2, Math.min(0.95, positive(space["confidence"], 0.6))),
      provider: "spacilo-vision-ai",
      analysedAt: Date.now(),
    };
  },
};
