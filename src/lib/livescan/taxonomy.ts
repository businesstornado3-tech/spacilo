/**
 * Live model class → SpaceFit taxonomy.
 *
 * ONE place maps raw detector class names onto SpaceFit's inventory categories
 * and catalogue keys. UI components never see a raw model class. Anything not
 * listed here is unknown and is either ignored or shown generically — we never
 * force a class into an incorrect SpaceFit category.
 */
import type { ItemCategory } from "@/lib/inventory-model";

export interface LiveTaxonomyEntry {
  /** Label shown to the user. */
  label: string;
  category: ItemCategory;
  /** Existing catalogue key when the class maps cleanly onto one. */
  catalogueKey: string | null;
}

/** Storage-relevant COCO classes only. Everything else is deliberately absent. */
export const LIVE_CLASS_TAXONOMY: Record<string, LiveTaxonomyEntry> = {
  bicycle: { label: "Bicycle", category: "bicycles", catalogueKey: "bicycle" },
  motorcycle: { label: "Motorbike", category: "sports", catalogueKey: null },
  suitcase: { label: "Suitcase", category: "bags", catalogueKey: "medium-suitcase" },
  backpack: { label: "Bag", category: "bags", catalogueKey: "duffel-bag" },
  handbag: { label: "Bag", category: "bags", catalogueKey: "duffel-bag" },
  chair: { label: "Chair", category: "furniture", catalogueKey: "dining-chair" },
  couch: { label: "Sofa", category: "furniture", catalogueKey: "sofa" },
  bed: { label: "Mattress or bed", category: "furniture", catalogueKey: "double-mattress" },
  "dining table": { label: "Table", category: "furniture", catalogueKey: "dining-table" },
  tv: { label: "TV", category: "electronics", catalogueKey: "tv" },
  laptop: { label: "Laptop", category: "electronics", catalogueKey: null },
  keyboard: { label: "Computer equipment", category: "electronics", catalogueKey: null },
  microwave: { label: "Microwave", category: "appliances", catalogueKey: "microwave" },
  oven: { label: "Oven", category: "appliances", catalogueKey: null },
  refrigerator: { label: "Fridge", category: "appliances", catalogueKey: "mini-fridge" },
  book: { label: "Books", category: "boxes", catalogueKey: "small-box" },
  skis: { label: "Skis", category: "sports", catalogueKey: "ski-equipment" },
  snowboard: { label: "Snowboard", category: "sports", catalogueKey: "snowboard" },
  surfboard: { label: "Board", category: "sports", catalogueKey: "snowboard" },
  "tennis racket": { label: "Sports equipment", category: "sports", catalogueKey: null },
  "sports ball": { label: "Sports equipment", category: "sports", catalogueKey: null },
  "potted plant": { label: "Plant", category: "other", catalogueKey: null },
  vase: { label: "Fragile item", category: "other", catalogueKey: null },
};

/** Classes that are common but never useful to store — silently ignored. */
export const LIVE_IGNORED_CLASSES = new Set([
  "person",
  "cat",
  "dog",
  "bird",
  "car",
  "bus",
  "truck",
  "traffic light",
  "cell phone",
  "cup",
  "bottle",
  "clock",
]);

export function mapLiveClass(rawClass: string): LiveTaxonomyEntry | null {
  const key = rawClass.trim().toLowerCase();
  if (!key || LIVE_IGNORED_CLASSES.has(key)) return null;
  return LIVE_CLASS_TAXONOMY[key] ?? null;
}

/**
 * Whether a raw class should be surfaced at all. Unknown-but-not-ignored
 * classes are dropped here: the stronger post-capture AI will handle them.
 */
export function isLiveClassRelevant(rawClass: string): boolean {
  return mapLiveClass(rawClass) !== null;
}

/** Label for a detection, hedged when the model isn't confident. */
export function liveDetectionLabel(label: string, confirmed: boolean): string {
  return confirmed ? label : `Possible ${label.toLowerCase()}`;
}
