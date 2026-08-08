/**
 * Milestone 4 — the real-world object library.
 *
 * Every catalogue item resolves to a mesh recipe: a handful of proportioned
 * boxes and cylinders with a palette role each. Recipes are data, not
 * geometry, so the same library drives the WebGL scene, a future WebXR
 * session, and any print/report renderer without duplication.
 *
 * Style rule: low-poly, premium architectural visualisation. Not a game, not
 * photoreal — readable silhouettes with honest proportions.
 */
import type { IconKey } from "@/lib/spaceplanner/types";

/** Palette roles, resolved to real colours by the renderer's theme. */
export type MaterialRole =
  | "card"
  | "cardboard"
  | "fabric"
  | "metal"
  | "wood"
  | "glass"
  | "screen"
  | "rubber"
  | "accent"
  | "plastic";

export type PartShape = "box" | "cylinder" | "panel";

/**
 * One part of a model, expressed as fractions of the object's bounding box so
 * a recipe scales to any real measurement without being re-authored.
 */
export interface ModelPart {
  shape: PartShape;
  material: MaterialRole;
  /** Centre offset within the bounding box, 0–1 on each axis (0.5 = centre). */
  at: [number, number, number];
  /** Size as a fraction of the bounding box on each axis. */
  size: [number, number, number];
  /** Rotation about the depth axis in degrees, for wheels and lids. */
  tiltDeg?: number;
}

export interface ModelRecipe {
  key: string;
  label: string;
  parts: ModelPart[];
  /** Level-of-detail floor: parts beyond this index are dropped when far. */
  lodParts: number;
}

const box = (
  material: MaterialRole,
  at: [number, number, number],
  size: [number, number, number],
): ModelPart => ({ shape: "box", material, at, size });

const cyl = (
  material: MaterialRole,
  at: [number, number, number],
  size: [number, number, number],
  tiltDeg = 90,
): ModelPart => ({ shape: "cylinder", material, at, size, tiltDeg });

/** The default: an honest proportioned crate. Never an error state. */
const GENERIC: ModelRecipe = {
  key: "generic",
  label: "Item",
  parts: [box("card", [0.5, 0.5, 0.5], [1, 1, 1])],
  lodParts: 1,
};

function recipe(key: string, label: string, parts: ModelPart[], lodParts = 1): ModelRecipe {
  return { key, label, parts, lodParts };
}

const CARTON = (key: string, label: string) =>
  recipe(
    key,
    label,
    [
      box("cardboard", [0.5, 0.5, 0.5], [1, 1, 1]),
      box("accent", [0.5, 1, 0.5], [1.02, 0.06, 1.02]),
      box("accent", [0.5, 0.5, 0.5], [1.03, 0.05, 0.2]),
    ],
    1,
  );

const BIKE = (key: string, label: string, tyre: number) =>
  recipe(
    key,
    label,
    [
      cyl("rubber", [0.16, 0.3, 0.5], [tyre, 0.08, tyre]),
      cyl("rubber", [0.84, 0.3, 0.5], [tyre, 0.08, tyre]),
      box("metal", [0.5, 0.45, 0.5], [0.6, 0.06, 0.1]),
      box("metal", [0.42, 0.62, 0.5], [0.08, 0.4, 0.08]),
      box("accent", [0.28, 0.86, 0.5], [0.06, 0.08, 0.5]),
      box("fabric", [0.62, 0.82, 0.5], [0.16, 0.08, 0.14]),
    ],
    3,
  );

const WHITE_GOODS = (key: string, label: string, hasDoor: boolean) =>
  recipe(
    key,
    label,
    [
      box("plastic", [0.5, 0.5, 0.5], [1, 1, 1]),
      hasDoor
        ? cyl("glass", [0.5, 0.55, 0.02], [0.55, 0.06, 0.55], 0)
        : box("metal", [0.5, 0.5, 0.02], [0.9, 0.94, 0.05]),
      box("metal", [0.5, 0.94, 0.06], [0.7, 0.06, 0.08]),
    ],
    1,
  );

