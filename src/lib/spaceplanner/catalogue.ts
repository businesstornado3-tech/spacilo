/**
 * Demo inventory catalogue.
 *
 * Dimensions are cautious UK household estimates, not measurements. They exist
 * so the public demo can show believable maths; the signed-in product measures
 * or asks the renter to confirm instead.
 */
import type { CatalogueItem, ItemCategory } from "./types";

export const CATALOGUE_ITEMS: CatalogueItem[] = [
  {
    id: "medium-box",
    name: "Medium boxes",
    category: "boxes",
    icon: "box",
    width: 45,
    depth: 35,
    height: 35,
    fragile: false,
    stackable: true,
    maxStack: 4,
    weight: "medium",
    standsUpright: false,
    frequentlyUsed: false,
    popular: true,
  },
  {
    id: "large-box",
    name: "Large boxes",
    category: "boxes",
    icon: "box",
    width: 60,
    depth: 45,
    height: 45,
    fragile: false,
    stackable: true,
    maxStack: 3,
    weight: "medium",
    standsUpright: false,
    frequentlyUsed: false,
    popular: true,
  },
  {
    id: "book-crate",
    name: "Book crates",
    category: "boxes",
    icon: "books",
    width: 40,
    depth: 30,
    height: 30,
    fragile: false,
    stackable: true,
    maxStack: 3,
    weight: "heavy",
    standsUpright: false,
    frequentlyUsed: false,
    popular: false,
  },
  {
    id: "bicycle",
    name: "Bicycle",
    category: "leisure",
    icon: "bike",
    width: 180,
    depth: 60,
    height: 110,
    fragile: false,
    stackable: false,
    maxStack: 1,
    weight: "medium",
    standsUpright: true,
    frequentlyUsed: true,
    popular: true,
  },
  {
    id: "television",
    name: "Television",
    category: "electronics",
    icon: "tv",
    width: 130,
    depth: 25,
    height: 80,
    fragile: true,
    stackable: false,
    maxStack: 1,
    weight: "light",
    standsUpright: true,
    frequentlyUsed: false,
    popular: true,
  },
  {
    id: "wardrobe",
    name: "Wardrobe",
    category: "furniture",
    icon: "wardrobe",
    width: 100,
    depth: 60,
    height: 200,
    fragile: false,
    stackable: false,
    maxStack: 1,
    weight: "heavy",
    standsUpright: true,
    frequentlyUsed: false,
    popular: true,
  },
  {
    id: "mattress",
    name: "Double mattress",
    category: "furniture",
    icon: "mattress",
    width: 190,
    depth: 135,
    height: 25,
    fragile: false,
    stackable: false,
    maxStack: 1,
    weight: "medium",
    standsUpright: true,
    frequentlyUsed: false,
    popular: true,
  },
  {
    id: "dining-table",
    name: "Dining table",
    category: "furniture",
    icon: "table",
    width: 160,
    depth: 90,
    height: 75,
    fragile: false,
    stackable: false,
    maxStack: 1,
    weight: "heavy",
    standsUpright: true,
    frequentlyUsed: false,
    popular: true,
  },
  {
    id: "dining-chair",
    name: "Dining chairs",
    category: "furniture",
    icon: "chair",
    width: 45,
    depth: 50,
    height: 90,
    fragile: false,
    stackable: true,
    maxStack: 4,
    weight: "light",
    standsUpright: false,
    frequentlyUsed: false,
    popular: false,
  },
  {
    id: "desk",
    name: "Desk",
    category: "furniture",
    icon: "desk",
    width: 140,
    depth: 70,
    height: 75,
    fragile: false,
    stackable: false,
    maxStack: 1,
    weight: "heavy",
    standsUpright: true,
    frequentlyUsed: false,
    popular: false,
  },
  {
    id: "suitcase",
    name: "Suitcases",
    category: "leisure",
    icon: "suitcase",
    width: 50,
    depth: 30,
    height: 75,
    fragile: false,
    stackable: true,
    maxStack: 3,
    weight: "light",
    standsUpright: true,
    frequentlyUsed: true,
    popular: true,
  },
  {
    id: "sports-kit",
    name: "Sports equipment",
    category: "leisure",
    icon: "sports",
    width: 90,
    depth: 45,
    height: 50,
    fragile: false,
    stackable: true,
    maxStack: 2,
    weight: "medium",
    standsUpright: false,
    frequentlyUsed: true,
    popular: false,
  },
  {
    id: "guitar",
    name: "Musical instrument",
    category: "leisure",
    icon: "guitar",
    width: 110,
    depth: 40,
    height: 45,
    fragile: true,
    stackable: false,
    maxStack: 1,
    weight: "light",
    standsUpright: true,
    frequentlyUsed: false,
    popular: false,
  },
  {
    id: "christmas",
    name: "Christmas decorations",
    category: "seasonal",
    icon: "tree",
    width: 60,
    depth: 40,
    height: 40,
    fragile: true,
    stackable: true,
    maxStack: 2,
    weight: "light",
    standsUpright: false,
    frequentlyUsed: true,
    popular: true,
  },
  {
    id: "appliance",
    name: "Washing machine",
    category: "appliances",
    icon: "appliance",
    width: 60,
    depth: 60,
    height: 85,
    fragile: false,
    stackable: false,
    maxStack: 1,
    weight: "heavy",
    standsUpright: false,
    frequentlyUsed: false,
    popular: false,
  },
];

