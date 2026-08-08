/**
 * Remote vision backend adapter.
 *
 * One factory covers every hosted vision model. A vendor is described by a
 * transport (how a request is sent) and a normaliser (how its JSON maps onto
 * `BackendDetection`), so adding OpenAI Vision, Gemini Vision, Azure AI Vision
 * or Rekognition is a small object, not a new pipeline.
 *
 * No vendor SDK, endpoint or key is referenced here. Transports are injected
 * by the AI orchestration layer, which owns credentials and rate limiting.
 */
import {
  DETECTION_CLASSES,
  detectionClass,
} from "@/lib/intelligence/vision/taxonomy";

import type {
  BackendDetection,
  BackendOcrRead,
  BackendRequest,
  BackendSceneReading,
  VisionBackend,
} from "./backends";
import { VISION_MATERIALS, type OcrKind, type VisionMaterial } from "./types";

/** What every hosted model is asked to return, whatever its own shape. */
export interface RemoteVisionPayload {
  objects?: Array<{
    label?: unknown;
    name?: unknown;
    confidence?: unknown;
    score?: unknown;
    count?: unknown;
    quantity?: unknown;
    photoId?: unknown;
    box?: unknown;
    bbox?: unknown;
    masks?: unknown;
    material?: unknown;
    damage?: unknown;
  }>;
  text?: Array<{
    photoId?: unknown;
    text?: unknown;
    confidence?: unknown;
    kind?: unknown;
    box?: unknown;
  }>;
  scene?: Record<string, unknown>;
}

export interface RemoteVisionTransport {
  /** Sends the frames and returns the vendor's parsed JSON. */
  (request: BackendRequest): Promise<RemoteVisionPayload>;
}

export interface RemoteVisionOptions {
  id: string;
  vendor: string;
  model: string;
  transport: RemoteVisionTransport;
  /** Optional gate — e.g. "is a key configured for this environment?". */
  available?: () => boolean;
}

const num = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const str = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

function readBox(value: unknown): { x: number; y: number; w: number; h: number } {
  if (Array.isArray(value) && value.length >= 4) {
    return {
      x: clamp01(num(value[0], 0)),
      y: clamp01(num(value[1], 0)),
      w: clamp01(num(value[2], 0.3)),
      h: clamp01(num(value[3], 0.3)),
    };
  }
  if (value && typeof value === "object") {
    const box = value as Record<string, unknown>;
    return {
      x: clamp01(num(box['x'] ?? box['left'], 0)),
      y: clamp01(num(box['y'] ?? box['top'], 0)),
      w: clamp01(num(box['w'] ?? box['width'], 0.3)),
      h: clamp01(num(box['h'] ?? box['height'], 0.3)),
    };
  }
  return { x: 0.1, y: 0.1, w: 0.3, h: 0.3 };
}

const normalise = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Maps a free-text vendor label onto the Spacilo taxonomy. Unknown labels fall
 * back to a generic class rather than being invented into the vocabulary.
 */
export function matchClassKey(label: string): string {
  const wanted = normalise(label);
  if (!wanted) return "medium-box";

  const exact = DETECTION_CLASSES.find(
    (entry) => normalise(entry.label) === wanted || entry.key === label,
  );
  if (exact) return exact.key;

  const words = wanted.split(" ").filter((word) => word.length > 2);
  let best: { key: string; score: number } | null = null;
  for (const entry of DETECTION_CLASSES) {
    const target = normalise(entry.label);
    let score = 0;
    for (const word of words) if (target.includes(word)) score += word.length;
    if (target.includes(wanted) || wanted.includes(target)) score += 4;
    if (score > 0 && (!best || score > best.score)) best = { key: entry.key, score };
  }
  return best?.key ?? "medium-box";
}

function readMaterial(value: unknown): VisionMaterial | undefined {
  const text = normalise(str(value)) as VisionMaterial;
  return VISION_MATERIALS.includes(text) ? text : undefined;
}

const OCR_KINDS: OcrKind[] = [
  "label",
  "packaging",
  "room_label",
  "qr_code",
  "barcode",
  "handwriting",
];