const RECIPES: ModelRecipe[] = [
  /* boxes and containers ------------------------------------------------ */
  CARTON("medium-box", "Medium box"),
  CARTON("large-box", "Large box"),
  CARTON("book-crate", "Book crate"),
  CARTON("archive-box", "Archive box"),
  CARTON("retail-stock", "Retail stock"),
  recipe(
    "storage-bin",
    "Storage bin",
    [
      box("plastic", [0.5, 0.46, 0.5], [1, 0.92, 1]),
      box("accent", [0.5, 0.96, 0.5], [1.04, 0.08, 1.04]),
    ],
    1,
  ),
  recipe(
    "suitcase",
    "Suitcase",
    [
      box("fabric", [0.5, 0.5, 0.5], [1, 1, 1]),
      box("accent", [0.5, 0.5, 0.52], [1.02, 0.1, 1.02]),
      box("metal", [0.5, 1.05, 0.5], [0.3, 0.1, 0.08]),
    ],
    1,
  ),

  /* leisure -------------------------------------------------------------- */
  BIKE("bicycle", "Bicycle", 0.55),
  BIKE("mountain-bike", "Mountain bike", 0.58),
  BIKE("road-bike", "Road bike", 0.52),
  recipe(
    "golf-clubs",
    "Golf clubs",
    [
      cyl("fabric", [0.5, 0.45, 0.5], [0.7, 0.9, 0.7], 0),
      box("metal", [0.5, 0.98, 0.5], [0.5, 0.1, 0.5]),
    ],
    1,
  ),
  recipe(
    "camping-kit",
    "Camping equipment",
    [cyl("fabric", [0.5, 0.5, 0.5], [0.8, 0.95, 0.8]), box("accent", [0.5, 0.5, 0.5], [1.02, 0.12, 0.3])],
    1,
  ),
  recipe(
    "sports-kit",
    "Sports kit",
    [box("fabric", [0.5, 0.5, 0.5], [1, 1, 1]), box("accent", [0.5, 0.7, 0.5], [1.02, 0.14, 1.02])],
    1,
  ),
  recipe(
    "pushchair",
    "Pushchair",
    [
      box("fabric", [0.5, 0.7, 0.5], [0.8, 0.5, 0.8]),
      box("metal", [0.5, 0.35, 0.5], [0.1, 0.5, 0.6]),
      cyl("rubber", [0.2, 0.1, 0.3], [0.2, 0.08, 0.2]),
      cyl("rubber", [0.8, 0.1, 0.7], [0.2, 0.08, 0.2]),
    ],
    2,
  ),
  recipe(
    "toys",
    "Children's toys",
    [box("plastic", [0.5, 0.5, 0.5], [1, 1, 1]), box("accent", [0.5, 0.75, 0.5], [1.02, 0.2, 1.02])],
    1,
  ),

  /* electronics ---------------------------------------------------------- */
  recipe(
    "television",
    "Television",
    [
      box("screen", [0.5, 0.55, 0.5], [1, 0.86, 0.18]),
      box("metal", [0.5, 0.06, 0.5], [0.4, 0.12, 0.6]),
    ],
    1,
  ),
  recipe(
    "monitor",
    "Monitor",
    [box("screen", [0.5, 0.6, 0.5], [1, 0.78, 0.16]), box("metal", [0.5, 0.1, 0.5], [0.3, 0.2, 0.5])],
    1,
  ),

  /* furniture ------------------------------------------------------------ */
  recipe(
    "wardrobe",
    "Wardrobe",
    [
      box("wood", [0.5, 0.5, 0.5], [1, 1, 1]),
      box("accent", [0.5, 0.5, 0.02], [0.03, 0.9, 0.06]),
      box("metal", [0.44, 0.5, 0.01], [0.03, 0.16, 0.05]),
    ],
    1,
  ),
  recipe(
    "bookshelf",
    "Bookshelf",
    [
      box("wood", [0.5, 0.5, 0.5], [1, 1, 1]),
      box("card", [0.5, 0.33, 0.55], [0.9, 0.05, 0.8]),
      box("card", [0.5, 0.66, 0.55], [0.9, 0.05, 0.8]),
    ],
    1,
  ),
  recipe(
    "desk",
    "Desk",
    [
      box("wood", [0.5, 0.94, 0.5], [1, 0.08, 1]),
      box("metal", [0.06, 0.47, 0.1], [0.07, 0.94, 0.07]),
      box("metal", [0.94, 0.47, 0.1], [0.07, 0.94, 0.07]),
      box("metal", [0.06, 0.47, 0.9], [0.07, 0.94, 0.07]),
      box("metal", [0.94, 0.47, 0.9], [0.07, 0.94, 0.07]),
    ],
    1,
  ),
  recipe(
    "office-chair",
    "Office chair",
    [
      box("fabric", [0.5, 0.55, 0.5], [0.9, 0.14, 0.9]),
      box("fabric", [0.5, 0.8, 0.12], [0.9, 0.4, 0.16]),
      box("metal", [0.5, 0.28, 0.5], [0.12, 0.4, 0.12]),
      cyl("plastic", [0.5, 0.05, 0.5], [0.9, 0.08, 0.9], 0),
    ],
    2,
  ),
  recipe(
    "dining-table",
    "Dining table",
    [
      box("wood", [0.5, 0.92, 0.5], [1, 0.1, 1]),
      box("wood", [0.08, 0.46, 0.08], [0.08, 0.92, 0.08]),
      box("wood", [0.92, 0.46, 0.92], [0.08, 0.92, 0.08]),
    ],
    1,
  ),
  recipe(
    "dining-chair",
    "Dining chair",
    [
      box("wood", [0.5, 0.5, 0.5], [0.9, 0.1, 0.9]),
      box("wood", [0.5, 0.78, 0.1], [0.9, 0.44, 0.12]),
      box("wood", [0.1, 0.24, 0.1], [0.09, 0.48, 0.09]),
      box("wood", [0.9, 0.24, 0.9], [0.09, 0.48, 0.09]),
    ],
    2,
  ),
  recipe(
    "sofa",
    "Sofa",
    [
      box("fabric", [0.5, 0.35, 0.5], [1, 0.5, 1]),
      box("fabric", [0.5, 0.7, 0.15], [1, 0.6, 0.3]),
      box("fabric", [0.05, 0.6, 0.5], [0.1, 0.5, 1]),
      box("fabric", [0.95, 0.6, 0.5], [0.1, 0.5, 1]),
    ],
    2,
  ),
  recipe(
    "mattress",
    "Mattress",
    [box("fabric", [0.5, 0.5, 0.5], [1, 1, 1]), box("accent", [0.5, 0.5, 0.5], [1.02, 0.12, 1.02])],
    1,
  ),
  recipe(
    "bed-frame",
    "Bed frame",
    [
      box("wood", [0.5, 0.3, 0.5], [1, 0.2, 1]),
      box("wood", [0.5, 0.7, 0.04], [1, 0.6, 0.08]),
    ],
    1,
  ),

  /* tools and garage ------------------------------------------------------ */
  recipe(
    "toolbox",
    "Toolbox",
    [
      box("metal", [0.5, 0.45, 0.5], [1, 0.9, 1]),
      box("accent", [0.5, 0.95, 0.5], [1.02, 0.1, 1.02]),
      box("plastic", [0.5, 1.06, 0.5], [0.35, 0.08, 0.1]),
    ],
    1,
  ),
  recipe(
    "ladder",
    "Ladder",
    [
      box("metal", [0.12, 0.5, 0.5], [0.1, 1, 0.3]),
      box("metal", [0.88, 0.5, 0.5], [0.1, 1, 0.3]),
      box("metal", [0.5, 0.3, 0.5], [0.9, 0.05, 0.25]),
      box("metal", [0.5, 0.6, 0.5], [0.9, 0.05, 0.25]),
      box("metal", [0.5, 0.9, 0.5], [0.9, 0.05, 0.25]),
    ],
    2,
  ),
  recipe(
    "garden-tools",
    "Garden tools",
    [
      box("metal", [0.35, 0.5, 0.5], [0.12, 1, 0.12]),
      box("metal", [0.65, 0.5, 0.5], [0.12, 1, 0.12]),
      box("wood", [0.5, 0.08, 0.5], [0.8, 0.16, 0.6]),
    ],
    1,
  ),
  recipe(
    "tyres",
    "Tyres",
    [
      cyl("rubber", [0.5, 0.2, 0.5], [1, 0.38, 1], 0),
      cyl("rubber", [0.5, 0.6, 0.5], [1, 0.38, 1], 0),
      cyl("metal", [0.5, 0.4, 0.5], [0.45, 0.8, 0.45], 0),
    ],
    1,
  ),

  /* appliances ------------------------------------------------------------ */
  WHITE_GOODS("fridge", "Fridge", false),
  WHITE_GOODS("washing-machine", "Washing machine", true),
  recipe(
    "microwave",
    "Microwave",
    [
      box("metal", [0.5, 0.5, 0.5], [1, 1, 1]),
      box("glass", [0.38, 0.55, 0.02], [0.6, 0.6, 0.05]),
      box("accent", [0.85, 0.5, 0.02], [0.16, 0.7, 0.05]),
    ],
    1,
  ),
];

