/**
 * Space Intelligence Engine — data contracts (Milestone 2 + 10).
 *
 * Provider-independent by construction: nothing here names a vendor, a model
 * or a renderer. The same shapes will feed a Three.js digital twin later, so
 * every geometry figure is metric, absolute and measured from the back-left
 * floor corner of the space looking in from the opening.
 *
 * Two rules hold throughout, exactly as they do in vision:
 *   1. The engine OBSERVES and PROPOSES. Hosts confirm. Nothing is a survey.
 *   2. Every proposal carries a confidence and the reason behind it.
 */
import type { SpaceKind, StorageSpace, WeightClass } from "@/lib/spaceplanner/types";

export type { SpaceKind, StorageSpace, WeightClass };

export const SPACE_CONTRACT_VERSION = "space-1";

/* ------------------------------------------------------------- geometry */

/** A point on the plan, in metres from the back-left corner. */
export interface PlanPoint {
  x: number;
  y: number;
}

/** A rectangle on the plan, in metres. */
export interface PlanRect extends PlanPoint {
  w: number;
  d: number;
}

export interface FloorGeometry {
  widthM: number;
  depthM: number;
  areaM2: number;
  /** `level`, `sloped` or `stepped` — affects trolley access. */
  surface: "level" | "sloped" | "stepped";
  /** True when the floor is suitable for heavy point loads. */
  loadBearing: boolean;
}

export type WallSide = "back" | "left" | "right" | "front";

export interface WallGeometry {
  side: WallSide;
  lengthM: number;
  heightM: number;
  /** Area free of doors and windows, in m². */
  usableAreaM2: number;
  /** True when the wall can carry hooks, racks or wall mounts. */
  mountable: boolean;
}

export interface CeilingGeometry {
  heightM: number;
  /** Lowest point, where beams or a pitched roof intrude. */
  minHeightM: number;
  pitched: boolean;
  /** True when overhead racking is realistic. */
  supportsOverhead: boolean;
}

export interface DoorGeometry {
  id: string;
  side: WallSide;
  widthM: number;
  heightM: number;
  kind: "single" | "double" | "roller" | "hatch" | "open";
  /** Metres of clear space needed in front of the opening. */
  swingClearanceM: number;
}

export interface RoomGeometry {
  floor: FloorGeometry;
  walls: WallGeometry[];
  ceiling: CeilingGeometry;
  doors: DoorGeometry[];
}

/* ------------------------------------------------------------ obstacles */

export type ObstacleKind =
  | "pillar"
  | "beam"
  | "shelving"
  | "step"
  | "vehicle"
  | "tools"
  | "equipment"
  | "utility_box"
  | "water_pipe"
  | "low_ceiling";

export const OBSTACLE_KINDS: ObstacleKind[] = [
  "pillar",
  "beam",
  "shelving",
  "step",
  "vehicle",
  "tools",
  "equipment",
  "utility_box",
  "water_pipe",
  "low_ceiling",
];

export interface Obstacle {
  id: string;
  kind: ObstacleKind;
  label: string;
  /** Plan footprint in metres. Zero-area obstacles are overhead only. */
  footprint: PlanRect;
  /** Height above the floor the obstacle starts, in metres. */
  fromHeightM: number;
  /** Height above the floor the obstacle ends, in metres. */
  toHeightM: number;
  /** True when the host could realistically remove or relocate it. */
  removable: boolean;
  confidence: number;
  reason: string;
}

export interface Walkway {
  id: string;
  footprint: PlanRect;
  widthM: number;
  /** True when a trolley or sack barrow can use it. */
  trolleyFriendly: boolean;
}

export interface Shelf {
  id: string;
  side: WallSide;
  lengthM: number;
  depthM: number;
  levels: number;
  /** Safe load per level, in kilograms. Always an estimate. */
  loadPerLevelKg: number;
  capacityM3: number;
}

/* ---------------------------------------------------------------- zones */

export type ZoneKind =
  | "bikes"
  | "large_furniture"
  | "boxes"
  | "fragile"
  | "heavy"
  | "shelving"
  | "seasonal"
  | "vehicle"
  | "overflow"
  | "loading"
  | "access";

export const ZONE_KINDS: ZoneKind[] = [
  "bikes",
  "large_furniture",
  "boxes",
  "fragile",
  "heavy",
  "shelving",
  "seasonal",
  "vehicle",
  "overflow",
  "loading",
  "access",
];

/** Every zone carries capacity, restrictions, confidence and advice. */
export interface StorageZone {
  id: string;
  kind: ZoneKind;
  label: string;
  footprint: PlanRect;
  /** Usable height inside this zone, in metres. */
  heightM: number;
  areaM2: number;
  volumeM3: number;
  /** Heaviest class the zone should hold. */
  maxWeight: WeightClass;
  restrictions: string[];
  recommendations: string[];
  confidence: number;
  reason: string;
}

