/**
 * Common item catalogue for fast manual inventory building.
 *
 * Every dimension here is a TYPICAL ESTIMATE for a UK household item, not a
 * guaranteed measurement. The UI must always label catalogue sizes as
 * "Typical estimate" and let the renter edit them; editing flips the item's
 * size_source to "user_measured".
 *
 * Stackability defaults are conventions, not physical claims — renters can
 * override every one of them.
 */
import {
  Package,
  Boxes,
  Archive,
  Briefcase,
  Luggage,
  Backpack,
  Armchair,
  Sofa,
  Bed,
  Table,
  Lamp,
  BookOpen,
  Monitor,
  Tv,
  Laptop,
  Refrigerator,
  Microwave,
  WashingMachine,
  Wind,
  Bike,
  Dumbbell,
  Snowflake,
  Mountain,
  FileText,
  Shapes,
  type LucideIcon,
} from "lucide-react";

import type { ItemCategory, ItemTriState } from "@/lib/inventory-model";

export interface CatalogueItem {
  key: string;
  name: string;
  category: ItemCategory;
  icon: LucideIcon;
  /** Typical estimate, centimetres. */
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  stackable: ItemTriState;
  orientationFlexible: ItemTriState;
  fragile?: boolean;
  popular?: boolean;
}

export const CATALOGUE: CatalogueItem[] = [
  // Boxes
  { key: "small-box", name: "Small box", category: "boxes", icon: Package, lengthCm: 35, widthCm: 35, heightCm: 35, stackable: "yes", orientationFlexible: "yes", popular: true },
  { key: "medium-box", name: "Medium box", category: "boxes", icon: Package, lengthCm: 45, widthCm: 45, heightCm: 45, stackable: "yes", orientationFlexible: "yes", popular: true },
  { key: "large-box", name: "Large box", category: "boxes", icon: Boxes, lengthCm: 60, widthCm: 45, heightCm: 45, stackable: "yes", orientationFlexible: "yes", popular: true },
  { key: "plastic-storage-box", name: "Plastic storage box", category: "boxes", icon: Boxes, lengthCm: 60, widthCm: 40, heightCm: 35, stackable: "yes", orientationFlexible: "yes" },

  // Bags & suitcases
  { key: "cabin-suitcase", name: "Cabin suitcase", category: "bags", icon: Luggage, lengthCm: 55, widthCm: 40, heightCm: 23, stackable: "yes", orientationFlexible: "yes" },
  { key: "medium-suitcase", name: "Medium suitcase", category: "bags", icon: Luggage, lengthCm: 67, widthCm: 45, heightCm: 27, stackable: "yes", orientationFlexible: "yes", popular: true },
  { key: "large-suitcase", name: "Large suitcase", category: "bags", icon: Luggage, lengthCm: 79, widthCm: 52, heightCm: 31, stackable: "yes", orientationFlexible: "yes", popular: true },
  { key: "duffel-bag", name: "Duffel bag", category: "bags", icon: Backpack, lengthCm: 70, widthCm: 35, heightCm: 35, stackable: "yes", orientationFlexible: "yes" },

  // Furniture
  { key: "dining-chair", name: "Dining chair", category: "furniture", icon: Armchair, lengthCm: 45, widthCm: 50, heightCm: 95, stackable: "unknown", orientationFlexible: "yes" },
  { key: "armchair", name: "Armchair", category: "furniture", icon: Armchair, lengthCm: 90, widthCm: 85, heightCm: 100, stackable: "no", orientationFlexible: "no", popular: true },
  { key: "office-chair", name: "Office chair", category: "furniture", icon: Armchair, lengthCm: 65, widthCm: 65, heightCm: 110, stackable: "no", orientationFlexible: "no" },
  { key: "coffee-table", name: "Coffee table", category: "furniture", icon: Table, lengthCm: 110, widthCm: 60, heightCm: 45, stackable: "unknown", orientationFlexible: "yes" },
  { key: "dining-table", name: "Dining table", category: "furniture", icon: Table, lengthCm: 160, widthCm: 90, heightCm: 75, stackable: "no", orientationFlexible: "yes" },
  { key: "bedside-table", name: "Bedside table", category: "furniture", icon: Lamp, lengthCm: 45, widthCm: 40, heightCm: 55, stackable: "unknown", orientationFlexible: "yes" },
  { key: "chest-of-drawers", name: "Chest of drawers", category: "furniture", icon: Archive, lengthCm: 80, widthCm: 45, heightCm: 90, stackable: "no", orientationFlexible: "no" },
  { key: "bookshelf", name: "Bookshelf", category: "furniture", icon: BookOpen, lengthCm: 80, widthCm: 30, heightCm: 180, stackable: "no", orientationFlexible: "yes" },
  { key: "desk", name: "Desk", category: "furniture", icon: Table, lengthCm: 120, widthCm: 60, heightCm: 75, stackable: "no", orientationFlexible: "yes" },
  { key: "single-mattress", name: "Single mattress", category: "furniture", icon: Bed, lengthCm: 190, widthCm: 90, heightCm: 20, stackable: "yes", orientationFlexible: "yes" },
  { key: "double-mattress", name: "Double mattress", category: "furniture", icon: Bed, lengthCm: 190, widthCm: 135, heightCm: 25, stackable: "yes", orientationFlexible: "yes" },
  { key: "sofa", name: "Sofa", category: "furniture", icon: Sofa, lengthCm: 200, widthCm: 90, heightCm: 85, stackable: "no", orientationFlexible: "no", popular: true },

  // Appliances
  { key: "microwave", name: "Microwave", category: "appliances", icon: Microwave, lengthCm: 50, widthCm: 40, heightCm: 30, stackable: "unknown", orientationFlexible: "no" },
  { key: "vacuum-cleaner", name: "Vacuum cleaner", category: "appliances", icon: Wind, lengthCm: 45, widthCm: 35, heightCm: 110, stackable: "no", orientationFlexible: "unknown" },
  { key: "mini-fridge", name: "Mini fridge", category: "appliances", icon: Refrigerator, lengthCm: 50, widthCm: 50, heightCm: 85, stackable: "no", orientationFlexible: "no" },
  { key: "washing-machine", name: "Washing machine", category: "appliances", icon: WashingMachine, lengthCm: 60, widthCm: 60, heightCm: 85, stackable: "no", orientationFlexible: "no" },

  // Electronics
  { key: "tv", name: "TV", category: "electronics", icon: Tv, lengthCm: 125, widthCm: 12, heightCm: 75, stackable: "no", orientationFlexible: "no", fragile: true, popular: true },
  { key: "computer-monitor", name: "Computer monitor", category: "electronics", icon: Monitor, lengthCm: 62, widthCm: 20, heightCm: 45, stackable: "no", orientationFlexible: "no", fragile: true },
  { key: "desktop-computer", name: "Desktop computer", category: "electronics", icon: Laptop, lengthCm: 45, widthCm: 20, heightCm: 45, stackable: "no", orientationFlexible: "no", fragile: true },

  // Bicycles & sports
  { key: "bicycle", name: "Bicycle", category: "bicycles", icon: Bike, lengthCm: 180, widthCm: 65, heightCm: 110, stackable: "no", orientationFlexible: "no", popular: true },
  { key: "golf-bag", name: "Golf bag", category: "sports", icon: Dumbbell, lengthCm: 130, widthCm: 35, heightCm: 35, stackable: "unknown", orientationFlexible: "yes" },
  { key: "ski-equipment", name: "Ski equipment", category: "sports", icon: Snowflake, lengthCm: 180, widthCm: 25, heightCm: 20, stackable: "yes", orientationFlexible: "yes" },
  { key: "snowboard", name: "Snowboard", category: "sports", icon: Mountain, lengthCm: 160, widthCm: 30, heightCm: 15, stackable: "yes", orientationFlexible: "yes" },

  // Student
  { key: "moving-box", name: "Moving box", category: "student", icon: Package, lengthCm: 45, widthCm: 45, heightCm: 45, stackable: "yes", orientationFlexible: "yes" },
  { key: "student-suitcase", name: "Suitcase", category: "student", icon: Luggage, lengthCm: 67, widthCm: 45, heightCm: 27, stackable: "yes", orientationFlexible: "yes" },
  { key: "desk-chair", name: "Desk chair", category: "student", icon: Armchair, lengthCm: 65, widthCm: 65, heightCm: 110, stackable: "no", orientationFlexible: "no" },
  { key: "small-tv", name: "Small TV", category: "student", icon: Tv, lengthCm: 75, widthCm: 10, heightCm: 47, stackable: "no", orientationFlexible: "no", fragile: true },
  { key: "bedding-bag", name: "Bedding bag", category: "student", icon: Backpack, lengthCm: 70, widthCm: 50, heightCm: 30, stackable: "yes", orientationFlexible: "yes" },

  // Business & documents
  { key: "archive-box", name: "Archive box", category: "business", icon: Archive, lengthCm: 40, widthCm: 32, heightCm: 26, stackable: "yes", orientationFlexible: "no" },
  { key: "stock-box", name: "Stock box", category: "business", icon: Boxes, lengthCm: 50, widthCm: 40, heightCm: 40, stackable: "yes", orientationFlexible: "yes" },
  { key: "equipment-case", name: "Small equipment case", category: "business", icon: Briefcase, lengthCm: 60, widthCm: 40, heightCm: 30, stackable: "yes", orientationFlexible: "no" },
  { key: "document-box", name: "Document box", category: "documents", icon: FileText, lengthCm: 40, widthCm: 30, heightCm: 25, stackable: "yes", orientationFlexible: "no" },
];