export const CATALOGUE_BY_ID = new Map(CATALOGUE_ITEMS.map((item) => [item.id, item]));

export const CATEGORY_LABELS: Record<ItemCategory, string> = {
  boxes: "Boxes & crates",
  furniture: "Furniture",
  appliances: "Appliances",
  electronics: "Electronics",
  leisure: "Leisure & travel",
  seasonal: "Seasonal",
};

/** Cubic metres for a single unit, rounded to avoid float noise in the UI. */
export function itemVolume(item: CatalogueItem): number {
  return round3((item.width / 100) * (item.depth / 100) * (item.height / 100));
}

export function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Case-insensitive name/category search over the demo catalogue. */
export function searchCatalogue(query: string): CatalogueItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return CATALOGUE_ITEMS;
  return CATALOGUE_ITEMS.filter(
    (item) =>
      item.name.toLowerCase().includes(q) ||
      CATEGORY_LABELS[item.category].toLowerCase().includes(q),
  );
}

export interface InventoryPreset {
  id: string;
  name: string;
  description: string;
  lines: Array<{ itemId: string; quantity: number }>;
}

/** Presets a visitor can load in one tap so the demo never starts empty. */
export const INVENTORY_PRESETS: InventoryPreset[] = [
  {
    id: "student",
    name: "Student summer",
    description: "A term's worth of belongings between tenancies.",
    lines: [
      { itemId: "medium-box", quantity: 6 },
      { itemId: "suitcase", quantity: 2 },
      { itemId: "bicycle", quantity: 1 },
      { itemId: "desk", quantity: 1 },
    ],
  },
  {
    id: "one-bed",
    name: "One-bed move",
    description: "A flat's contents while a move completes.",
    lines: [
      { itemId: "large-box", quantity: 8 },
      { itemId: "mattress", quantity: 1 },
      { itemId: "wardrobe", quantity: 1 },
      { itemId: "television", quantity: 1 },
      { itemId: "dining-chair", quantity: 4 },
    ],
  },
  {
    id: "declutter",
    name: "Declutter",
    description: "Seasonal and occasional items out of the way.",
    lines: [
      { itemId: "christmas", quantity: 2 },
      { itemId: "sports-kit", quantity: 2 },
      { itemId: "book-crate", quantity: 4 },
      { itemId: "suitcase", quantity: 2 },
    ],
  },
];
