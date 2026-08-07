/**
 * Vision Intelligence Engine — data contracts.
 *
 * Provider-independent by construction. Nothing here names a vendor, a model
 * or an SDK: a future OpenAI, Gemini, Azure or on-device engine fills these
 * same shapes and every stage above keeps working.
 *
 * Two rules hold throughout:
 *   1. Vision OBSERVES and PROPOSES. People confirm. Nothing is a measurement.
 *   2. Every proposal carries its confidence and the reason behind it.
 */
import type { ItemCategory, WeightClass } from "@/lib/spaceplanner/types";
import type { VisionPhoto } from "@/lib/vision/types";

export type { VisionPhoto };

export const VISION_CONTRACT_VERSION = "vision-1";

/* ------------------------------------------------------------ viewpoints */

/** Where a photo was taken from. Fusion uses this to reason about overlap. */
export type VisionViewpoint =
  | "front"
  | "rear"
  | "left"
  | "right"
  | "room-1"
  | "room-2"
  | "garage"
  | "loft"
  | "garden"
  | "unknown";

export const VISION_VIEWPOINTS: VisionViewpoint[] = [
  "front",
  "rear",
  "left",
  "right",
  "room-1",
  "room-2",
  "garage",
  "loft",
  "garden",
  "unknown",
];

/** A photo plus what the caller knows about where it came from. */
export interface VisionImage {
  photo: VisionPhoto;
  viewpoint: VisionViewpoint;
}

/* ----------------------------------------------------------- diagnostics */

export type VisionImageIssue =
  | "blurred"
  | "low_light"
  | "over_exposed"
  | "heavy_shadow"
  | "duplicate"
  | "tight_crop";

/** What pre-processing could tell about one photo. All 0–1 unless stated. */
export interface VisionDiagnostics {
  photoId: string;
  /** Overall usability of the photo for detection. */
  quality: number;
  sharpness: number;
  brightness: number;
  /** How much of the frame sits in shadow. */
  shadow: number;
  /** How well the subject separates from its background. */
  subjectSeparation: number;
  /** Applied rotation in degrees, normalised to 0/90/180/270. */
  rotation: number;
  /** True when perspective correction was applied. */
  perspectiveCorrected: boolean;
  issues: VisionImageIssue[];
  /** Photo id this one duplicates, when it does. */
  duplicateOf: string | null;
  notes: string[];
}

/* ------------------------------------------------------------ detections */

/** A raw detection, before it is classified or merged. */
export interface VisionDetection {
  id: string;
  photoId: string;
  viewpoint: VisionViewpoint;
  /** Taxonomy key the detector proposed. */
  classKey: string;
  label: string;
  detectionConfidence: number;
  /** Normalised bounding box within the frame, 0–1. */
  box: { x: number; y: number; w: number; h: number };
  /** How many of this class the detector saw in this frame. */
  count: number;
}

/* -------------------------------------------------------- classification */

export type StorageType =
  | "boxed"
  | "furniture"
  | "appliance"
  | "electronics"
  | "wheeled"
  | "long_item"
  | "bulk"
  | "archive";

export type Orientation = "upright" | "flat" | "on_edge" | "as_found";

/**
 * A hazard flag is a prompt for a human check — never a finding of
 * illegality or criminality. Vision cannot and must not make that call.
 */
export type HazardFlag =
  | "none"
  | "check_battery"
  | "check_fuel"
  | "check_liquids"
  | "check_perishable"
  | "needs_human_review";

export type LiftClass = "one_person" | "two_person" | "heavy_lift" | "fragile_lift";

export interface VisionClassification {
  category: ItemCategory;
  subcategory: string;
  storageType: StorageType;
  fragile: boolean;
  stackable: boolean;
  maxStack: number;
  orientation: Orientation;
  handling: string;
  weightClass: WeightClass;
  hazard: HazardFlag;
  classificationConfidence: number;
}

/* ---------------------------------------------------------- measurements */

export interface VisionDimensions {
  /** Centimetres — the engine's single length unit. */
  widthCm: number;
  depthCm: number;
  heightCm: number;
  volumeM3: number;
  /** Square metres of outer surface, used for wrapping guidance. */
  surfaceAreaM2: number;
  /** Square metres of floor the item occupies as placed. */
  footprintM2: number;
  boundingBox: { widthCm: number; depthCm: number; heightCm: number };
  minCm: { width: number; depth: number; height: number };
  maxCm: { width: number; depth: number; height: number };
  dimensionConfidence: number;
  basis: string;
}

