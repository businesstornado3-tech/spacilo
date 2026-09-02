/**
 * SpaceFit Vision — provider-neutral result schema.
 *
 * Every vision provider (Gemini today, others later) must return data in this
 * shape. Nothing downstream of this file knows which provider produced it.
 *
 * The schema deliberately carries NO physical measurements: an ordinary
 * photograph cannot give reliable dimensions, so the provider only identifies
 * objects and EarnRoom's own catalogue supplies typical sizes.
 *
 * Two kinds of certainty are modelled SEPARATELY:
 *  - object_confidence   — how sure the provider is about WHAT it is
 *  - quantity_confidence — how sure the provider is about HOW MANY there are
 *
 * A stack of overlapping cardboard boxes is a very common case where the first
 * is high and the second is low.
 */
import { z } from "zod";

export const SPACEFIT_VISION_SCHEMA_VERSION = "v2";
export const SPACEFIT_VISION_PROMPT_VERSION = "v2";

export const MAX_PHOTOS_PER_ANALYSIS = 10;

export const ITEM_CATEGORIES = [
  "boxes",
  "bags",
  "furniture",
  "appliances",
  "electronics",
  "bicycles",
  "sports",
  "student",
  "business",
  "documents",
  "other",
] as const;

export const TRI_STATE = ["yes", "no", "unknown"] as const;
export const DUPLICATE_CERTAINTY = ["likely_same", "possibly_same", "likely_different"] as const;

/** Coarse, renter-friendly certainty bands. Raw probabilities stay internal. */
export const CONFIDENCE_BANDS = ["high", "medium", "low"] as const;
export type ConfidenceBand = (typeof CONFIDENCE_BANDS)[number];

/**
 * Whether a detection looks like something the renter is presenting for
 * storage, or part of the room/garage around it.
 */
export const INVENTORY_INTENTS = [
  "likely_inventory",
  "uncertain_inventory",
  "likely_environment",
] as const;
export type InventoryIntent = (typeof INVENTORY_INTENTS)[number];

export const RESTRICTED_REASONS = [
  "flammable_fuel",
  "gas_cylinder",
  "chemical",
  "weapon_like",
  "perishable_food",
  "other",
] as const;

/** One suggested belonging, possibly seen across several photographs. */
export const detectionSchema = z.object({
  label: z.string().trim().min(1).max(80),
  suggested_category: z.enum(ITEM_CATEGORIES).default("other"),
  suggested_catalogue_key: z.string().trim().max(60).nullable().default(null),
  /** Best estimate of DISTINCT physical objects across the whole photo set. */
  estimated_quantity: z.number().int().min(1).max(999).default(1),
  minimum_plausible_quantity: z.number().int().min(0).max(999).nullable().default(null),
  maximum_plausible_quantity: z.number().int().min(0).max(999).nullable().default(null),
  object_confidence: z.enum(CONFIDENCE_BANDS).default("medium"),
  quantity_confidence: z.enum(CONFIDENCE_BANDS).default("medium"),
  /** Is this a belonging, or part of the room it is standing in? */
  inventory_intent: z.enum(INVENTORY_INTENTS).default("likely_inventory"),
  /** True for homogeneous, repeated goods (boxes, crates, bags, chairs…). */
  repeated_item_group: z.boolean().default(false),
  stackable_suggestion: z.enum(TRI_STATE).default("unknown"),
  fragile_suggestion: z.enum(TRI_STATE).default("unknown"),
  orientation_flexible_suggestion: z.enum(TRI_STATE).default("unknown"),
  /** Indexes into the photo list sent to the provider. */
  source_photo_indexes: z.array(z.number().int().min(0)).default([]),
  possible_duplicate_group: z.string().trim().max(60).nullable().default(null),
  duplicate_certainty: z.enum(DUPLICATE_CERTAINTY).nullable().default(null),
  possible_restricted_item: z.boolean().default(false),
  restricted_reason: z.enum(RESTRICTED_REASONS).nullable().default(null),
  notes: z.string().trim().max(240).nullable().default(null),
});

