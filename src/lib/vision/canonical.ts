/**
 * Phase 6O — the canonical item schema.
 *
 * One validated shape sits between the AI reply and everything downstream:
 * the confirmation UI, the deterministic planner, the manifest and the
 * renderer all read the same record. Fields travel together, keyed by a stable
 * id, so nothing can shift from one column into another when a value is
 * missing.
 *
 * Rules enforced here:
 *  - every item keeps its own id and its originating detection id;
 *  - dimensions are numeric, positive, in centimetres, and bounded;
 *  - volume is CALCULATED from dimensions, never trusted from the model;
 *  - unknown values stay unknown rather than borrowing a neighbouring field.
 */
import { DENSITY_KG_PER_M3 } from "@/lib/spaceplanner/library";
import type { ItemCategory, WeightClass } from "@/lib/spaceplanner/types";

import type { DetectedObject } from "./types";

export const MIN_DIMENSION_CM = 1;
export const MAX_DIMENSION_CM = 400;

/** Confidence bands. Above CHECK an item behaves normally. */
export const CONFIDENCE_CHECK = 0.8;
export const CONFIDENCE_UNSURE = 0.6;

export type ConfidenceTier = "confident" | "check" | "unsure";

export function confidenceTier(confidence: number): ConfidenceTier {
  if (confidence >= CONFIDENCE_CHECK) return "confident";
  if (confidence >= CONFIDENCE_UNSURE) return "check";
  return "unsure";
}

export function confidenceTierCopy(tier: ConfidenceTier): string {
  if (tier === "confident") return "Looks clear";
  if (tier === "check") return "Please check";
  return "EarnRoom AI isn't sure — please confirm or correct it";
}

/** A dimension we can plan with, or null when the value is unusable. */
export function validDimensionCm(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value <= 0) return null;
  const rounded = Math.round(value);
  if (rounded < MIN_DIMENSION_CM) return null;
  return Math.min(MAX_DIMENSION_CM, rounded);
}

/** Deterministic cubic metres from centimetres. Never taken from the model. */
export function volumeM3From(widthCm: number, depthCm: number, heightCm: number): number {
  return (widthCm * depthCm * heightCm) / 1_000_000;
}

export interface CanonicalItem {
  id: string;
  name: string;
  category: ItemCategory;
  quantity: number;
  widthCm: number;
  depthCm: number;
  heightCm: number;
  /** Per unit, derived from the dimensions above. */
  volumeM3: number;
  /** Per unit, derived from volume and weight class. */
  weightKg: number;
  weightClass: WeightClass;
  confidence: number;
  tier: ConfidenceTier;
  fragile: boolean;
  stackable: boolean;
  sourceDetectionId: string | null;
  photoIds: string[];
}

export interface CanonicalRejection {
  id: string;
  name: string;
  reason: string;
}

/**
 * A detected object → a canonical item, or a rejection explaining why it may
 * not enter the deterministic planner.
 */
export function toCanonicalItem(
  object: DetectedObject,
): { ok: true; item: CanonicalItem } | { ok: false; rejection: CanonicalRejection } {
  const name = typeof object.label === "string" ? object.label.trim() : "";
  const id = typeof object.id === "string" ? object.id.trim() : "";
  if (!id) {
    return { ok: false, rejection: { id: "", name, reason: "missing id" } };
  }
  if (!name) {
    return { ok: false, rejection: { id, name: "", reason: "missing name" } };
  }

  const widthCm = validDimensionCm(object.width);
  const depthCm = validDimensionCm(object.depth);
  const heightCm = validDimensionCm(object.height);
  if (widthCm === null || depthCm === null || heightCm === null) {
    return {
      ok: false,
      rejection: { id, name, reason: "dimensions must be positive numbers in centimetres" },
    };
  }

  const quantity =
    typeof object.quantity === "number" && Number.isFinite(object.quantity)
      ? Math.max(1, Math.round(object.quantity))
      : 1;
  const confidence =
    typeof object.confidence === "number" && Number.isFinite(object.confidence)
      ? Math.max(0, Math.min(1, object.confidence))
      : 0.5;
  const weightClass: WeightClass =
    object.weight === "light" || object.weight === "heavy" ? object.weight : "medium";
  const volumeM3 = volumeM3From(widthCm, depthCm, heightCm);

  return {
    ok: true,
    item: {
      id,
      name,
      category: object.category,
      quantity,
      widthCm,
      depthCm,
      heightCm,
      volumeM3,
      weightKg: volumeM3 * DENSITY_KG_PER_M3[weightClass],
      weightClass,
      confidence,
      tier: confidenceTier(confidence),
      fragile: object.fragile === true,
      stackable: object.stackable === true,
      sourceDetectionId: object.sourceDetectionId ?? object.id ?? null,
      photoIds: Array.isArray(object.photoIds) ? [...object.photoIds] : [],
    },
  };
}

export interface CanonicalInventory {
  items: CanonicalItem[];
  rejected: CanonicalRejection[];
  /** Every figure the UI shows comes from here, never from a local sum. */
  totals: {
    distinctItems: number;
    unitCount: number;
    volumeM3: number;
    weightKg: number;
    needsCheck: number;
    unsure: number;
  };
}

export function canonicaliseInventory(objects: DetectedObject[]): CanonicalInventory {
  const items: CanonicalItem[] = [];
  const rejected: CanonicalRejection[] = [];
  const seen = new Set<string>();

  for (const object of objects) {
    const result = toCanonicalItem(object);
    if (!result.ok) {
      rejected.push(result.rejection);
      continue;
    }
    // Ids must be unique as well as stable — never index-derived.
    if (seen.has(result.item.id)) {
      rejected.push({ id: result.item.id, name: result.item.name, reason: "duplicate id" });
      continue;
    }
    seen.add(result.item.id);
    items.push(result.item);
  }

  const volumeM3 = items.reduce((sum, item) => sum + item.volumeM3 * item.quantity, 0);
  return {
    items,
    rejected,
    totals: {
      distinctItems: items.length,
      unitCount: items.reduce((sum, item) => sum + item.quantity, 0),
      volumeM3: Math.round(volumeM3 * 1000) / 1000,
      weightKg: Math.round(items.reduce((sum, i) => sum + i.weightKg * i.quantity, 0)),
      needsCheck: items.filter((item) => item.tier === "check").length,
      unsure: items.filter((item) => item.tier === "unsure").length,
    },
  };
}
