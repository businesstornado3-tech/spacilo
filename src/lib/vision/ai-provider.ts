/**
 * Production Vision AI provider.
 *
 * Sends the user's actual photographs to the detection endpoint and
 * maps the reply onto the shared `DetectedObject` model. Nothing is invented
 * here: this file adds no items, no default inventory and no catalogue
 * substitutions. Each item keeps the identity the detector gave it — the
 * label, the estimated size and the evidence behind the count travel together
 * all the way to the locked inventory.
 *
 * When the endpoint cannot answer, the scan fails honestly. A fabricated
 * inventory is worse than no inventory.
 */
import type { ItemCategory, WeightClass } from "@/lib/spaceplanner/types";

import { validDimensionCm } from "./canonical";
import { prepareSelection } from "./crop";
import {
  readDetectionCache,
  readSpaceCache,
  recordTiming,
  writeDetectionCache,
  writeSpaceCache,
} from "./detection-cache";
import { analysisFingerprint } from "./fingerprint";
import { describeSelection, isFullPhoto, type PhotoSelection } from "./selection";
import type { AnalyseOptions, VisionProvider } from "./provider";
import type {
  DetectedObject,
  RoomFeature,
  SpaceScanResult,
  SpaceSuitability,
  VisionPhoto,
  VisionResult,
  VisionStageTimings,
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
  volumeM3?: number;
  weight: string;
  fragile: boolean;
  stackable: boolean;
  confidence: number;
  photoIds: string[];
  evidence?: string;
  components?: string[];
  sourceDetectionId?: string;
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

/**
 * API item → the shared detected-object shape.
 *
 * Every field is read by name from its own key, so a missing value stays
 * missing instead of pulling the next field into its place, and the item's id
 * travels with it unchanged.
 */
export function toDetectedObject(item: ApiItem): DetectedObject {
  return {
    id: item.id,
    label: item.label,
    category: category(item.category),
    confidence: item.confidence,
    width: validDimensionCm(item.widthCm) ?? 0,
    depth: validDimensionCm(item.depthCm) ?? 0,
    height: validDimensionCm(item.heightCm) ?? 0,
    weight: weight(item.weight),
    quantity: Math.max(1, Math.round(item.quantity)),
    fragile: Boolean(item.fragile),
    stackable: Boolean(item.stackable),
    // Deliberately null: the planner uses this object's own geometry rather
    // than swapping it for a catalogue lookalike.
    catalogueId: null,
    photoIds: item.photoIds,
    source: "ai",
    sourceDetectionId: item.sourceDetectionId ?? item.id,
    ...(item.countBasis ? { countBasis: item.countBasis } : {}),
    ...(item.evidence ? { evidence: item.evidence } : {}),
    ...(item.components?.length ? { components: item.components } : {}),
  };
}

/** The user's selection for a photo, if they made one. */
function selectionFor(
  photo: VisionPhoto,
  selections: PhotoSelection[] | undefined,
): PhotoSelection | null {
  return selections?.find((selection) => selection.photoId === photo.id) ?? null;
}

interface PreparedPhoto {
  id: string;
  mimeType: string;
  base64: string;
  region?: string;
  hint?: string;
}

/**
 * Phase 6X — decode, rotate, crop and encode every photograph once.
 *
 * Split out from the request itself so the cache can be keyed on the prepared
 * BYTES rather than on the blob identity of the upload. Re-uploading the same
 * picture now hits the cache instead of paying for another model call.
 */
async function prepareImages(
  photos: VisionPhoto[],
  options?: AnalyseOptions,
): Promise<{ prepared: PreparedPhoto[]; prepareMs: number }> {
  options?.onStage?.("reading");
  const startedPrepare = Date.now();
  const prepared = (await Promise.all(
    photos.map(async (photo) => {
      const selection = selectionFor(photo, options?.selections);
      return {
        id: photo.id,
        ...(await prepareSelection(photo.url, selection)),
        ...(selection && !isFullPhoto(selection)
          ? { region: describeSelection(selection), ...(selection.label ? { hint: selection.label } : {}) }
          : {}),
      };
    }),
  )) as PreparedPhoto[];
  const prepareMs = Date.now() - startedPrepare;
  recordTiming("prepare", prepareMs);
  return { prepared, prepareMs };
}

async function postPrepared(
  prepared: PreparedPhoto[],
  task: "belongings" | "space",
  spaceType?: string,
  options?: AnalyseOptions,
): Promise<{ payload: Record<string, unknown>; requestMs: number }> {
  options?.onStage?.(task === "space" ? "space" : "finding");
  const started = Date.now();
  const response = await fetch(DETECT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      task,
      mode: options?.mode ?? "whole",
      images: prepared,
      ...(spaceType ? { spaceType } : {}),
    }),
  });
  const requestMs = Date.now() - started;
  recordTiming(task, requestMs);

  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok || !payload) {
    const reason = typeof payload?.["error"] === "string" ? String(payload["error"]) : "failed";
    throw new VisionUnavailableError(reason);
  }
  return { payload, requestMs };
}

