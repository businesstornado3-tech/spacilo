/**
 * Detection taxonomy.
 *
 * The complete vocabulary the Vision Engine may propose, with cautious UK
 * estimates. It extends the existing Spacilo Vision taxonomy rather than
 * replacing it: every entry either reuses a class already defined there or
 * adds a new one, and both feed the same SpacePlanner catalogue.
 *
 * Adding a detectable thing is a single row here — no stage changes.
 */
import type { ItemCategory, WeightClass } from "@/lib/spaceplanner/types";
import { VISION_CLASSES } from "@/lib/vision/taxonomy";

import type { HazardFlag, Orientation, StorageType } from "./contracts";

export interface DetectionClass {
  key: string;
  label: string;
  category: ItemCategory;
  subcategory: string;
  storageType: StorageType;
  /** Cautious estimates in centimetres. */
  width: number;
  depth: number;
  height: number;
  weight: WeightClass;
  fragile: boolean;
  stackable: boolean;
  maxStack: number;
  orientation: Orientation;
  handling: string;
  hazard: HazardFlag;
  /** SpacePlanner catalogue id, when one exists. */
  catalogueId: string | null;
  /** Visual cue the detector matched on — used in explanations. */
  cue: string;
}

const existing = new Map(VISION_CLASSES.map((entry) => [entry.key, entry]));

interface Extras {
  subcategory: string;
  storageType: StorageType;
  cue: string;
  handling?: string;
  hazard?: HazardFlag;
  orientation?: Orientation;
  maxStack?: number;
  dims?: [number, number, number];
  weight?: WeightClass;
  fragile?: boolean;
  stackable?: boolean;
  category?: ItemCategory;
  catalogueId?: string | null;
  label?: string;
}

/** Builds a class, inheriting from the shared taxonomy where it already exists. */
function d(key: string, extras: Extras): DetectionClass {
  const base = existing.get(key);
  const dims = extras.dims ??
    (base ? [base.width, base.depth, base.height] : [50, 40, 40]);
  const stackable = extras.stackable ?? base?.stackable ?? false;
  return {
    key,
    label: extras.label ?? base?.label ?? key,
    category: extras.category ?? base?.category ?? "boxes",
    subcategory: extras.subcategory,
    storageType: extras.storageType,
    width: dims[0]!,
    depth: dims[1]!,
    height: dims[2]!,
    weight: extras.weight ?? base?.weight ?? "medium",
    fragile: extras.fragile ?? base?.fragile ?? false,
    stackable,
    maxStack: extras.maxStack ?? (stackable ? 3 : 1),
    orientation: extras.orientation ?? "as_found",
    handling: extras.handling ?? "Standard handling.",
    hazard: extras.hazard ?? "none",
    catalogueId: extras.catalogueId ?? base?.catalogueId ?? null,
    cue: extras.cue,
  };
}

