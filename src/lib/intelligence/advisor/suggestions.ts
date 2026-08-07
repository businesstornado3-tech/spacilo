/**
 * Milestone 6 — smart suggestions.
 *
 * Proactive, but never speculative: each suggestion names the observation that
 * triggered it and the volume it is expected to free.
 */
import type { InventoryLine } from "@/lib/spaceplanner/types";

import type { ListingAssessment, SmartSuggestion } from "./contracts";

const round1 = (value: number) => Math.round(value * 10) / 10;

function volumeOf(line: InventoryLine): number {
  return (line.item.width * line.item.depth * line.item.height * line.quantity) / 1_000_000;
}

export function buildSmartSuggestions(
  lines: InventoryLine[],
  assessment: ListingAssessment,
): SmartSuggestion[] {
  const { analysis, score } = assessment;
  const suggestions: SmartSuggestion[] = [];

  const soft = lines.filter(
    (line) => line.item.category === "seasonal" || line.item.id.includes("bedding"),
  );
  if (soft.length > 0) {
    const saved = round1(soft.reduce((sum, line) => sum + volumeOf(line), 0) * 0.45);
    suggestions.push({
      id: "vacuum-bags",
      kind: "technique",
      title: "Use vacuum bags for soft items",
      detail: `Compressing ${soft.length} soft line(s) typically frees around ${saved.toFixed(1)}m³.`,
      evidence: [`${soft.length} compressible line(s) in this inventory.`],
      volumeSavedM3: saved,
      confidence: 0.7,
      impact: saved >= 0.5 ? "high" : "medium",
    });
  }

  if (analysis.shelves.length === 0 && analysis.usable.wallCapacityM2 > 4) {
    const saved = round1(Math.min(2.5, analysis.usable.wallCapacityM2 * 0.25));
    suggestions.push({
      id: "use-shelving",
      kind: "equipment",
      title: "Add shelving along the longest wall",
      detail: `About ${analysis.usable.wallCapacityM2.toFixed(1)}m² of mountable wall is unused; shelving would lift roughly ${saved.toFixed(1)}m³ off the floor.`,
      evidence: [
        `Mountable wall area ${analysis.usable.wallCapacityM2.toFixed(1)}m².`,
        "No shelving recorded in this space.",
      ],
      volumeSavedM3: saved,
      confidence: 0.75,
      impact: "high",
    });
  }

  const bike = lines.find((line) => line.item.icon === "bike");
  if (bike) {
    suggestions.push({
      id: "bike-last",
      kind: "sequencing",
      title: "Load the bicycle last",
      detail: "Bicycles are awkward to move past a full space and are usually needed most often.",
      evidence: [
        `${bike.quantity} bicycle line(s) in this inventory.`,
        `Walkway width about ${analysis.access.walkwayWidthM.toFixed(2)}m.`,
      ],
      volumeSavedM3: 0,
      confidence: 0.8,
      impact: "medium",
    });
  }

  const fragileCount = lines.filter((line) => line.item.fragile).length;
  if (fragileCount > 0) {
    suggestions.push({
      id: "fragile-high",
      kind: "protection",
      title: "Store fragile items higher",
      detail: "Keeping fragile boxes above knee height keeps them clear of the walking line.",
      evidence: [`${fragileCount} fragile line(s).`, `Ceiling height ${analysis.geometry.ceiling.heightM.toFixed(2)}m.`],
      volumeSavedM3: 0,
      confidence: 0.82,
      impact: "medium",
    });
  }

  if (score.fitPercent > 92) {
    suggestions.push({
      id: "split-inventory",
      kind: "split",
      title: "Consider splitting the inventory",
      detail: `The pack fills about ${score.fitPercent}% of the usable volume, which leaves almost nothing spare.`,
      evidence: [
        `Fit ${score.fitPercent}% of usable volume.`,
        `Remaining volume about ${assessment.remainingVolumeM3.toFixed(1)}m³.`,
      ],
      volumeSavedM3: 0,
      confidence: 0.74,
      impact: "high",
    });
  }

  if (assessment.remainingVolumeM3 >= 2) {
    suggestions.push({
      id: "reserve-volume",
      kind: "capacity",
      title: "Reserve the spare volume",
      detail: `About ${assessment.remainingVolumeM3.toFixed(1)}m³ stays free — worth agreeing with the host if you expect to add more.`,
      evidence: [`Expansion potential ${Math.round(analysis.health.expansionPotential)}%.`],
      volumeSavedM3: 0,
      confidence: 0.7,
      impact: "low",
    });
  }

  const heavyBulky = [...lines]
    .filter((line) => line.item.weight === "heavy")
    .sort((a, b) => volumeOf(b) - volumeOf(a))[0];
  if (heavyBulky && score.fitPercent > 85) {
    suggestions.push({
      id: "remove-largest",
      kind: "capacity",
      title: `Store the ${heavyBulky.item.name.toLowerCase()} elsewhere`,
      detail: `Removing it frees about ${round1(volumeOf(heavyBulky)).toFixed(1)}m³ and eases the pack considerably.`,
      evidence: [
        `${heavyBulky.item.name} occupies about ${round1(volumeOf(heavyBulky)).toFixed(1)}m³.`,
        `Current fit ${score.fitPercent}%.`,
      ],
      volumeSavedM3: round1(volumeOf(heavyBulky)),
      confidence: 0.76,
      impact: "high",
    });
  }

  return suggestions.sort(
    (a, b) =>
      rank(b.impact) - rank(a.impact) || b.volumeSavedM3 - a.volumeSavedM3 || a.id.localeCompare(b.id),
  );
}

function rank(impact: SmartSuggestion["impact"]): number {
  return impact === "high" ? 3 : impact === "medium" ? 2 : 1;
}
