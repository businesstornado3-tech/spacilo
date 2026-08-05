/**
 * SpaceFit Vision — host space measurement schema.
 *
 * The renter-side schema (`schema.ts`) deliberately carries NO measurements,
 * because guessing the size of a sofa from a photo is unreliable. A ROOM is a
 * different problem: doorways, bricks, floor tiles, standard garage widths and
 * skirting boards give a vision model real reference scale, so a coarse
 * estimate is genuinely useful.
 *
 * Even so, every number here is a PROPOSAL. Nothing in this schema is ever
 * written to a listing automatically — a host must review and confirm it, and
 * only that explicit action can mark measurements as verified.
 */
import { z } from "zod";

export const SPACE_SCAN_SCHEMA_VERSION = "space-v1";
export const SPACE_SCAN_PROMPT_VERSION = "space-v1";

export const MAX_SPACE_SCAN_PHOTOS = 8;

export const CONFIDENCE_BANDS = ["high", "medium", "low"] as const;

/** Things that permanently eat into usable storage volume. */
export const OBSTACLE_KINDS = [
  "boiler",
  "fuse_box",
  "meter",
  "fixed_shelving",
  "workbench",
  "sloping_roof",
  "staircase",
  "washing_machine",
  "bicycle_rack",
  "structural_column",
  "window",
  "doorway_swing",
  "other",
] as const;
export type ObstacleKind = (typeof OBSTACLE_KINDS)[number];

export const OBSTACLE_LABELS: Record<ObstacleKind, string> = {
  boiler: "Boiler",
  fuse_box: "Fuse box",
  meter: "Utility meter",
  fixed_shelving: "Fixed shelving",
  workbench: "Workbench",
  sloping_roof: "Sloping roof",
  staircase: "Staircase",
  washing_machine: "Washing machine or appliance",
  bicycle_rack: "Bicycle rack",
  structural_column: "Structural column",
  window: "Window",
  doorway_swing: "Door swing area",
  other: "Something else",
};

/** Why a scan might be less reliable — always surfaced to the host. */
export const SCAN_LIMITATIONS = [
  "no_reference_object",
  "partial_view",
  "poor_lighting",
  "cluttered",
  "single_angle",
  "wide_angle_distortion",
] as const;

export const SCAN_LIMITATION_LABELS: Record<(typeof SCAN_LIMITATIONS)[number], string> = {
  no_reference_object: "Nothing of known size to measure against",
  partial_view: "Only part of the space is visible",
  poor_lighting: "Lighting made edges hard to see",
  cluttered: "The space is full, hiding the walls and floor",
  single_angle: "Only one angle was provided",
  wide_angle_distortion: "The photo looks wide-angle, which distorts distances",
};

export const proposedObstacleSchema = z.object({
  kind: z.enum(OBSTACLE_KINDS).default("other"),
  label: z.string().trim().min(1).max(60),
  estimated_volume_m3: z.number().min(0).max(200).nullable().default(null),
  confidence: z.enum(CONFIDENCE_BANDS).default("low"),
});

export const spaceScanResultSchema = z.object({
  /** Coarse metre estimates. Null whenever the model cannot judge them. */
  estimated_width_m: z.number().min(0.3).max(100).nullable().default(null),
  estimated_depth_m: z.number().min(0.3).max(100).nullable().default(null),
  estimated_usable_height_m: z.number().min(0.3).max(20).nullable().default(null),
  measurement_confidence: z.enum(CONFIDENCE_BANDS).default("low"),
  /** What gave the model its sense of scale, e.g. "standard doorway". */
  reference_used: z.string().trim().max(120).nullable().default(null),
  obstacles: z.array(proposedObstacleSchema).max(20).default([]),
  limitations: z.array(z.enum(SCAN_LIMITATIONS)).max(6).default([]),
  /** Short, factual observations for the host. */
  notes: z.string().trim().max(600).nullable().default(null),
});

export type ProposedObstacle = z.infer<typeof proposedObstacleSchema>;
export type SpaceScanResult = z.infer<typeof spaceScanResultSchema>;

/** JSON Schema mirror handed to providers that support structured output. */
export const SPACE_SCAN_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "estimated_width_m",
    "estimated_depth_m",
    "estimated_usable_height_m",
    "measurement_confidence",
    "reference_used",
    "obstacles",
    "limitations",
    "notes",
  ],
  properties: {
    estimated_width_m: { type: ["number", "null"] },
    estimated_depth_m: { type: ["number", "null"] },
    estimated_usable_height_m: { type: ["number", "null"] },
    measurement_confidence: { type: "string", enum: [...CONFIDENCE_BANDS] },
    reference_used: { type: ["string", "null"] },
    obstacles: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "label", "estimated_volume_m3", "confidence"],
        properties: {
          kind: { type: "string", enum: [...OBSTACLE_KINDS] },
          label: { type: "string" },
          estimated_volume_m3: { type: ["number", "null"] },
          confidence: { type: "string", enum: [...CONFIDENCE_BANDS] },
        },
      },
    },
    limitations: { type: "array", items: { type: "string", enum: [...SCAN_LIMITATIONS] } },
    notes: { type: ["string", "null"] },
  },
} as const;

/* ------------------------------------------------------------- derivation */

export interface DerivedSpaceFigures {
  floorAreaM2: number | null;
  grossVolumeM3: number | null;
  usableVolumeM3: number | null;
  obstacleVolumeM3: number;
}

/**
 * Derives areas and volumes from a scan result. Kept deterministic and out of
 * the provider so the arithmetic can never be hallucinated.
 */
export function deriveSpaceFigures(result: SpaceScanResult): DerivedSpaceFigures {
  const obstacleVolume = round(
    result.obstacles.reduce((total, obstacle) => total + (obstacle.estimated_volume_m3 ?? 0), 0),
    2,
  );

  const width = result.estimated_width_m;
  const depth = result.estimated_depth_m;
  const height = result.estimated_usable_height_m;

  const floorArea = width && depth ? round(width * depth, 2) : null;
  const gross = floorArea && height ? round(floorArea * height, 2) : null;
  const usable = gross === null ? null : Math.max(round(gross - obstacleVolume, 2), 0);

  return {
    floorAreaM2: floorArea,
    grossVolumeM3: gross,
    usableVolumeM3: usable,
    obstacleVolumeM3: obstacleVolume,
  };
}

function round(value: number, dp: number) {
  const f = 10 ** dp;
  return Math.round(value * f) / f;
}

export const SPACE_SCAN_DISCLAIMER =
  "SpaceFit AI estimates from photos and can be wrong. Check every figure against the real space before you publish — nothing is saved to your listing until you confirm it.";
