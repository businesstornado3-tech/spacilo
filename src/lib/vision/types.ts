/**
 * Spacilo Vision AI — shared domain model.
 *
 * Vision AI OBSERVES and PROPOSES. People confirm, the deterministic
 * SpacePlanner engine decides. Nothing here measures anything: every number is
 * an estimate carrying an explicit confidence, and every estimate is editable.
 *
 * FUTURE HOOK: a real provider (Gemini Vision, OpenAI Vision, Azure AI Vision,
 * AWS Rekognition, on-device detection) implements `VisionProvider` in
 * `./provider` and returns these same shapes. No component below `components/
 * vision` changes when that happens.
 */
import type { ItemCategory, WeightClass } from "@/lib/spaceplanner/types";

/** A photo the user has chosen. The bytes never leave the device in this phase. */
export interface VisionPhoto {
  id: string;
  name: string;
  /** Object URL for preview. Revoked by the hook on removal. */
  url: string;
  sizeBytes: number;
  mimeType: string;
  /** User-applied rotation in degrees (0 | 90 | 180 | 270). */
  rotation: number;
  addedAt: number;
}

export const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

export const ACCEPT_ATTRIBUTE = ".jpg,.jpeg,.png,.webp,.heic,.heif,image/*";

export const MAX_SCAN_PHOTOS = 12;

/** Confidence below this asks for a human look before it counts. */
export const REVIEW_CONFIDENCE = 0.75;

export type DetectionSource = "ai" | "manual";

/** One proposed thing in someone's belongings. Always editable. */
export interface DetectedObject {
  id: string;
  label: string;
  category: ItemCategory;
  /** 0–1. Presented as a percentage, never as certainty. */
  confidence: number;
  /** Estimated centimetres. */
  width: number;
  depth: number;
  height: number;
  weight: WeightClass;
  quantity: number;
  fragile: boolean;
  stackable: boolean;
  /** Catalogue item this maps onto, when one exists. Drives the planner. */
  catalogueId: string | null;
  /** Photos this object was proposed from. */
  photoIds: string[];
  source: DetectionSource;
  /** How the quantity was arrived at — always evidence, never assumption. */
  countBasis?: string;
  /** What was actually visible that led to this item. */
  evidence?: string;
  /** Parts of this object that are not separately storable (rails, cushions…). */
  components?: string[];
  /** The user's own selection this object came from, when they marked one. */
  selectionId?: string;
}

export interface VisionResult {
  objects: DetectedObject[];
  photoIds: string[];
  provider: string;
  model: string;
  analysedAt: number;
}

export type SpaceSuitability = "excellent" | "good" | "limited";

/** Host-side scan. A room is not an item list, so it has its own shape. */
export interface SpaceScanResult {
  /** Estimated usable floor area in m² (after access and obstacles). */
  usableAreaM2: number;
  widthM: number;
  depthM: number;
  ceilingHeightM: number;
  /** Estimated usable storage volume in m³. */
  usableVolumeM3: number;
  suitability: SpaceSuitability;
  observations: string[];
  confidence: number;
  provider: string;
  analysedAt: number;
}

export function needsReview(object: DetectedObject): boolean {
  return object.source === "ai" && object.confidence < REVIEW_CONFIDENCE;
}

export function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

export function isAcceptedImage(file: { type: string; name: string }): boolean {
  if ((ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type.toLowerCase())) return true;
  return /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
}