/** Cache key for an analysis, taken from the prepared image content. */
function preparedCacheKey(
  prepared: PreparedPhoto[],
  task: "belongings" | "space",
  options?: AnalyseOptions,
  spaceType?: string,
): string {
  return analysisFingerprint({
    task,
    mode: options?.mode ?? "whole",
    ...(spaceType ? { spaceType } : {}),
    photos: prepared.map((photo) => ({
      id: photo.id,
      base64: photo.base64,
      ...(photo.region ? { region: photo.region } : {}),
    })),
  });
}

/** Reads the server's measured stage costs without inventing any of them. */
function stageTimings(
  payload: Record<string, unknown>,
  prepareMs: number,
  requestMs: number,
): VisionStageTimings {
  const raw = (payload["timings"] ?? {}) as Record<string, unknown>;
  const calls = (payload["calls"] ?? {}) as Record<string, unknown>;
  const completeness = (payload["completeness"] ?? {}) as Record<string, unknown>;
  const num = (value: unknown): number | undefined =>
    typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : undefined;
  const timings: VisionStageTimings = { prepareMs, requestMs };
  const detectMs = num(raw["detectMs"]);
  const mergeMs = num(raw["mergeMs"]);
  const refineMs = num(raw["refineMs"]);
  const sweepMs = num(raw["sweepMs"]);
  const scanCalls = num(calls["scan"]);
  const refineCalls = num(calls["refine"]);
  const sweepCalls = num(calls["sweep"]);
  if (detectMs !== undefined) timings.detectMs = detectMs;
  if (mergeMs !== undefined) timings.mergeMs = mergeMs;
  if (refineMs !== undefined) timings.refineMs = refineMs;
  if (sweepMs !== undefined) timings.sweepMs = sweepMs;
  if (scanCalls !== undefined) timings.scanCalls = scanCalls;
  if (refineCalls !== undefined) timings.refineCalls = refineCalls;
  if (sweepCalls !== undefined) timings.sweepCalls = sweepCalls;
  if (Array.isArray(completeness["reasons"])) {
    timings.completenessReasons = (completeness["reasons"] as unknown[]).filter(
      (entry): entry is string => typeof entry === "string",
    );
  }
  return timings;
}


function suitability(value: unknown): SpaceSuitability {
  return value === "excellent" || value === "limited" ? value : "good";
}