/** Zones that are not for storing things, kept as their own contracts. */
export interface ParkingZone {
  id: string;
  footprint: PlanRect;
  heightClearanceM: number;
  suits: Array<"car" | "van" | "motorcycle" | "trailer" | "bicycle">;
}

export interface LoadingZone {
  id: string;
  footprint: PlanRect;
  /** Metres from the kerb or driveway to the opening. */
  carryDistanceM: number;
  stepFree: boolean;
}

export interface AccessZone {
  id: string;
  footprint: PlanRect;
  widthM: number;
  connectsDoorId: string;
}

/* --------------------------------------------------------- calculations */

export interface UsableSpace {
  totalFloorAreaM2: number;
  usableFloorAreaM2: number;
  blockedAreaM2: number;
  walkableAreaM2: number;
  /** Mountable wall area, in m². */
  wallCapacityM2: number;
  ceilingVolumeM3: number;
  availableVolumeM3: number;
  deadSpaceM3: number;
  /** Usable volume as a share of the raw cube, 0–1. */
  storageDensity: number;
  /** Volume a realistic pack would occupy, in m³. */
  futureOccupancyM3: number;
}

export type AccessDifficulty = "easy" | "moderate" | "difficult" | "restricted";

export interface AccessAnalysis {
  doorWidthM: number;
  doorHeightM: number;
  /** Metres of clear floor needed to turn a long item through the opening. */
  turningRadiusM: number;
  walkwayWidthM: number;
  ceilingClearanceM: number;
  access: AccessDifficulty;
  loading: AccessDifficulty;
  /** Ordered plain-English route from the kerb to the back of the space. */
  route: string[];
  /** Largest single item that can realistically be brought in, in metres. */
  largestItemM: { widthM: number; heightM: number };
  notes: string[];
}

/* ---------------------------------------------------------- suitability */

export type SuitabilityUse =
  | "boxes"
  | "furniture"
  | "electronics"
  | "business"
  | "archive"
  | "sports"
  | "motorcycle"
  | "bicycle"
  | "vehicle"
  | "fragile"
  | "long_term";

export const SUITABILITY_USES: SuitabilityUse[] = [
  "boxes",
  "furniture",
  "electronics",
  "business",
  "archive",
  "sports",
  "motorcycle",
  "bicycle",
  "vehicle",
  "fragile",
  "long_term",
];

export type SuitabilityRating = "ideal" | "suitable" | "limited" | "unsuitable";

export interface SpaceSuitability {
  use: SuitabilityUse;
  label: string;
  rating: SuitabilityRating;
  /** 0–100, so surfaces can sort without re-deriving the rating. */
  score: number;
  confidence: number;
  reasons: string[];
  cautions: string[];
}

/* ------------------------------------------------------------ placement */

export type PlacementPriority = "high" | "medium" | "low";

export interface PlacementProposal {
  id: string;
  /** What is being placed, e.g. a catalogue id or class key. */
  subject: string;
  label: string;
  /** Where it should go, in plain English, e.g. "Back wall, floor level". */
  target: string;
  zoneId: string;
  /** `floor`, `shelf`, `wall`, `overhead` or `bay`. */
  surface: "floor" | "shelf" | "wall" | "overhead" | "bay";
  reason: string;
  evidence: string[];
  confidence: number;
  priority: PlacementPriority;
}

/* --------------------------------------------------------- optimisation */

export interface SpaceOptimisation {
  remainingVolumeM3: number;
  expansionVolumeM3: number;
  maximumCapacityM3: number;
  /** 0–1: how tightly a realistic pack fills the usable volume. */
  packingDensity: number;
  /** 0–1: usable volume against the raw cube. */
  spaceEfficiency: number;
  unusedAreas: string[];
  /** 0–100 headline figure for the space itself. */
  aiScore: number;
}

/* --------------------------------------------------------------- health */

export interface SpaceHealth {
  utilisation: number;
  deadSpace: number;
  accessibility: number;
  expansionPotential: number;
  organisation: number;
  efficiency: number;
  /** 0–100 overall, and the band surfaces show. */
  overall: number;
  band: "excellent" | "good" | "fair" | "needs_work";
}

/* ---------------------------------------------------------------- hosts */

export type HostActionKind =
  | "shelving"
  | "lighting"
  | "access"
  | "pricing"
  | "business_storage"
  | "loading"
  | "capacity"
  | "protection";