const BY_KEY = new Map(RECIPES.map((entry) => [entry.key, entry]));

/** Icon-level fallbacks, so an unmapped catalogue id still looks right. */
const BY_ICON: Record<IconKey, string> = {
  box: "medium-box",
  bike: "bicycle",
  tv: "television",
  wardrobe: "wardrobe",
  mattress: "mattress",
  table: "dining-table",
  suitcase: "suitcase",
  books: "bookshelf",
  desk: "desk",
  chair: "office-chair",
  sports: "sports-kit",
  guitar: "sports-kit",
  tree: "camping-kit",
  appliance: "fridge",
  luggage: "suitcase",
};

/** Resolves the best recipe for an item, never returning undefined. */
export function modelFor(itemId: string, icon: IconKey): ModelRecipe {
  return BY_KEY.get(itemId) ?? BY_KEY.get(BY_ICON[icon]) ?? GENERIC;
}

export function modelKeyFor(itemId: string, icon: IconKey): string {
  return modelFor(itemId, icon).key;
}

/** Milestone 17: drop detail parts when the object is small on screen. */
export function partsForLod(model: ModelRecipe, detail: "high" | "low"): ModelPart[] {
  return detail === "high" ? model.parts : model.parts.slice(0, model.lodParts);
}

export const MODEL_KEYS = RECIPES.map((entry) => entry.key);
export { GENERIC as GENERIC_MODEL };