export interface VisionWeight {
  /** Kilograms per unit, estimated from volume and material class. */
  perUnitKg: number;
  totalKg: number;
  weightClass: WeightClass;
  liftClass: LiftClass;
  heavyLift: boolean;
  twoPersonLift: boolean;
  fragileLift: boolean;
  /** Kilograms this item can safely carry on top of it. */
  safeStackLoadKg: number;
  safeToStack: boolean;
  weightConfidence: number;
}

export type FragilityLevel = "none" | "low" | "moderate" | "high";

export type ProtectionMeasure =
  | "wrapping"
  | "padding"
  | "vertical_storage"
  | "climate_control"
  | "top_of_stack"
  | "corner_protection";

export interface VisionFragility {
  level: FragilityLevel;
  /** What made it fragile: glass, screen, electronics, artwork, mirror… */
  reasons: string[];
  measures: ProtectionMeasure[];
}

/* ------------------------------------------------------------ confidence */

/** Structured confidence — one number per stage plus the combined view. */
export interface VisionConfidence {
  detection: number;
  classification: number;
  dimension: number;
  weight: number;
  overall: number;
  band: "high" | "good" | "moderate" | "low";
  /** True when a human should look before this counts. */
  needsReview: boolean;
}

/* -------------------------------------------------------------- objects */

/** One thing someone owns, fully reasoned about. Always editable downstream. */
export interface VisionObject {
  id: string;
  classKey: string;
  label: string;
  quantity: number;
  classification: VisionClassification;
  dimensions: VisionDimensions;
  weight: VisionWeight;
  fragility: VisionFragility;
  confidence: VisionConfidence;
  /** Photos this object was proposed from. */
  photoIds: string[];
  viewpoints: VisionViewpoint[];
  /** Detections merged into this object. */
  detectionIds: string[];
  /** SpacePlanner catalogue id, when this class maps onto one. */
  catalogueId: string | null;
  /** Plain-English reasons, one per decision taken about this object. */
  explanations: string[];
}

/* -------------------------------------------------------- relationships */

export type VisionRelationKind =
  | "on_top_of"
  | "inside"
  | "leaning_against"
  | "beside"
  | "stacked_with";

/** How two observed objects sit relative to each other. */
export interface VisionRelationship {
  id: string;
  kind: VisionRelationKind;
  /** The object doing the resting/leaning. */
  subjectId: string;
  /** What it rests on, leans against or sits inside. */
  objectId: string;
  confidence: number;
  explanation: string;
}

/* --------------------------------------------------------------- scenes */

export type SceneFeatureKind =
  | "wall"
  | "door"
  | "window"
  | "ceiling"
  | "floor"
  | "shelving"
  | "walkway"
  | "obstacle";

/** A structural feature of a space. Prepared for host analysis; no UI yet. */
export interface VisionSceneFeature {
  id: string;
  kind: SceneFeatureKind;
  label: string;
  /** Centimetres where a size is meaningful (door width, ceiling height). */
  sizeCm: number | null;
  confidence: number;
  explanation: string;
}

export interface VisionScene {
  features: VisionSceneFeature[];
  floorAreaM2: number;
  usableAreaM2: number;
  ceilingHeightCm: number;
  walkwayWidthCm: number;
  obstacles: number;
  confidence: number;
  notes: string[];
}

/* ------------------------------------------------------------- metadata */

export interface VisionMetadata {
  engine: string;
  engineVersion: string;
  /** Detector behind the engine, e.g. `simulation`. Never a secret. */
  detector: string;
  contractVersion: string;
  producedAt: number;
  latencyMs: number;
  photoCount: number;
  stages: string[];
}

/* ------------------------------------------------------------ inventory */

export interface VisionInventory {
  objects: VisionObject[];
  relationships: VisionRelationship[];
  diagnostics: VisionDiagnostics[];
  /** Distinct object types. */
  objectCount: number;
  /** Total units across every object. */
  itemCount: number;
  volumeM3: number;
  weightKg: number;
  fragileCount: number;
  reviewCount: number;
  confidence: VisionConfidence;
  photoIds: string[];
  viewpoints: VisionViewpoint[];
  explanations: string[];
  metadata: VisionMetadata;
}
