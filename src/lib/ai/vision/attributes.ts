/**
 * Stages 5–10 — object attributes.
 *
 * Everything that turns a fused object into something storable can be reasoned
 * about: dimensions, weight, material, fragility, stackability, climate
 * sensitivity and damage observations — each with its own confidence and its
 * own plain-English reason.
 *
 * Two boundaries are absolute here:
 *   • Nothing is a measurement. Every figure ships with a range and a basis.
 *   • Damage is an OBSERVATION, never a finding. Below the assertion threshold
 *     it is phrased as a possibility and marked for human review.
 */
import { hashString } from "@/lib/vision/hash";

import type { WeightClass } from "@/lib/spaceplanner/types";
import type { LiftClass, VisionDimensions, VisionWeight } from "@/lib/intelligence/vision/contracts";
import { detectionClass } from "@/lib/intelligence/vision/taxonomy";

import type { FusedInstance } from "./fusion";
import {
  DAMAGE_ASSERT_THRESHOLD,
  REVIEW_THRESHOLD,
  type ClimateReading,
  type DamageKind,
  type DamageObservation,
  type FragilityReading,
  type InstanceConfidence,
  type MaterialReading,
  type OcrRead,
  type StackingReading,
  type VisionInstance,
  type VisionMaterial,
} from "./types";

const round1 = (value: number) => Math.round(value * 10) / 10;
const round2 = (value: number) => Math.round(value * 100) / 100;
const round3 = (value: number) => Math.round(value * 1000) / 1000;

/** Widest adjustment apparent size may make to a cautious taxonomy figure. */
const MAX_SCALE_ADJUSTMENT = 0.12;

/* ------------------------------------------------------------- dimensions */

export function estimateDimensions(instance: FusedInstance): VisionDimensions {
  const entry = detectionClass(instance.classKey);
  const base = entry
    ? { width: entry.width, depth: entry.depth, height: entry.height }
    : { width: 50, depth: 40, height: 40 };

  const scale = 1 + (instance.apparentArea - 0.25) * MAX_SCALE_ADJUSTMENT * 2;
  const widthCm = Math.max(5, Math.round(base.width * scale));
  const depthCm = Math.max(5, Math.round(base.depth * scale));
  const heightCm = Math.max(5, Math.round(base.height * scale));

  // More angles, tighter band: a single view barely sees depth at all.
  const views = instance.viewpoints.length;
  const tolerance = views >= 3 ? 0.08 : views === 2 ? 0.12 : 0.18;

  const w = widthCm / 100;
  const d = depthCm / 100;
  const h = heightCm / 100;

  return {
    widthCm,
    depthCm,
    heightCm,
    volumeM3: round3(w * d * h),
    surfaceAreaM2: round3(2 * (w * d + w * h + d * h)),
    footprintM2: round3(w * d),
    boundingBox: { widthCm, depthCm, heightCm },
    minCm: {
      width: Math.round(widthCm * (1 - tolerance)),
      depth: Math.round(depthCm * (1 - tolerance)),
      height: Math.round(heightCm * (1 - tolerance)),
    },
    maxCm: {
      width: Math.round(widthCm * (1 + tolerance)),
      depth: Math.round(depthCm * (1 + tolerance)),
      height: Math.round(heightCm * (1 + tolerance)),
    },
    dimensionConfidence: round2(Math.min(0.92, 0.55 + views * 0.1 + instance.apparentArea * 0.2)),
    basis:
      views >= 2
        ? `Typical size for a ${instance.label.toLowerCase()}, adjusted using ${views} angles.`
        : `Typical size for a ${instance.label.toLowerCase()}, adjusted by how large it appears.`,
  };
}

/* ---------------------------------------------------------------- material */

/** Kilograms per cubic metre, cautious mid-range figures. */
const MATERIAL_DENSITY: Record<VisionMaterial, number> = {
  wood: 190,
  glass: 260,
  metal: 320,
  plastic: 90,
  fabric: 70,
  leather: 110,
  cardboard: 130,
  ceramic: 280,
  composite: 150,
  unknown: 140,
};