export const DETECTION_CLASSES: DetectionClass[] = [
  /* Boxes and containers */
  d("medium-box", {
    subcategory: "Cardboard box",
    storageType: "boxed",
    cue: "rectangular cardboard faces with taped seams",
    maxStack: 4,
    handling: "Stack heaviest at the bottom.",
  }),
  d("large-box", { subcategory: "Cardboard box", storageType: "boxed", cue: "large flat cardboard faces", maxStack: 3 }),
  d("book-crate", { subcategory: "Crate", storageType: "boxed", cue: "small dense crate proportions", handling: "Heavy for its size — keep low." }),
  d("suitcase", { subcategory: "Luggage", storageType: "boxed", cue: "wheeled case with a telescopic handle" }),
  d("plastic-tub", { subcategory: "Plastic container", storageType: "boxed", cue: "translucent tub with clip lid", maxStack: 4 }),
  d("storage-bin", {
    label: "Storage bin",
    subcategory: "Plastic container",
    storageType: "boxed",
    category: "boxes",
    dims: [55, 38, 30],
    weight: "medium",
    stackable: true,
    maxStack: 4,
    catalogueId: "large-box",
    cue: "moulded plastic bin with handles",
  }),
  d("archive-box", { subcategory: "Business archive", storageType: "archive", cue: "uniform lidded archive cartons", maxStack: 5 }),
  d("retail-stock", {
    label: "Retail stock",
    subcategory: "Business stock",
    storageType: "archive",
    category: "boxes",
    dims: [60, 40, 40],
    weight: "medium",
    stackable: true,
    maxStack: 4,
    catalogueId: "large-box",
    cue: "repeated identical cartons on a pallet footprint",
  }),
  d("office-storage", {
    label: "Office storage",
    subcategory: "Business storage",
    storageType: "archive",
    category: "boxes",
    dims: [45, 35, 35],
    weight: "medium",
    stackable: true,
    maxStack: 4,
    catalogueId: "medium-box",
    cue: "labelled office cartons and folders",
  }),

  /* Furniture */
  d("wardrobe", { subcategory: "Bedroom furniture", storageType: "furniture", orientation: "upright", cue: "tall двух-door cabinet outline", handling: "Store upright; empty before moving." }),
  d("chest-drawers", { subcategory: "Bedroom furniture", storageType: "furniture", orientation: "upright", cue: "stacked drawer fronts with handles" }),
  d("bed-frame", { subcategory: "Bed", storageType: "furniture", orientation: "on_edge", cue: "slatted frame and headboard panel", handling: "Dismantle where possible." }),
  d("double-mattress", { subcategory: "Mattress", storageType: "bulk", orientation: "on_edge", cue: "quilted rectangular surface, double width", handling: "Store on edge against a wall, bagged." }),
  d("single-mattress", { subcategory: "Mattress", storageType: "bulk", orientation: "on_edge", cue: "quilted rectangular surface, single width" }),
  d("two-seater-sofa", { subcategory: "Sofa", storageType: "bulk", cue: "upholstered arms and back cushions", handling: "Two people; protect upholstery." }),
  d("dining-table", { subcategory: "Table", storageType: "furniture", cue: "flat top on four legs at dining height", handling: "Remove legs if they detach." }),
  d("coffee-table", {
    label: "Coffee table",
    subcategory: "Table",
    storageType: "furniture",
    category: "furniture",
    dims: [110, 60, 45],
    weight: "medium",
    catalogueId: "dining-table",
    cue: "low table top at seating height",
  }),
  d("dining-chair", { subcategory: "Chair", storageType: "furniture", cue: "seat, back and four legs", maxStack: 4, stackable: true }),
  d("bookcase", { subcategory: "Shelving", storageType: "furniture", orientation: "upright", cue: "repeated horizontal shelves in a tall frame" }),
  d("shelving-unit", {
    label: "Shelving unit",
    subcategory: "Shelving",
    storageType: "furniture",
    category: "furniture",
    dims: [90, 45, 180],
    weight: "heavy",
    orientation: "upright",
    catalogueId: "wardrobe",
    cue: "open metal or wooden shelf tiers",
  }),
  d("desk", { subcategory: "Office furniture", storageType: "furniture", cue: "work surface with cable ports or drawers" }),
  d("office-chair", { subcategory: "Office furniture", storageType: "wheeled", cue: "gas lift column on a castor base" }),
  d("filing-cabinet", { subcategory: "Office furniture", storageType: "furniture", orientation: "upright", cue: "metal drawer stack with lock" }),

  /* Electronics */
  d("television", { subcategory: "Screen", storageType: "electronics", orientation: "upright", cue: "thin bezel around a flat panel", handling: "Store upright, screen padded.", fragile: true }),
  d("monitor", { subcategory: "Screen", storageType: "electronics", orientation: "upright", cue: "panel on an adjustable stand", fragile: true }),
  d("desktop-pc", { subcategory: "Computer", storageType: "electronics", cue: "vented tower case with ports", fragile: true }),

  /* Appliances */
  d("fridge-freezer", { subcategory: "Cold appliance", storageType: "appliance", orientation: "upright", cue: "tall door seal and hinge line", handling: "Defrost, dry and store upright.", hazard: "check_perishable" }),
  d("freezer", {
    label: "Freezer",
    subcategory: "Cold appliance",
    storageType: "appliance",
    category: "appliances",
    dims: [60, 60, 145],
    weight: "heavy",
    orientation: "upright",
    catalogueId: "appliance",
    handling: "Defrost fully and leave the door ajar.",
    hazard: "check_perishable",
    cue: "single-door appliance with a compressor recess",
  }),
  d("washing-machine", { subcategory: "Laundry appliance", storageType: "appliance", orientation: "upright", cue: "circular drum door in a square front", handling: "Drain fully; fit transit bolts.", hazard: "check_liquids" }),
  d("tumble-dryer", {
    label: "Tumble dryer",
    subcategory: "Laundry appliance",
    storageType: "appliance",
    category: "appliances",
    dims: [60, 60, 85],
    weight: "heavy",
    orientation: "upright",
    catalogueId: "appliance",
    handling: "Empty the condenser tank before storing.",
    hazard: "check_liquids",
    cue: "drum door with a vent or condenser tray",
  }),
  d("microwave", { subcategory: "Kitchen appliance", storageType: "appliance", cue: "glass door panel with a control strip", fragile: true }),

  /* Leisure, sport and outdoors */
  d("bicycle", { subcategory: "Cycle", storageType: "wheeled", cue: "two wheels joined by a triangular frame", handling: "Turn the bars in line with the frame." }),
  d("motorcycle", {
    label: "Motorcycle",
    subcategory: "Powered vehicle",
    storageType: "wheeled",
    category: "leisure",
    dims: [210, 80, 120],
    weight: "heavy",
    catalogueId: "bicycle",
    handling: "A person must confirm the fuel and battery state.",
    hazard: "check_fuel",
    cue: "engine block between two road wheels",
  }),
  d("scooter", {
    label: "Scooter",
    subcategory: "Powered vehicle",
    storageType: "wheeled",
    category: "leisure",
    dims: [120, 50, 105],
    weight: "medium",
    catalogueId: "bicycle",
    handling: "A person must confirm the battery type.",
    hazard: "check_battery",
    cue: "deck between a small front and rear wheel",
  }),
  d("pushchair", { subcategory: "Child equipment", storageType: "wheeled", cue: "folding frame on four small wheels" }),
  d("childrens-toys", {
    label: "Children's toys",
    subcategory: "Child equipment",
    storageType: "bulk",
    category: "leisure",
    dims: [60, 45, 45],
    weight: "light",
    stackable: true,
    maxStack: 3,
    catalogueId: "medium-box",
    cue: "mixed bright plastic shapes grouped together",
  }),
  d("golf-clubs", { subcategory: "Sports equipment", storageType: "long_item", orientation: "upright", cue: "shafts fanned inside a tall bag" }),
  d("gym-equipment", { subcategory: "Sports equipment", storageType: "bulk", cue: "weighted frame with padded surfaces", handling: "Very heavy — keep on the floor." }),
  d("sports-equipment", {
    label: "Sports equipment",
    subcategory: "Sports equipment",
    storageType: "bulk",
    category: "leisure",
    dims: [90, 50, 50],
    weight: "medium",
    stackable: true,
    catalogueId: "sports-kit",
    cue: "mixed kit bags, bats and balls",
  }),
  d("camping-gear", { subcategory: "Outdoor equipment", storageType: "bulk", cue: "rolled tent and folded poles", maxStack: 3 }),
  d("guitar", { subcategory: "Musical instrument", storageType: "long_item", orientation: "upright", cue: "shaped hard case with latches", handling: "Keep upright, away from damp." }),
  d("keyboard-piano", { subcategory: "Musical instrument", storageType: "long_item", cue: "long low case with a key ridge" }),
  d("surfboard", { subcategory: "Outdoor equipment", storageType: "long_item", orientation: "on_edge", cue: "long tapered board profile" }),

  /* Garden, seasonal and tools */
  d("garden-tools", { subcategory: "Garden equipment", storageType: "long_item", orientation: "upright", cue: "long handles bundled together" }),
  d("lawnmower", { subcategory: "Garden equipment", storageType: "wheeled", cue: "cutting deck on four wheels", handling: "A person must confirm the fuel or battery state.", hazard: "check_fuel" }),
  d("garden-furniture", { subcategory: "Garden equipment", storageType: "bulk", cue: "weatherproof table and stacked chairs" }),
  d("christmas-decorations", { subcategory: "Seasonal", storageType: "boxed", cue: "labelled seasonal boxes with a tree bag", maxStack: 3 }),
  d("toolbox", {
    label: "Toolbox",
    subcategory: "Tools",
    storageType: "boxed",
    category: "seasonal",
    dims: [55, 30, 30],
    weight: "heavy",
    stackable: true,
    maxStack: 2,
    catalogueId: "book-crate",
    handling: "Heavy for its size — keep at floor level.",
    cue: "hinged case with a carry handle and clasps",
  }),
  d("ladder", {
    label: "Ladder",
    subcategory: "Tools",
    storageType: "long_item",
    category: "seasonal",
    dims: [200, 45, 20],
    weight: "medium",
    orientation: "on_edge",
    catalogueId: "sports-kit",
    handling: "Store flat against a wall.",
    cue: "parallel rails with evenly spaced rungs",
  }),
  d("tyres", {
    label: "Tyres",
    subcategory: "Vehicle parts",
    storageType: "bulk",
    category: "seasonal",
    dims: [65, 65, 25],
    weight: "heavy",
    stackable: true,
    maxStack: 4,
    catalogueId: "book-crate",
    handling: "Stack flat, no more than four high.",
    cue: "circular tread profile stacked in pairs",
  }),
];

// Guard against a duplicated key silently shadowing an earlier row.
export const DETECTION_CLASS_BY_KEY = new Map(
  DETECTION_CLASSES.map((entry) => [entry.key, entry] as const),
);

export const DETECTION_CLASS_KEYS = DETECTION_CLASSES.map((entry) => entry.key);

/** Every subcategory the engine can propose, for filters and grouping. */
export const DETECTION_SUBCATEGORIES = [
  ...new Set(DETECTION_CLASSES.map((entry) => entry.subcategory)),
].sort();

export function detectionClass(key: string): DetectionClass | null {
  return DETECTION_CLASS_BY_KEY.get(key) ?? null;
}
