/**
 * Stage 7 — fragility analysis.
 *
 * Looks for the materials and shapes that break: glass, screens, electronics,
 * artwork, mirrors and sensitive equipment. Each finding maps to a protection
 * measure a person can actually act on.
 */
import type { FragilityLevel, ProtectionMeasure, VisionClassification, VisionFragility } from "./contracts";
import { detectionClass } from "./taxonomy";

interface Rule {
  match: (key: string, subcategory: string) => boolean;
  reason: string;
  level: FragilityLevel;
  measures: ProtectionMeasure[];
}

const RULES: Rule[] = [
  {
    match: (_key, subcategory) => subcategory === "Screen",
    reason: "Screen panel — cracks under point pressure.",
    level: "high",
    measures: ["padding", "vertical_storage", "corner_protection", "top_of_stack"],
  },
  {
    match: (key) => key === "microwave" || key === "desktop-pc",
    reason: "Electronics with glass or moving internals.",
    level: "moderate",
    measures: ["padding", "climate_control", "top_of_stack"],
  },
  {
    match: (_key, subcategory) => subcategory === "Musical instrument",
    reason: "Instrument — sensitive to knocks and damp.",
    level: "high",
    measures: ["padding", "vertical_storage", "climate_control"],
  },
  {
    match: (key) => key === "christmas-decorations",
    reason: "Glass ornaments are typical in seasonal boxes.",
    level: "moderate",
    measures: ["wrapping", "top_of_stack"],
  },
  {
    match: (key) => key === "wardrobe" || key === "bookcase" || key === "shelving-unit",
    reason: "Mirrored or glazed panels are common on these.",
    level: "low",
    measures: ["corner_protection"],
  },
  {
    match: (_key, subcategory) => subcategory === "Mattress",
    reason: "Absorbs damp and stains if left uncovered.",
    level: "low",
    measures: ["wrapping", "vertical_storage"],
  },
];

const LEVEL_ORDER: Record<FragilityLevel, number> = { none: 0, low: 1, moderate: 2, high: 3 };

export function analyseFragility(
  classKey: string,
  classification: VisionClassification,
): VisionFragility {
  const entry = detectionClass(classKey);
  const subcategory = entry?.subcategory ?? classification.subcategory;

  const reasons: string[] = [];
  const measures = new Set<ProtectionMeasure>();
  let level: FragilityLevel = "none";

  for (const rule of RULES) {
    if (!rule.match(classKey, subcategory)) continue;
    reasons.push(rule.reason);
    for (const measure of rule.measures) measures.add(measure);
    if (LEVEL_ORDER[rule.level] > LEVEL_ORDER[level]) level = rule.level;
  }

  // The taxonomy's own fragile flag is the floor, never overridden downwards.
  if (classification.fragile && LEVEL_ORDER[level] < LEVEL_ORDER["moderate"]) {
    level = "moderate";
    reasons.push("Marked fragile in the storage taxonomy.");
    measures.add("padding");
    measures.add("top_of_stack");
  }

  return { level, reasons, measures: [...measures] };
}
