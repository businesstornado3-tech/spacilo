/**
 * Icon registry for the SpacePlanner™ demo.
 *
 * The planning engine stays icon-free and only emits an `IconKey`; the mapping
 * to real glyphs lives here so the engine can be reused headlessly.
 */
import {
  Armchair,
  Bike,
  BookOpen,
  Boxes,
  Guitar,
  Laptop,
  Luggage,
  Monitor,
  Package,
  Table2,
  TreePine,
  Volleyball,
  WashingMachine,
  type LucideIcon,
} from "lucide-react";

import type { IconKey } from "@/lib/spaceplanner";

const REGISTRY: Record<IconKey, LucideIcon> = {
  box: Package,
  bike: Bike,
  tv: Monitor,
  wardrobe: Boxes,
  mattress: Table2,
  table: Table2,
  suitcase: Luggage,
  books: BookOpen,
  desk: Laptop,
  chair: Armchair,
  sports: Volleyball,
  guitar: Guitar,
  tree: TreePine,
  appliance: WashingMachine,
  luggage: Luggage,
};

export function iconFor(key: IconKey): LucideIcon {
  return REGISTRY[key] ?? Package;
}