function readOcrKind(value: unknown): OcrKind {
  const text = normalise(str(value)).replace(/ /g, "_") as OcrKind;
  return OCR_KINDS.includes(text) ? text : "label";
}

/** Vendor JSON to `BackendDetection[]`, defensively and without throwing. */
export function normaliseRemoteDetections(
  payload: RemoteVisionPayload,
  fallbackPhotoId: string,
): BackendDetection[] {
  const rows = Array.isArray(payload.objects) ? payload.objects : [];
  const detections: BackendDetection[] = [];

  for (const row of rows) {
    const label = str(row.label) || str(row.name);
    if (!label) continue;
    const classKey = matchClassKey(label);
    const entry = detectionClass(classKey);
    const box = readBox(row.box ?? row.bbox);
    const count = Math.max(1, Math.round(num(row.count ?? row.quantity, 1)));
    const masks = Array.isArray(row.masks)
      ? row.masks.map((mask) => readBox(mask))
      : undefined;

    detections.push({
      photoId: str(row.photoId) || fallbackPhotoId,
      classKey,
      label: entry?.label ?? label,
      confidence: clamp01(num(row.confidence ?? row.score, 0.6)),
      box,
      count,
      ...(masks && masks.length > 0 ? { masks } : {}),
      ...(readMaterial(row.material) ? { materialHint: readMaterial(row.material)! } : {}),
      damageHints: Array.isArray(row.damage) ? row.damage.map((hint) => str(hint)).filter(Boolean) : [],
    });
  }

  return detections;
}

export function normaliseRemoteText(
  payload: RemoteVisionPayload,
  fallbackPhotoId: string,
): BackendOcrRead[] {
  const rows = Array.isArray(payload.text) ? payload.text : [];
  return rows
    .map((row) => ({
      photoId: str(row.photoId) || fallbackPhotoId,
      kind: readOcrKind(row.kind),
      text: str(row.text),
      confidence: clamp01(num(row.confidence, 0.6)),
      box: readBox(row.box),
    }))
    .filter((row) => row.text.length > 0);
}

export function normaliseRemoteScene(payload: RemoteVisionPayload): BackendSceneReading | null {
  const scene = payload.scene;
  if (!scene || typeof scene !== "object") return null;
  const lighting = normalise(str(scene['lighting']));
  return {
    widthM: num(scene['widthM'], 3),
    depthM: num(scene['depthM'], 5),
    ceilingHeightCm: num(scene['ceilingHeightCm'], 240),
    doorWidthCm: num(scene['doorWidthCm'], 90),
    walkwayWidthCm: num(scene['walkwayWidthCm'], 70),
    shelfRuns: Math.max(0, Math.round(num(scene['shelfRuns'], 0))),
    obstacles: Math.max(0, Math.round(num(scene['obstacles'], 0))),
    windows: Math.max(0, Math.round(num(scene['windows'], 0))),
    floorType: str(scene['floorType']) || "concrete",
    lighting: lighting === "good" || lighting === "poor" ? lighting : "adequate",
    confidence: clamp01(num(scene['confidence'], 0.6)),
  };
}

/** Builds a backend for any hosted vision model. */
export function createRemoteVisionBackend(options: RemoteVisionOptions): VisionBackend {
  const { id, vendor, model, transport } = options;

  return {
    id,
    vendor,
    model,
    remote: true,
    available: options.available ?? (() => true),

    async detect(request) {
      const payload = await transport(request);
      const fallbackPhotoId = request.images[0]?.photo.id ?? "unknown";
      return normaliseRemoteDetections(payload, fallbackPhotoId);
    },

    async readText(request) {
      const payload = await transport(request);
      const fallbackPhotoId = request.images[0]?.photo.id ?? "unknown";
      return normaliseRemoteText(payload, fallbackPhotoId);
    },

    async readScene(request) {
      const payload = await transport({ ...request, scene: true });
      const scene = normaliseRemoteScene(payload);
      if (!scene) throw new Error(`${id}: no scene reading returned`);
      return scene;
    },
  };
}