export interface HostRecommendation {
  id: string;
  kind: HostActionKind;
  action: string;
  reason: string;
  evidence: string[];
  /** Estimated extra monthly income in pence, or null when not a money move. */
  upliftPence: number | null;
  effort: "low" | "medium" | "high";
  confidence: number;
  priority: PlacementPriority;
}

/* ----------------------------------------------------------- compatible */

export interface SpaceCompatibility {
  /** 0–100 for the space on its own merits. */
  spaceScore: number;
  /** 0–100 for how well the host has prepared and described it. */
  hostScore: number;
  suitability: SuitabilityRating;
  accessibility: AccessDifficulty;
  risk: "low" | "medium" | "high";
  packingComplexity: "Easy" | "Moderate" | "Involved";
  futureCapacityM3: number;
  reasons: string[];
}

/* -------------------------------------------------------------- reports */

export type SpaceReportKind =
  | "summary"
  | "capacity"
  | "accessibility"
  | "efficiency"
  | "revenue"
  | "improvement";

export interface SpaceReportLine {
  label: string;
  value: string;
  detail?: string;
}

export interface SpaceReport {
  kind: SpaceReportKind;
  title: string;
  headline: string;
  lines: SpaceReportLine[];
  notes: string[];
}

/* -------------------------------------------------------- digital twin */

export interface TwinMeasurements {
  widthM: number;
  depthM: number;
  heightM: number;
  floorAreaM2: number;
  volumeM3: number;
  usableVolumeM3: number;
  /** Where each figure came from — nothing pretends to be surveyed. */
  source: "host_confirmed" | "ai_proposed" | "mixed";
}

export interface TwinSurface {
  id: string;
  kind: "floor" | "wall" | "ceiling" | "door" | "window";
  side: WallSide | null;
  /** Plan footprint for floors, elevation footprint for walls. Metres. */
  rect: PlanRect;
  mountable: boolean;
}

export interface TwinObject {
  id: string;
  label: string;
  /** Catalogue or class key, so a renderer can pick a mesh later. */
  modelKey: string;
  position: PlanPoint;
  /** Metres. `y` is depth on the plan; `heightM` is up. */
  sizeM: { widthM: number; depthM: number; heightM: number };
  /** Height of the object's base above the floor, in metres. */
  elevationM: number;
  rotationDeg: number;
  zoneId: string | null;
  fixed: boolean;
}

export interface TwinZone {
  id: string;
  kind: ZoneKind;
  label: string;
  rect: PlanRect;
  heightM: number;
}

export interface TwinMetadata {
  spaceId: string;
  spaceKind: SpaceKind;
  contractVersion: string;
  generatedAt: number;
  engine: string;
  /** Confidence in the twin as a whole, 0–1. */
  confidence: number;
}

export interface TwinHistoryEntry {
  at: number;
  /** What changed, e.g. `zones_regenerated` or `host_confirmed_measurements`. */
  change: string;
  by: "engine" | "host" | "renter";
  detail?: string;
}

export interface DigitalTwin {
  metadata: TwinMetadata;
  measurements: TwinMeasurements;
  surfaces: TwinSurface[];
  zones: TwinZone[];
  objects: TwinObject[];
  history: TwinHistoryEntry[];
}

/* ---------------------------------------------------------------- input */

/**
 * What the engine needs to analyse a space. Everything beyond the geometry is
 * optional: a bare `StorageSpace` is enough to get a full analysis.
 */
export interface SpaceAnalysisInput {
  space: StorageSpace;
  /** Obstacles the host confirmed or the vision engine proposed. */
  obstacles?: Obstacle[];
  shelves?: Shelf[];
  /** Host-declared features, e.g. `lighting`, `power`, `heated`, `cctv`. */
  features?: string[];
  /** Cubic metres already committed to live bookings. */
  occupiedVolumeM3?: number;
  /** Current asking price, in pence per month. */
  monthlyPence?: number;
  /** True when the host confirmed the measurements themselves. */
  hostConfirmed?: boolean;
}

/** The full structured output of one analysis run. */
export interface SpaceAnalysis {
  space: StorageSpace;
  geometry: RoomGeometry;
  obstacles: Obstacle[];
  shelves: Shelf[];
  walkways: Walkway[];
  zones: StorageZone[];
  parking: ParkingZone[];
  loading: LoadingZone[];
  accessZones: AccessZone[];
  usable: UsableSpace;
  access: AccessAnalysis;
  suitability: SpaceSuitability[];
  placements: PlacementProposal[];
  optimisation: SpaceOptimisation;
  health: SpaceHealth;
  hostRecommendations: HostRecommendation[];
  compatibility: SpaceCompatibility;
  twin: DigitalTwin;
  explanations: string[];
  confidence: number;
}
