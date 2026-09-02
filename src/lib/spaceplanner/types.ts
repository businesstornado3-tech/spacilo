/**
 * EarnRoom AI SpacePlanner™ — public demo domain model.
 *
 * Everything here is pure data and pure functions. There is no AI call, no
 * network request and no randomness: the same inventory and the same space
 * always produce the same plan. That matters twice over — visitors get an
 * honest, repeatable demonstration, and the whole engine is unit-testable.
 *
 * FUTURE HOOK: the real vision/optimisation engine implements `SpacePlanner`
 * (see ./index.ts) and the UI keeps working unchanged.
 */

export type WeightClass = "light" | "medium" | "heavy";

export type ItemCategory =
  | "boxes"
  | "furniture"
  | "appliances"
  | "electronics"
  | "leisure"
  | "seasonal";

/** Icon name resolved by the presentation layer — the engine stays icon-free. */
export type IconKey =
  | "box"
  | "bike"
  | "tv"
  | "wardrobe"
  | "mattress"
  | "table"
  | "suitcase"
  | "books"
  | "desk"
  | "chair"
  | "sports"
  | "guitar"
  | "tree"
  | "appliance"
  | "luggage";

export interface CatalogueItem {
  id: string;
  name: string;
  category: ItemCategory;
  icon: IconKey;
  /** Estimated dimensions in centimetres. */
  width: number;
  depth: number;
  height: number;
  fragile: boolean;
  stackable: boolean;
  /** How many of this item may safely sit in one stack. */
  maxStack: number;
  weight: WeightClass;
  /** True when the item is safely stored stood on its edge. */
  standsUpright: boolean;
  /** Renters typically reach for these mid-stay, so they belong near the door. */
  frequentlyUsed: boolean;
  popular: boolean;
}

export interface InventoryLine {
  item: CatalogueItem;
  quantity: number;
}

export type SpaceKind =
  | "garage"
  | "bedroom"
  | "container"
  | "warehouse"
  | "loft"
  | "shed"
  | "commercial"
  | "storage_room"
  | "parking";

export interface StorageSpace {
  id: string;
  name: string;
  kind: SpaceKind;
  /** Usable internal dimensions in metres. */
  width: number;
  depth: number;
  height: number;
  /** Where the opening sits in the plan view. */
  door: "front";
  doorWidth: number;
  blurb: string;
}

export type Zone = "back" | "middle" | "front";

export interface Placement {
  key: string;
  itemId: string;
  label: string;
  icon: IconKey;
  /** Plan-view footprint in metres, measured from the back-left corner. */
  x: number;
  y: number;
  w: number;
  d: number;
  /** 0 = on the floor, 1 = stacked once, and so on. */
  level: number;
  /** How many units of the item this footprint represents. */
  units: number;
  rotated: boolean;
  upright: boolean;
  fragile: boolean;
  weight: WeightClass;
  zone: Zone;
}

export interface Walkway {
  x: number;
  y: number;
  w: number;
  d: number;
}

export interface PackResult {
  placements: Placement[];
  walkway: Walkway | null;
  /** Item ids that did not fit in the usable footprint. */
  unplaced: string[];
  floorAreaUsed: number;
  stackedUnits: number;
}

export interface PlanMetrics {
  /** Percentages, 0–100, always presented as estimates. */
  utilisation: number;
  utilisationBefore: number;
  compatibility: number;
  retrieval: number;
  accessibility: number;
  stackingEfficiency: number;
  /** Cubic metres. */
  itemVolume: number;
  requiredVolume: number;
  usableVolume: number;
  remainingCapacity: number;
  fragileProtected: boolean;
  heavyItemsLow: boolean;
  walkwayPreserved: boolean;
  everythingFits: boolean;
}

export interface SpacePlan {
  space: StorageSpace;
  lines: InventoryLine[];
  before: PackResult;
  after: PackResult;
  metrics: PlanMetrics;
  /** Plain-English reasons, derived from the real placements above. */
  explanations: string[];
  itemCount: number;
}
