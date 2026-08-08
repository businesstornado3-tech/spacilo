/**
 * Phase 6C — production Vision AI contracts.
 *
 * Provider-independent by construction. Nothing here names a vendor, an SDK or
 * a model family: OpenAI Vision, Gemini Vision, Azure AI Vision, Rekognition
 * and any future self-hosted model all fill these same shapes, so swapping one
 * for another is a configuration change and never a UI change.
 *
 * Two rules hold throughout, exactly as in the earlier engine:
 *   1. Vision OBSERVES and PROPOSES. People confirm. Nothing is a measurement.
 *   2. Every proposal carries its confidence and the reason behind it.
 */
import type { ItemCategory, WeightClass } from "@/lib/spaceplanner/types";
import type {
  VisionDimensions,
  VisionImage,
  VisionViewpoint,
  VisionWeight,
} from "@/lib/intelligence/vision/contracts";
import type { VisionPhoto } from "@/lib/vision/types";

export type { VisionImage, VisionPhoto, VisionViewpoint };

export const VISION_PLATFORM_VERSION = "vision-6c-1";

/* ---------------------------------------------------------- preprocessing */

/** One reversible or lossy step applied to a frame before analysis. */
export type ImageOperation =
  | "orientation_corrected"
  | "resized"
  | "lighting_normalised"
  | "contrast_enhanced"
  | "noise_reduced"
  | "border_cropped"
  | "compressed"
  | "metadata_stripped";

export interface ProcessedImage {
  photoId: string;
  /** Untouched upload — always retained alongside the processed frame. */
  originalUrl: string;
  /** What analysis actually sees. Same URL when no step was needed. */
  processedUrl: string;
  originalBytes: number;
  processedBytes: number;
  /** Longest edge of the analysed frame, in pixels. */
  analysisEdgePx: number;
  rotationApplied: number;
  operations: ImageOperation[];
  /** 0–1. Higher means sharper. Below `BLUR_THRESHOLD` the frame is soft. */
  sharpness: number;
  blurred: boolean;
  brightness: number;
  contrast: number;
  noise: number;
  /** Overall usability of the frame for detection, 0–1. */
  quality: number;
  /** Fraction of the frame removed as irrelevant border. */
  cropRatio: number;
  metadataStripped: boolean;
  duplicateOf: string | null;
  notes: string[];
}

/* ----------------------------------------------------------------- attributes */

export type VisionMaterial =
  | "wood"
  | "glass"
  | "metal"
  | "plastic"
  | "fabric"
  | "leather"
  | "cardboard"
  | "ceramic"
  | "composite"
  | "unknown";

export const VISION_MATERIALS: VisionMaterial[] = [
  "wood",
  "glass",
  "metal",
  "plastic",
  "fabric",
  "leather",
  "cardboard",
  "ceramic",
  "composite",
  "unknown",
];

export interface MaterialReading {
  material: VisionMaterial;
  confidence: number;
  reason: string;
  /** Other plausible materials, best first. */
  alternatives: Array<{ material: VisionMaterial; confidence: number }>;
}

export type FragilityGrade = "very_fragile" | "fragile" | "normal" | "robust";

export interface FragilityReading {
  grade: FragilityGrade;
  confidence: number;
  reason: string;
  /** Protection the item should get in storage. */
  measures: string[];
}

export type Stackability = "stackable" | "partially_stackable" | "not_stackable";

export interface StackingReading {
  stackability: Stackability;
  /** How many of this item may sit on top of each other. */
  maxStack: number;
  /** Kilograms this item can safely carry. */
  safeLoadKg: number;
  advice: string;
  confidence: number;
}

export type ClimateNeed =
  | "dry"
  | "temperature_controlled"
  | "moisture_protection"
  | "ventilation";

export interface ClimateReading {
  needs: ClimateNeed[];
  sensitive: boolean;
  confidence: number;
  reason: string;
}

export type DamageKind =
  | "dent"
  | "crack"
  | "broken_glass"
  | "water_damage"
  | "torn_packaging"
  | "surface_damage";

/**
 * A damage OBSERVATION, never a finding. Low-confidence readings are always
 * phrased as "may show" and flagged for human review.
 */
export interface DamageObservation {
  kind: DamageKind;
  confidence: number;
  /** True only when confidence clears `DAMAGE_ASSERT_THRESHOLD`. */
  asserted: boolean;
  photoId: string;
  note: string;
}

/* ----------------------------------------------------------------------- OCR */

export type OcrKind = "label" | "packaging" | "room_label" | "qr_code" | "barcode" | "handwriting";

export interface OcrRead {
  id: string;
  photoId: string;
  kind: OcrKind;
  text: string;
  confidence: number;
  box: { x: number; y: number; w: number; h: number };
}

/* ------------------------------------------------------------------ instances */

