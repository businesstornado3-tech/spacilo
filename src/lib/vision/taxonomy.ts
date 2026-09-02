/**
 * Vision taxonomy — the vocabulary EarnRoom Vision AI is allowed to propose.
 *
 * Deliberately specific: "Two-seater sofa", never "object". Every entry carries
 * cautious UK estimates and, where one exists, the SpacePlanner catalogue item
 * it feeds. Adding a class here is all a new provider needs.
 */
import type { ItemCategory, WeightClass } from "@/lib/spaceplanner/types";

export interface VisionClass {
  key: string;
  label: string;
  category: ItemCategory;
  /** Estimated centimetres. */
  width: number;
  depth: number;
  height: number;
  weight: WeightClass;
  fragile: boolean;
  stackable: boolean;
  /** SpacePlanner catalogue id, when this class maps onto one. */
  catalogueId: string | null;
}

const c = (
  key: string,
  label: string,
  category: ItemCategory,
  dims: [number, number, number],
  weight: WeightClass,
  catalogueId: string | null = null,
  extra: { fragile?: boolean; stackable?: boolean } = {},
): VisionClass => ({
  key,
  label,
  category,
  width: dims[0],
  depth: dims[1],
  height: dims[2],
  weight,
  fragile: extra.fragile ?? false,
  stackable: extra.stackable ?? false,
  catalogueId,
});

export const VISION_CLASSES: VisionClass[] = [
  // Boxes and cases
  c("medium-box", "Medium box", "boxes", [45, 35, 35], "medium", "medium-box", {
    stackable: true,
  }),
  c("large-box", "Large box", "boxes", [60, 45, 45], "medium", "large-box", { stackable: true }),
  c("book-crate", "Book crate", "boxes", [40, 30, 30], "heavy", "book-crate", { stackable: true }),
  c("suitcase", "Suitcase", "boxes", [75, 30, 50], "light", "suitcase", { stackable: true }),
  c("plastic-tub", "Plastic storage tub", "boxes", [60, 40, 32], "medium", "large-box", {
    stackable: true,
  }),
  c("archive-box", "Business archive box", "boxes", [40, 32, 28], "heavy", "book-crate", {
    stackable: true,
  }),

  // Furniture
  c("wardrobe", "Wardrobe", "furniture", [100, 60, 200], "heavy", "wardrobe"),
  c("chest-drawers", "Chest of drawers", "furniture", [90, 50, 100], "heavy", "wardrobe"),
  c("double-mattress", "Double mattress", "furniture", [190, 135, 25], "medium", "mattress"),
  c("single-mattress", "Single mattress", "furniture", [190, 90, 22], "light", "mattress"),
  c("bed-frame", "Bed frame", "furniture", [200, 30, 140], "heavy", "mattress"),
  c("two-seater-sofa", "Two-seater sofa", "furniture", [160, 90, 85], "heavy", "dining-table"),
  c("dining-table", "Dining table", "furniture", [160, 90, 75], "heavy", "dining-table"),
  c("dining-chair", "Dining chair", "furniture", [45, 50, 95], "light", "dining-chair", {
    stackable: true,
  }),
  c("bookcase", "Bookcase", "furniture", [80, 30, 180], "heavy", "wardrobe"),

  // Electronics
  c("television", "Television", "electronics", [130, 25, 80], "light", "television", {
    fragile: true,
  }),
  c("monitor", "Computer monitor", "electronics", [62, 20, 45], "light", "television", {
    fragile: true,
  }),
  c("desktop-pc", "Desktop computer", "electronics", [45, 22, 45], "medium", "television", {
    fragile: true,
  }),

  // Appliances
  c("fridge-freezer", "Fridge freezer", "appliances", [60, 65, 180], "heavy", "appliance"),
  c("washing-machine", "Washing machine", "appliances", [60, 60, 85], "heavy", "appliance"),
  c("microwave", "Microwave", "appliances", [50, 40, 30], "medium", "appliance", { fragile: true }),

  // Office and business
  c("desk", "Desk", "furniture", [140, 70, 75], "heavy", "desk"),
  c("office-chair", "Office chair", "furniture", [65, 65, 110], "medium", "dining-chair"),
  c("filing-cabinet", "Filing cabinet", "furniture", [47, 62, 132], "heavy", "wardrobe"),

  // Leisure and sport
  c("bicycle", "Bicycle", "leisure", [180, 60, 110], "medium", "bicycle"),
  c("pushchair", "Pushchair", "leisure", [95, 60, 105], "medium", "sports-kit"),
  c("golf-clubs", "Golf clubs", "leisure", [40, 40, 120], "medium", "sports-kit"),
  c("gym-equipment", "Gym equipment", "leisure", [120, 60, 130], "heavy", "sports-kit"),
  c("camping-gear", "Camping equipment", "leisure", [70, 40, 40], "light", "sports-kit", {
    stackable: true,
  }),
  c("guitar", "Guitar case", "leisure", [110, 15, 45], "light", "guitar", { fragile: true }),
  c("keyboard-piano", "Keyboard piano", "leisure", [140, 35, 15], "medium", "guitar", {
    fragile: true,
  }),
  c("surfboard", "Surfboard", "leisure", [200, 55, 10], "light", "sports-kit"),

  // Seasonal and garden
  c("christmas-decorations", "Christmas decorations", "seasonal", [80, 45, 40], "light", "christmas", {
    stackable: true,
    fragile: true,
  }),
  c("garden-tools", "Garden tools", "seasonal", [60, 40, 170], "medium", "sports-kit"),
  c("lawnmower", "Lawnmower", "seasonal", [90, 55, 100], "heavy", "appliance"),
  c("garden-furniture", "Garden furniture set", "seasonal", [150, 90, 80], "heavy", "dining-table"),
];

export const VISION_CLASS_BY_KEY = new Map(VISION_CLASSES.map((entry) => [entry.key, entry]));

/** Cubic metres for one unit of a class. */
export function classVolume(entry: {
  width: number;
  depth: number;
  height: number;
}): number {
  return (entry.width / 100) * (entry.depth / 100) * (entry.height / 100);
}