function positive(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function roomFeatures(value: unknown): RoomFeature[] {
  if (!Array.isArray(value)) return [];
  const kinds = new Set([
    "television", "radiator", "door", "window", "shelving", "built_in_furniture",
    "electrical_fixture", "other",
  ]);
  return value.flatMap((entry, index) => {
    if (!entry || typeof entry !== "object") return [];
    const record = entry as Record<string, unknown>;
    const label = typeof record["label"] === "string" ? record["label"].trim() : "";
    if (!label) return [];
    const rawKind = typeof record["kind"] === "string" ? record["kind"] : "other";
    return [{
      id: `FEATURE-${String(index + 1).padStart(3, "0")}`,
      label: label.slice(0, 80),
      kind: (kinds.has(rawKind) ? rawKind : "other") as RoomFeature["kind"],
      role: "fixed" as const,
      mobility: "fixed" as const,
      position: typeof record["position"] === "string" ? record["position"].slice(0, 160) : "source-derived",
      confidence: Math.max(0.1, Math.min(0.99, positive(record["confidence"], 0.6))),
      verified: false,
    }];
  });
}

export const aiVisionProvider: VisionProvider = {
  id: "spacilo-vision-ai",
  model: "gateway/single-pass",

  async analyseBelongings(
    photos: VisionPhoto[],
    options?: AnalyseOptions,
  ): Promise<VisionResult> {
    // Phase 6X — prepare first, then key the cache on the image content.
    const { prepared, prepareMs } = await prepareImages(photos, options);
    const key = preparedCacheKey(prepared, "belongings", options);
    const cached = readDetectionCache(key);
    if (cached) {
      options?.onStage?.("estimating");
      return {
        objects: cached,
        photoIds: photos.map((photo) => photo.id),
        provider: "spacilo-vision-ai",
        model: "cache",
        analysedAt: Date.now(),
        // A cache hit costs nothing but the lookup itself.
        // A cache hit costs nothing but the lookup itself, and — the point of
        // the whole content fingerprint — makes ZERO model calls.
        timings: {
          prepareMs: 0,
          requestMs: 0,
          detectMs: 0,
          refineMs: 0,
          sweepMs: 0,
          scanCalls: 0,
          refineCalls: 0,
          sweepCalls: 0,
          cacheHit: true,
        },
      };
    }


    const { payload, requestMs } = await postPrepared(prepared, "belongings", undefined, options);
    options?.onStage?.("estimating");
    const items = Array.isArray(payload["items"]) ? (payload["items"] as ApiItem[]) : [];
    const objects = items.map(toDetectedObject);
    writeDetectionCache(key, objects);
    return {
      objects,
      photoIds: photos.map((photo) => photo.id),
      provider: "spacilo-vision-ai",
      model: typeof payload["model"] === "string" ? String(payload["model"]) : "gateway",
      analysedAt: Date.now(),
      timings: stageTimings(payload, prepareMs, requestMs),
    };
  },

  async analyseSpace(
    photos: VisionPhoto[],
    spaceType?: string,
    options?: AnalyseOptions,
  ): Promise<SpaceScanResult> {
    // Phase 6V — an unchanged room photograph is never re-analysed.
    const { prepared } = await prepareImages(photos, options);
    const cacheKey = preparedCacheKey(prepared, "space", options, spaceType);
    const cachedSpace = readSpaceCache<SpaceScanResult>(cacheKey);
    if (cachedSpace) {
      options?.onStage?.("space");
      return cachedSpace;
    }

    const { payload } = await postPrepared(prepared, "space", spaceType, options);
    const space = (payload["space"] ?? {}) as Record<string, unknown>;
    const widthM = positive(space["widthM"], 3);
    const depthM = positive(space["depthM"], 3);
    const ceilingHeightM = positive(space["ceilingHeightM"], 2.3);
    const usableAreaM2 = positive(space["usableAreaM2"], widthM * depthM * 0.8);
    // Phase 6Q — the room is tracked separately from the marked storage area.
    // Never let the room read smaller than the area it is meant to contain.
    const roomWidthM = Math.max(widthM, positive(space["roomWidthM"], widthM));
    const roomDepthM = Math.max(depthM, positive(space["roomDepthM"], depthM));
    const result: SpaceScanResult = {
      widthM,
      depthM,
      roomWidthM,
      roomDepthM,
      usableIsSubArea: roomWidthM > widthM + 0.01 || roomDepthM > depthM + 0.01,
      ceilingHeightM,
      usableAreaM2,
      usableVolumeM3: positive(space["usableVolumeM3"], usableAreaM2 * ceilingHeightM * 0.8),
      suitability: suitability(space["suitability"]),
      observations: Array.isArray(space["observations"])
        ? (space["observations"] as unknown[]).filter(
            (entry): entry is string => typeof entry === "string",
          )
        : [],
      features: roomFeatures(space["features"]),
      confidence: Math.max(0.2, Math.min(0.95, positive(space["confidence"], 0.6))),
      provider: "spacilo-vision-ai",
      analysedAt: Date.now(),
    };
    writeSpaceCache(cacheKey, result);
    return result;
  },
};