const CLASS_MATERIAL_CUES: Array<{ test: RegExp; material: VisionMaterial; reason: string }> = [
  { test: /box|carton|archive/, material: "cardboard", reason: "flat printed faces with taped seams" },
  { test: /tub|bin|crate|plastic/, material: "plastic", reason: "moulded panels with integrated handles" },
  { test: /mirror|glass|display|tv|monitor|screen/, material: "glass", reason: "flat reflective panel" },
  { test: /sofa|armchair|mattress|cushion|rug|curtain/, material: "fabric", reason: "soft upholstered surfaces" },
  { test: /bike|tool|ladder|rack|shelf|weight|tyre|appliance|fridge|washer/, material: "metal", reason: "hard reflective frame and fixings" },
  { test: /table|wardrobe|drawer|desk|bookcase|chair|cabinet|bed/, material: "wood", reason: "panel edges and grain-consistent surfaces" },
  { test: /crockery|vase|pot|ceramic/, material: "ceramic", reason: "glazed rounded surfaces" },
];

export function readMaterial(instance: FusedInstance): MaterialReading {
  const hint = instance.sightings.find((sighting) => sighting.materialHint)?.materialHint as
    | VisionMaterial
    | undefined;
  const key = `${instance.classKey} ${instance.label}`.toLowerCase();
  const cue = CLASS_MATERIAL_CUES.find((entry) => entry.test.test(key));

  const material: VisionMaterial = hint ?? cue?.material ?? "unknown";
  const seed = hashString(`${instance.identityKey}:material`);
  const base = hint ? 0.82 : cue ? 0.72 : 0.45;
  const confidence = round2(Math.min(0.94, base + ((seed % 12) / 100) - 0.04));

  const alternatives: Array<{ material: VisionMaterial; confidence: number }> = [];
  if (material !== "composite") {
    alternatives.push({ material: "composite", confidence: round2(confidence * 0.4) });
  }
  if (material !== "unknown" && confidence < 0.75) {
    alternatives.push({ material: "unknown", confidence: round2(1 - confidence) });
  }

  return {
    material,
    confidence,
    reason:
      material === "unknown"
        ? "Surface not clear enough to call a material — please confirm."
        : `Read as ${material} from ${cue?.reason ?? "the visible surface"}.`,
    alternatives,
  };
}

/* ------------------------------------------------------------------ weight */

export function estimateWeight(
  instance: FusedInstance,
  dimensions: VisionDimensions,
  material: MaterialReading,
): VisionWeight {
  const entry = detectionClass(instance.classKey);
  const density = MATERIAL_DENSITY[material.material];
  // Storage items are hollow far more often than solid, hence the fill factor.
  const fill = entry?.storageType === "boxed" ? 0.55 : 0.35;
  const perUnitKg = Math.max(0.5, round1(dimensions.volumeM3 * density * fill));

  const weightClass: WeightClass =
    entry?.weight ?? (perUnitKg > 45 ? "heavy" : perUnitKg > 18 ? "medium" : "light");
  const twoPersonLift = perUnitKg >= 23;
  const heavyLift = perUnitKg >= 45;
  const fragileLift = Boolean(entry?.fragile);
  const liftClass: LiftClass = heavyLift
    ? "heavy_lift"
    : fragileLift
      ? "fragile_lift"
      : twoPersonLift
        ? "two_person"
        : "one_person";

  const safeStackLoadKg = entry?.stackable ? round1(perUnitKg * 1.5) : 0;

  return {
    perUnitKg,
    totalKg: perUnitKg,
    weightClass,
    liftClass,
    heavyLift,
    twoPersonLift,
    fragileLift,
    safeStackLoadKg,
    safeToStack: Boolean(entry?.stackable) && !fragileLift,
    weightConfidence: round2(
      Math.min(0.88, dimensions.dimensionConfidence * 0.7 + material.confidence * 0.3),
    ),
  };
}

/* -------------------------------------------------------------- fragility */

const FRAGILE_MATERIALS: VisionMaterial[] = ["glass", "ceramic"];

