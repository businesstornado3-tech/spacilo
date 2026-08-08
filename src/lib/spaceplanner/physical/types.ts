/**
 * Phase 6E — the physical planning domain.
 *
 * PRINCIPLE: the image model is a visualisation layer, never the planner. What
 * goes where is decided here, in metres, against hard physical constraints, and
 * only a plan that survives validation is allowed to reach the image model.
 *
 * Coordinates are metres measured from the back-left corner of the space.
 * `y` grows towards the opening, so `y = depthM` is the front (door) edge —
 * the same convention the existing pack engine uses.
 */
import type { WeightClass } from "../types";
import type { QualityGateResult } from "./quality";

export interface Rect {
  x: number;
  y: number;
  w: number;
  d: number;
}

/** How a dimension was arrived at. Uncertainty is represented, never hidden. */
export type DimensionBasis = "measured" | "confirmed" | "estimated";

/** One confirmed thing to store. Identity is the canonical ITEM-nnn id. */
export interface PlanningItem {
  id: string;
  label: string;
  category: string;
  quantity: number;
  widthCm: number;
  depthCm: number;
  heightCm: number;
  weight: WeightClass;
  stackable: boolean;
  fragile: boolean;
  /** Soft goods may lose a little volume; rigid objects never may. */
  compressible: boolean;
  /** True when the item is safely stored stood on its edge. */
  allowUpright: boolean;
  /** Parts of a composite object. Never planned as separate items. */
  components: string[];
  confidence: number;
  dimensionBasis: DimensionBasis;
  photoIds: string[];
  selectionId?: string;
}

export type ObstacleKind = "fixed_furniture" | "excluded" | "obstacle" | "doorway";

export interface Obstacle extends Rect {
  id: string;
  label: string;
  kind: ObstacleKind;
}

/** The space the planner is allowed to work inside. */
export interface PlanningSpace {
  id: string;
  name: string;
  widthM: number;
  depthM: number;
  heightM: number;
  /** False when the ceiling was never observed — stacking stays conservative. */
  heightKnown: boolean;
  /** Floor the user approved for storage. Never larger than the space. */
  usable: Rect;
  /** Opening on the front edge, measured across the width. */
  doorway: { x: number; w: number };
  /** Minimum clear access corridor, in metres. Configurable, never hardcoded. */
  walkwayClearanceM: number;
  /**
   * Where the access corridor runs. A corridor down one side leaves the
   * storage as one contiguous block, which is what real storage looks like;
   * a central corridor splits it in two. Defaults to "centre".
   */
  corridorSide?: CorridorSide;
  /** Clear depth kept immediately inside the opening. */
  doorwayClearanceM: number;
  /** Fixed furniture, user exclusions and anything that must stay unobstructed. */
  obstacles: Obstacle[];
  dimensionBasis: DimensionBasis;
  confidence: number;
}

export type PlacementZone =
  | "back-wall"
  | "left-wall"
  | "right-wall"
  | "corner"
  | "interior";

export type Orientation = "flat" | "rotated" | "upright";

/** One placed footprint. A stack of identical units is one entry. */
export interface ArrangementEntry extends Rect {
  key: string;
  itemId: string;
  label: string;
  /** Units of the item represented by this footprint (a stack of 3 = 3). */
  units: number;
  /** Footprint height in metres, including everything stacked in it. */
  heightM: number;
  /** Height of the floor this entry stands on. 0 = the floor itself. */
  baseHeightM: number;
  layer: number;
  rotationDeg: 0 | 90;
  orientation: Orientation;
  zone: PlacementZone;
  /** Items resting on this one. */
  supportsItemIds: string[];
  supportedBy: string | null;
  /** Items placed as one contiguous cluster share a group. */
  groupId: string;
  fragile: boolean;
  weight: WeightClass;
  confidence: number;
}

export interface UnplacedItem {
  itemId: string;
  label: string;
  units: number;
  reason: string;
}

export type ViolationCode =
  | "missing_item"
  | "invented_item"
  | "outside_usable_area"
  | "collision"
  | "doorway_blocked"
  | "walkway_blocked"
  | "obstacle_blocked"
  | "exceeds_height"
  | "unsupported_orientation"
  | "unrealistic_stack";

export interface Violation {
  code: ViolationCode;
  message: string;
  itemId?: string;
}

export interface ArrangementScore {
  total: number;
  completeness: number;
  access: number;
  compactness: number;
  wallUse: number;
  verticalUse: number;
  grouping: number;
  /** 0–100 consolidation objective. Higher means less scatter. */
  antiScatter: number;
  penalties: number;
}

export interface PhysicalArrangement {
  space: PlanningSpace;
  entries: ArrangementEntry[];
  unplaced: UnplacedItem[];
  /** The access corridor the plan actually preserved. */
  walkway: Rect | null;
  /** Metres² and metres³ derived from the placed geometry, never from a sum of item volumes alone. */
  occupiedFloorM2: number;
  occupiedVolumeM3: number;
  usableFloorM2: number;
  usableVolumeM3: number;
  excludedFloorM2: number;
  walkwayFloorM2: number;
  /** 0–100, occupied share of usable storage volume. */
  utilisationPercent: number;
  placedUnits: number;
  expectedUnits: number;
  valid: boolean;
  violations: Violation[];
  score: ArrangementScore;
  /** Which deterministic packing strategy produced this plan. */
  strategy: string;
  /** The arrangement-quality gate result for this plan. */
  quality: QualityGateResult;
}
