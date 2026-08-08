/**
 * Vision backend abstraction.
 *
 * A backend is the only part of the vision stack that ever talks to a model.
 * Everything above it — segmentation, attributes, fusion, scene, scoring —
 * works from `BackendDetection`, `BackendOcrRead` and `BackendSceneReading`,
 * so OpenAI Vision, Gemini Vision, Azure AI Vision, Rekognition or a private
 * model are interchangeable behind this one interface.
 *
 * Registration order is preference order: the first healthy backend wins and
 * the rest stand by as fallbacks.
 */
import type { OcrKind, ProcessedImage, VisionImage, VisionMaterial } from "./types";

export interface BackendRequest {
  images: VisionImage[];
  processed: ProcessedImage[];
  spaceType?: string;
  /** Set when the caller wants structural reading as well as objects. */
  scene?: boolean;
  signal?: AbortSignal;
}

export interface BackendDetection {
  photoId: string;
  classKey: string;
  label: string;
  confidence: number;
  /** Normalised 0–1 frame coordinates. */
  box: { x: number; y: number; w: number; h: number };
  /** Instances visible in this box. One row per object where the model can tell. */
  count: number;
  /** Per-instance masks when the backend does segmentation; empty otherwise. */
  masks?: Array<{ x: number; y: number; w: number; h: number }>;
  materialHint?: VisionMaterial;
  damageHints?: string[];
}

export interface BackendOcrRead {
  photoId: string;
  kind: OcrKind;
  text: string;
  confidence: number;
  box: { x: number; y: number; w: number; h: number };
}

export interface BackendSceneReading {
  widthM: number;
  depthM: number;
  ceilingHeightCm: number;
  doorWidthCm: number;
  walkwayWidthCm: number;
  shelfRuns: number;
  obstacles: number;
  windows: number;
  floorType: string;
  lighting: "good" | "adequate" | "poor";
  confidence: number;
}

export interface VisionBackend {
  id: string;
  vendor: string;
  model: string;
  /** True when the backend calls out over the network. */
  remote: boolean;
  /** Cheap check used to skip a misconfigured backend without an error. */
  available(): boolean;
  detect(request: BackendRequest): Promise<BackendDetection[]>;
  readText?(request: BackendRequest): Promise<BackendOcrRead[]>;
  readScene?(request: BackendRequest): Promise<BackendSceneReading>;
}

const registry: VisionBackend[] = [];

export function registerVisionBackend(backend: VisionBackend): void {
  const index = registry.findIndex((entry) => entry.id === backend.id);
  if (index >= 0) registry.splice(index, 1, backend);
  else registry.push(backend);
}

export function listVisionBackends(): VisionBackend[] {
  return [...registry];
}

export function clearVisionBackends(): void {
  registry.length = 0;
}

/** Preferred backend, or the requested one when it is available. */
export function selectVisionBackend(preferredId?: string): VisionBackend | null {
  if (preferredId) {
    const match = registry.find((entry) => entry.id === preferredId && entry.available());
    if (match) return match;
  }
  return registry.find((entry) => entry.available()) ?? null;
}

/** Backends after the given one, in preference order — the fallback chain. */
export function fallbackChain(afterId: string): VisionBackend[] {
  const index = registry.findIndex((entry) => entry.id === afterId);
  return registry.slice(index + 1).filter((entry) => entry.available());
}