export function readFragility(
  instance: FusedInstance,
  material: MaterialReading,
): FragilityReading {
  const entry = detectionClass(instance.classKey);
  const key = `${instance.classKey} ${instance.label}`.toLowerCase();
  const veryFragile = /mirror|glass|tv|monitor|screen|artwork|crockery|vase/.test(key);
  const fragile = Boolean(entry?.fragile) || FRAGILE_MATERIALS.includes(material.material);
  const robust = /tyre|tool|weight|crate|metal|rack/.test(key);

  const grade = veryFragile ? "very_fragile" : fragile ? "fragile" : robust ? "robust" : "normal";
  const measures: string[] = [];
  if (grade === "very_fragile") {
    measures.push("Wrap and corner-protect", "Store upright", "Keep off the bottom of a stack");
  } else if (grade === "fragile") {
    measures.push("Pad the outer faces", "Keep towards the top of a stack");
  } else if (grade === "normal") {
    measures.push("Standard handling");
  } else {
    measures.push("No special protection needed");
  }

  return {
    grade,
    confidence: round2(Math.min(0.92, 0.6 + material.confidence * 0.3)),
    reason: veryFragile
      ? "Large rigid panel that breaks rather than bends."
      : fragile
        ? `Fragile because of its ${material.material} construction.`
        : robust
          ? "Hard-wearing construction with no delicate faces."
          : "No delicate surfaces visible.",
    measures,
  };
}

/* ------------------------------------------------------------- stacking */

export function readStacking(
  instance: FusedInstance,
  weight: VisionWeight,
  fragility: FragilityReading,
): StackingReading {
  const entry = detectionClass(instance.classKey);
  const stackable = Boolean(entry?.stackable);
  const flatTop = /box|tub|bin|crate|drawer|cabinet|table/.test(instance.classKey);

  const stackability =
    !stackable || fragility.grade === "very_fragile"
      ? "not_stackable"
      : fragility.grade === "fragile" || !flatTop
        ? "partially_stackable"
        : "stackable";

  const maxStack =
    stackability === "not_stackable" ? 1 : stackability === "partially_stackable" ? 2 : (entry?.maxStack ?? 3);

  return {
    stackability,
    maxStack,
    safeLoadKg: stackability === "not_stackable" ? 0 : weight.safeStackLoadKg,
    advice:
      stackability === "not_stackable"
        ? "Keep this on its own — nothing on top."
        : stackability === "partially_stackable"
          ? `Take up to ${maxStack} high, lightest on top.`
          : `Flat top and even sides — stacks up to ${maxStack} high.`,
    confidence: round2(Math.min(0.9, 0.62 + weight.weightConfidence * 0.3)),
  };
}

/* --------------------------------------------------------------- climate */

export function readClimate(
  instance: FusedInstance,
  material: MaterialReading,
): ClimateReading {
  const key = `${instance.classKey} ${instance.label}`.toLowerCase();
  const needs = new Set<ClimateReading["needs"][number]>();

  if (/tv|monitor|screen|computer|electronic|speaker|console/.test(key)) {
    needs.add("dry");
    needs.add("temperature_controlled");
  }
  if (/sofa|mattress|cushion|fabric|curtain|rug|clothes|wardrobe/.test(key) || material.material === "fabric") {
    needs.add("moisture_protection");
    needs.add("ventilation");
  }
  if (/book|paper|archive|artwork|photo/.test(key)) {
    needs.add("dry");
    needs.add("moisture_protection");
  }
  if (material.material === "wood") needs.add("dry");
  if (material.material === "metal") needs.add("moisture_protection");

  const list = [...needs];
  return {
    needs: list,
    sensitive: list.length > 0,
    confidence: round2(Math.min(0.88, 0.6 + material.confidence * 0.25)),
    reason:
      list.length === 0
        ? "No particular climate needs — a dry, secure space is enough."
        : `Best kept ${list.includes("temperature_controlled") ? "somewhere dry and temperature-stable" : "somewhere dry and well ventilated"}.`,
  };
}

/* ---------------------------------------------------------------- damage */

const DAMAGE_PATTERNS: Array<{ test: RegExp; kind: DamageKind }> = [
  { test: /dent/, kind: "dent" },
  { test: /crack/, kind: "crack" },
  { test: /broken|shatter/, kind: "broken_glass" },
  { test: /water|damp|stain/, kind: "water_damage" },
  { test: /torn|tear|rip/, kind: "torn_packaging" },
  { test: /scratch|scuff|mark|surface/, kind: "surface_damage" },
];