/** Structured confidence for one instance — one number per stage plus overall. */
export interface InstanceConfidence {
  detection: number;
  classification: number;
  dimension: number;
  weight: number;
  material: number;
  overall: number;
  band: "high" | "good" | "moderate" | "low";
  needsReview: boolean;
  /** Plain-English statement of what is uncertain, when anything is. */
  uncertainty: string | null;
}

/**
 * One individual object. Three identical boxes are three instances, each with
 * its own dimensions, confidence and reasoning.
 */
export interface VisionInstance {
  id: string;
  classKey: string;
  label: string;
  /** Always 1 — instances are individual by definition. Kept for downstream maths. */
  quantity: 1;
  category: ItemCategory;
  subcategory: string;
  /** Stable identity across photos; shared by sightings of the same object. */
  identityKey: string;
  dimensions: VisionDimensions;
  weight: VisionWeight;
  weightClass: WeightClass;
  material: MaterialReading;
  fragility: FragilityReading;
  stacking: StackingReading;
  climate: ClimateReading;
  damage: DamageObservation[];
  ocr: OcrRead[];
  confidence: InstanceConfidence;
  photoIds: string[];
  viewpoints: VisionViewpoint[];
  catalogueId: string | null;
  /** Plain-English reasoning, one line per decision taken. */
  explanations: string[];
  /** True when a user correction has been applied to this instance. */
  corrected: boolean;
}

/* -------------------------------------------------------- scene understanding */

export type SceneElementKind =
  | "wall"
  | "door"
  | "garage_door"
  | "door_swing"
  | "window"
  | "shelving"
  | "column"
  | "ceiling"
  | "walkway"
  | "lighting"
  | "obstacle"
  | "power_outlet"
  | "access_restriction"
  | "floor"
  | "storage_zone";

export interface SceneElement {
  id: string;
  kind: SceneElementKind;
  label: string;
  /** Centimetres where a size is meaningful, otherwise null. */
  sizeCm: number | null;
  confidence: number;
  explanation: string;
}

export type ZoneKind = "accessible" | "vertical" | "blocked" | "dead" | "potential";

export interface SpatialZone {
  id: string;
  kind: ZoneKind;
  label: string;
  areaM2: number;
  /** Usable height for this zone, in centimetres. */
  heightCm: number;
  volumeM3: number;
  confidence: number;
  explanation: string;
}

export interface SpatialMap {
  floorAreaM2: number;
  usableFloorAreaM2: number;
  verticalStorageM3: number;
  accessibleAreaM2: number;
  blockedAreaM2: number;
  deadSpaceM2: number;
  ceilingHeightCm: number;
  zones: SpatialZone[];
  confidence: number;
}

export interface SceneUnderstanding {
  elements: SceneElement[];
  spatial: SpatialMap;
  floorType: string;
  lighting: "good" | "adequate" | "poor";
  accessNotes: string[];
  confidence: number;
  explanations: string[];
  photoIds: string[];
}

/* ------------------------------------------------------------------- analysis */

export interface VisionAnalysisMeta {
  platformVersion: string;
  backendId: string;
  vendor: string;
  model: string;
  remote: boolean;
  producedAt: number;
  latencyMs: number;
  photoCount: number;
  stages: string[];
  fallbackUsed: boolean;
}

export interface VisionAnalysis {
  instances: VisionInstance[];
  /** Instances grouped by class, for screens that show lines rather than units. */
  groups: Array<{ classKey: string; label: string; quantity: number; instanceIds: string[] }>;
  images: ProcessedImage[];
  ocr: OcrRead[];
  damage: DamageObservation[];
  scene: SceneUnderstanding | null;
  itemCount: number;
  volumeM3: number;
  weightKg: number;
  fragileCount: number;
  reviewCount: number;
  /** Sightings discarded as the same object seen again. */
  duplicatesMerged: number;
  confidence: number;
  photoIds: string[];
  explanations: string[];
  warnings: string[];
  meta: VisionAnalysisMeta;
}

/* --------------------------------------------------------------- corrections */

export type CorrectionField =
  | "label"
  | "category"
  | "dimensions"
  | "weight"
  | "fragility"
  | "material"
  | "climate"
  | "quantity"
  | "removed";

export interface VisionCorrection {
  id: string;
  /** Class the correction applies to — never the user, never the photo. */
  classKey: string;
  field: CorrectionField;
  /** Anonymised before/after signal. No free text from the user is stored. */
  from: string;
  to: string;
  backendId: string;
  confidenceBefore: number;
  at: number;
}

/* ---------------------------------------------------------------- thresholds */

/** Sharpness below this marks a frame as blurred. */
export const BLUR_THRESHOLD = 0.55;
/** Overall confidence below this asks for a human look before it counts. */
export const REVIEW_THRESHOLD = 0.75;
/** Damage below this is phrased as a possibility, never as fact. */
export const DAMAGE_ASSERT_THRESHOLD = 0.8;
/** Longest edge, in pixels, that frames are resized down to for analysis. */
export const ANALYSIS_MAX_EDGE_PX = 1600;