export const visionResultSchema = z.object({
  detections: z.array(detectionSchema).max(120).default([]),
});

export type VisionDetection = z.infer<typeof detectionSchema>;
export type VisionResult = z.infer<typeof visionResultSchema>;

/**
 * Representative numeric score kept only for backwards compatibility with the
 * stored `confidence_score` column. Never shown to renters.
 */
export const BAND_SCORE: Record<ConfidenceBand, number> = { high: 0.9, medium: 0.65, low: 0.35 };

export function scoreToBand(score: number | null | undefined): ConfidenceBand {
  if (score === null || score === undefined) return "medium";
  if (score >= 0.8) return "high";
  if (score >= 0.55) return "medium";
  return "low";
}

/** JSON Schema mirror handed to providers that support structured output. */
export const VISION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["detections"],
  properties: {
    detections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "label",
          "suggested_category",
          "suggested_catalogue_key",
          "estimated_quantity",
          "minimum_plausible_quantity",
          "maximum_plausible_quantity",
          "object_confidence",
          "quantity_confidence",
          "inventory_intent",
          "repeated_item_group",
          "stackable_suggestion",
          "fragile_suggestion",
          "orientation_flexible_suggestion",
          "source_photo_indexes",
          "possible_duplicate_group",
          "duplicate_certainty",
          "possible_restricted_item",
          "restricted_reason",
          "notes",
        ],
        properties: {
          label: { type: "string" },
          suggested_category: { type: "string", enum: [...ITEM_CATEGORIES] },
          suggested_catalogue_key: { type: ["string", "null"] },
          estimated_quantity: { type: "integer", minimum: 1, maximum: 999 },
          minimum_plausible_quantity: { type: ["integer", "null"], minimum: 0, maximum: 999 },
          maximum_plausible_quantity: { type: ["integer", "null"], minimum: 0, maximum: 999 },
          object_confidence: { type: "string", enum: [...CONFIDENCE_BANDS] },
          quantity_confidence: { type: "string", enum: [...CONFIDENCE_BANDS] },
          inventory_intent: { type: "string", enum: [...INVENTORY_INTENTS] },
          repeated_item_group: { type: "boolean" },
          stackable_suggestion: { type: "string", enum: [...TRI_STATE] },
          fragile_suggestion: { type: "string", enum: [...TRI_STATE] },
          orientation_flexible_suggestion: { type: "string", enum: [...TRI_STATE] },
          source_photo_indexes: { type: "array", items: { type: "integer", minimum: 0 } },
          possible_duplicate_group: { type: ["string", "null"] },
          duplicate_certainty: { type: ["string", "null"], enum: [...DUPLICATE_CERTAINTY, null] },
          possible_restricted_item: { type: "boolean" },
          restricted_reason: { type: ["string", "null"], enum: [...RESTRICTED_REASONS, null] },
          notes: { type: ["string", "null"] },
        },
      },
    },
  },
} as const;

/* --------------------------------------------------------- error taxonomy */

export type VisionErrorCategory =
  | "provider_unavailable"
  | "provider_timeout"
  | "rate_limited"
  | "payment_required"
  | "malformed_response"
  | "photo_unavailable"
  | "unsupported_image"
  | "not_configured"
  | "unknown";

export const VISION_ERROR_MESSAGES: Record<VisionErrorCategory, string> = {
  provider_unavailable: "EarnRoom AI Vision isn't available right now. Please try again shortly.",
  provider_timeout: "That took longer than expected. Please try again.",
  rate_limited: "You've run a few scans in quick succession. Please wait a moment and try again.",
  payment_required: "EarnRoom AI Vision is temporarily unavailable. Please try again later.",
  malformed_response: "We couldn't read the results of that scan. Please try again.",
  photo_unavailable: "We couldn't open one of your photos.",
  unsupported_image: "One of your photos isn't a supported image.",
  not_configured: "EarnRoom AI Vision isn't switched on for this environment yet.",
  unknown: "Something went wrong while analysing your photos.",
};