export function readDamage(instance: FusedInstance): DamageObservation[] {
  const observations: DamageObservation[] = [];

  for (const sighting of instance.sightings) {
    for (const hint of sighting.damageHints) {
      const match = DAMAGE_PATTERNS.find((entry) => entry.test.test(hint.toLowerCase()));
      if (!match) continue;
      const seed = hashString(`${sighting.id}:${hint}`);
      const confidence = round2(
        Math.min(0.93, 0.5 + ((seed % 40) / 100) * sighting.frameQuality + sighting.frameQuality * 0.15),
      );
      const asserted = confidence >= DAMAGE_ASSERT_THRESHOLD;
      observations.push({
        kind: match.kind,
        confidence,
        asserted,
        photoId: sighting.photoId,
        note: asserted
          ? `Visible ${match.kind.replace(/_/g, " ")} on this item.`
          : `May show ${match.kind.replace(/_/g, " ")} — worth a closer look before storing.`,
      });
    }
  }

  return observations;
}

/* ------------------------------------------------------------ confidence */

export function scoreInstance(parts: {
  detection: number;
  classification: number;
  dimension: number;
  weight: number;
  material: number;
}): InstanceConfidence {
  const overall = round2(
    parts.detection * 0.32 +
      parts.classification * 0.24 +
      parts.dimension * 0.2 +
      parts.weight * 0.12 +
      parts.material * 0.12,
  );

  const band = overall >= 0.85 ? "high" : overall >= 0.75 ? "good" : overall >= 0.6 ? "moderate" : "low";
  const weakest = (
    [
      ["how clearly it was seen", parts.detection],
      ["what it is", parts.classification],
      ["its size", parts.dimension],
      ["its weight", parts.weight],
      ["its material", parts.material],
    ] as const
  ).reduce((low, entry) => (entry[1] < low[1] ? entry : low));

  return {
    detection: round2(parts.detection),
    classification: round2(parts.classification),
    dimension: round2(parts.dimension),
    weight: round2(parts.weight),
    material: round2(parts.material),
    overall,
    band,
    needsReview: overall < REVIEW_THRESHOLD,
    uncertainty: overall < REVIEW_THRESHOLD ? `Least certain about ${weakest[0]}.` : null,
  };
}

/* ------------------------------------------------------------- assembly */

/** Builds the full instance record from a fused object and its text reads. */
export function buildInstance(instance: FusedInstance, ocr: OcrRead[]): VisionInstance {
  const entry = detectionClass(instance.classKey);
  const dimensions = estimateDimensions(instance);
  const material = readMaterial(instance);
  const weight = estimateWeight(instance, dimensions, material);
  const fragility = readFragility(instance, material);
  const stacking = readStacking(instance, weight, fragility);
  const climate = readClimate(instance, material);
  const damage = readDamage(instance);

  const classification = round2(
    Math.min(0.95, instance.detectionConfidence * 0.7 + (entry ? 0.25 : 0)),
  );
  const confidence = scoreInstance({
    detection: instance.detectionConfidence,
    classification,
    dimension: dimensions.dimensionConfidence,
    weight: weight.weightConfidence,
    material: material.confidence,
  });

  const mine = ocr.filter((read) => instance.photoIds.includes(read.photoId));
  const explanations = [
    `Seen in ${instance.photoIds.length} photo${instance.photoIds.length === 1 ? "" : "s"}${
      instance.corroboration > 1 ? ` and confirmed from ${instance.corroboration} angles` : ""
    }.`,
    dimensions.basis,
    material.reason,
    fragility.reason,
    stacking.advice,
    climate.reason,
  ];
  if (mine.length > 0) explanations.push(`Label read: "${mine[0]!.text}".`);
  if (confidence.uncertainty) explanations.push(confidence.uncertainty);

  return {
    id: `obj-${instance.identityKey.replace("#", "-")}`,
    classKey: instance.classKey,
    label: entry ? `${entry.label} ${instance.ordinal}` : `${instance.label} ${instance.ordinal}`,
    quantity: 1,
    category: entry?.category ?? "boxes",
    subcategory: entry?.subcategory ?? "Unclassified",
    identityKey: instance.identityKey,
    dimensions,
    weight,
    weightClass: weight.weightClass,
    material,
    fragility,
    stacking,
    climate,
    damage,
    ocr: mine,
    confidence,
    photoIds: [...instance.photoIds],
    viewpoints: [...instance.viewpoints],
    catalogueId: entry?.catalogueId ?? null,
    explanations,
    corrected: false,
  };
}
