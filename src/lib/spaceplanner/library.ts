/**
 * Saved inventories and plan history — the pure domain layer.
 *
 * Everything here is data and pure functions: no storage, no React, no
 * network. The repository in `./library-store` persists these records (today
 * in the browser, tomorrow in the database) and the UI only ever reads the
 * derived summaries below, so swapping the backing store changes nothing that
 * a user can see.
 */
import { CATALOGUE_BY_ID } from "./catalogue";
import { SPACE_BY_ID, DEMO_SPACES } from "./spaces";
import { itemVolume } from "./catalogue";
import { PACKING_ALLOWANCE } from "./metrics";
import type { InventoryLine, PackingComplexity, StorageSpace, WeightClass } from "./index";

/** A stored line: catalogue id plus quantity. Kept flat so it serialises. */
export interface SavedLine {
  itemId: string;
  quantity: number;
}

export type InventoryStatus = "draft" | "ready";

export interface SavedInventory {
  id: string;
  name: string;
  description: string;
  lines: SavedLine[];
  /** The space this inventory is currently being planned against. */
  spaceId: string;
  createdAt: string;
  updatedAt: string;
  /** ISO timestamp of the last time the planner opened this inventory. */
  lastOpenedAt: string | null;
  /** Set when archived; `null` for live inventories. */
  archivedAt: string | null;
  /** Last completed optimisation score, if any. */
  lastScore: number | null;
}

export interface PlanRun {
  id: string;
  inventoryId: string;
  inventoryName: string;
  ranAt: string;
  spaceId: string;
  spaceName: string;
  score: number;
  fitPercent: number;
  complexity: PackingComplexity;
  recommendation: string;
  itemCount: number;
}

/**
 * Cautious kg per cubic metre by weight class. These are estimates used for
 * guidance only — never presented as a measured weight.
 */
export const DENSITY_KG_PER_M3: Record<WeightClass, number> = {
  light: 45,
  medium: 110,
  heavy: 240,
};

export interface InventorySummary {
  itemCount: number;
  itemTypeCount: number;
  /** Cubic metres of the belongings themselves. */
  volume: number;
  /** Cubic metres including the packing allowance — what to look for. */
  estimatedStorageVolume: number;
  /** Estimated kilograms. */
  weightKg: number;
  status: InventoryStatus;
}

export function toLines(saved: SavedLine[]): InventoryLine[] {
  return saved
    .map((line) => ({ item: CATALOGUE_BY_ID.get(line.itemId)!, quantity: line.quantity }))
    .filter((line) => line.item && line.quantity > 0);
}

export function fromQuantities(quantities: Record<string, number>): SavedLine[] {
  return Object.entries(quantities)
    .filter(([itemId, quantity]) => quantity > 0 && CATALOGUE_BY_ID.has(itemId))
    .map(([itemId, quantity]) => ({ itemId, quantity }));
}

export function toQuantities(lines: SavedLine[]): Record<string, number> {
  return Object.fromEntries(lines.map((line) => [line.itemId, line.quantity]));
}

export function inventoryStatus(inventory: SavedInventory): InventoryStatus {
  const hasItems = toLines(inventory.lines).length > 0;
  return hasItems && inventory.lastScore !== null ? "ready" : "draft";
}

export function summarise(inventory: SavedInventory): InventorySummary {
  const lines = toLines(inventory.lines);
  const volume = lines.reduce((sum, line) => sum + itemVolume(line.item) * line.quantity, 0);
  const weightKg = lines.reduce(
    (sum, line) => sum + itemVolume(line.item) * line.quantity * DENSITY_KG_PER_M3[line.item.weight],
    0,
  );

  return {
    itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
    itemTypeCount: lines.length,
    volume: Math.round(volume * 100) / 100,
    estimatedStorageVolume: Math.round(volume * PACKING_ALLOWANCE * 100) / 100,
    weightKg: Math.round(weightKg),
    status: inventoryStatus(inventory),
  };
}

/** The smallest demo space that comfortably holds the estimated requirement. */
export function suggestedSpace(inventory: SavedInventory): StorageSpace | null {
  const { estimatedStorageVolume } = summarise(inventory);
  if (estimatedStorageVolume <= 0) return null;
  const ranked = [...DEMO_SPACES].sort(
    (a, b) => a.width * a.depth * a.height - b.width * b.depth * b.height,
  );
  return (
    ranked.find(
      (space) => space.width * space.depth * space.height * 0.78 >= estimatedStorageVolume,
    ) ?? ranked[ranked.length - 1] ?? null
  );
}

export function spaceFor(inventory: SavedInventory): StorageSpace {
  return SPACE_BY_ID.get(inventory.spaceId) ?? SPACE_BY_ID.get("garage")!;
}

/** Most recently opened first, falling back to last modified. */
export function byRecency(a: SavedInventory, b: SavedInventory): number {
  const at = a.lastOpenedAt ?? a.updatedAt;
  const bt = b.lastOpenedAt ?? b.updatedAt;
  return bt.localeCompare(at);
}

export function liveInventories(all: SavedInventory[]): SavedInventory[] {
  return all.filter((inventory) => !inventory.archivedAt).sort(byRecency);
}

export function archivedInventories(all: SavedInventory[]): SavedInventory[] {
  return all.filter((inventory) => inventory.archivedAt).sort(byRecency);
}

/** The inventory the user should be nudged to continue, if there is one. */
export function continuePlanning(all: SavedInventory[]): SavedInventory | null {
  return liveInventories(all)[0] ?? null;
}

/** "Garage clearout" → "Garage clearout (copy)", then "(copy 2)". */
export function duplicateName(name: string, existing: string[]): string {
  const base = `${name} (copy)`;
  if (!existing.includes(base)) return base;
  let n = 2;
  while (existing.includes(`${name} (copy ${n})`)) n += 1;
  return `${name} (copy ${n})`;
}

export const STARTER_NAMES = [
  "Student move",
  "One-bedroom move",
  "Garage clearout",
  "Loft storage",
  "Christmas decorations",
  "Business archive",
] as const;

export function formatVolume(m3: number): string {
  if (!Number.isFinite(m3) || m3 <= 0) return "0m³";
  // Small objects are real objects: never round a genuine volume down to 0.0.
  if (m3 < 0.01) return "<0.01m³";
  if (m3 < 1) return `${m3.toFixed(2)}m³`;
  return `${m3.toFixed(m3 < 10 ? 1 : 0)}m³`;
}

export function formatWeight(kg: number): string {
  if (!Number.isFinite(kg) || kg <= 0) return "0kg";
  if (kg < 1) return "<1kg";
  return kg >= 1000 ? `${(kg / 1000).toFixed(1)}t` : `${Math.round(kg)}kg`;
}

/** UK short date, e.g. 7 Aug 2026. */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function relativeTime(iso: string, now: Date = new Date()): string {
  const diff = now.getTime() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return formatDate(iso);
}