export const CATALOGUE_BY_KEY = new Map(CATALOGUE.map((item) => [item.key, item]));

/** Chips shown above the quick-add grid. */
export const QUICK_ADD_FILTERS: { id: string; label: string; match: (item: CatalogueItem) => boolean }[] = [
  { id: "popular", label: "Popular", match: (i) => Boolean(i.popular) },
  { id: "boxes", label: "Boxes", match: (i) => i.category === "boxes" },
  { id: "furniture", label: "Furniture", match: (i) => i.category === "furniture" },
  { id: "bags", label: "Bags", match: (i) => i.category === "bags" },
  { id: "bikes", label: "Bikes", match: (i) => i.category === "bicycles" || i.category === "sports" },
  { id: "electronics", label: "Electronics", match: (i) => i.category === "electronics" || i.category === "appliances" },
  { id: "student", label: "Student", match: (i) => i.category === "student" },
  { id: "business", label: "Business", match: (i) => i.category === "business" || i.category === "documents" },
  { id: "other", label: "Other", match: (i) => i.category === "other" },
];

export function searchCatalogue(query: string, filterId: string): CatalogueItem[] {
  const q = query.trim().toLowerCase();
  if (q) {
    return CATALOGUE.filter(
      (item) => item.name.toLowerCase().includes(q) || item.category.includes(q),
    );
  }
  const filter = QUICK_ADD_FILTERS.find((f) => f.id === filterId);
  return filter ? CATALOGUE.filter(filter.match) : CATALOGUE;
}

/** Fallback icon for custom items with no catalogue entry. */
export function iconForItem(catalogueKey: string | null, category: ItemCategory): LucideIcon {
  const entry = catalogueKey ? CATALOGUE_BY_KEY.get(catalogueKey) : undefined;
  if (entry) return entry.icon;
  const byCategory: Partial<Record<ItemCategory, LucideIcon>> = {
    boxes: Package,
    bags: Luggage,
    furniture: Armchair,
    appliances: Microwave,
    electronics: Tv,
    bicycles: Bike,
    sports: Dumbbell,
    student: Backpack,
    business: Briefcase,
    documents: FileText,
  };
  return byCategory[category] ?? Shapes;
}
