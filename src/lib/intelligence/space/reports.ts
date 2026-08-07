/**
 * Milestone 16 — intelligent reports.
 *
 * Reusable, presentation-free report objects. A surface renders lines; it
 * never re-derives a figure. Every report is a pure function of the analysis.
 */
import { formatPrice } from "@/lib/format";

import type { SpaceAnalysis, SpaceReport } from "./contracts";

const pct = (value: number) => `${Math.round(value)}%`;

export function spaceSummaryReport(analysis: SpaceAnalysis): SpaceReport {
  const best = analysis.suitability[0];
  return {
    kind: "summary",
    title: "Space summary",
    headline: `${analysis.space.name} — ${analysis.usable.availableVolumeM3}m³ available, scored ${analysis.optimisation.aiScore}/100.`,
    lines: [
      { label: "Floor area", value: `${analysis.usable.totalFloorAreaM2}m²` },
      {
        label: "Usable floor",
        value: `${analysis.usable.usableFloorAreaM2}m²`,
        detail: `${analysis.usable.blockedAreaM2}m² blocked, ${analysis.usable.walkableAreaM2}m² kept walkable`,
      },
      { label: "Ceiling", value: `${analysis.geometry.ceiling.heightM}m` },
      { label: "Zones", value: `${analysis.zones.length}` },
      ...(best ? [{ label: "Best suited to", value: best.label, detail: best.rating }] : []),
    ],
    notes: analysis.explanations.slice(0, 3),
  };
}

export function capacityReport(analysis: SpaceAnalysis): SpaceReport {
  return {
    kind: "capacity",
    title: "Capacity report",
    headline: `${analysis.optimisation.maximumCapacityM3}m³ of zoned capacity, ${analysis.optimisation.remainingVolumeM3}m³ still free.`,
    lines: [
      { label: "Available volume", value: `${analysis.usable.availableVolumeM3}m³` },
      { label: "Ceiling volume", value: `${analysis.usable.ceilingVolumeM3}m³` },
      { label: "Dead space", value: `${analysis.usable.deadSpaceM3}m³` },
      { label: "Storage density", value: pct(analysis.usable.storageDensity * 100) },
      { label: "Expansion potential", value: `${analysis.optimisation.expansionVolumeM3}m³` },
    ],
    notes: analysis.optimisation.unusedAreas,
  };
}

export function accessibilityReport(analysis: SpaceAnalysis): SpaceReport {
  return {
    kind: "accessibility",
    title: "Accessibility report",
    headline: `Access rated ${analysis.access.access}; loading rated ${analysis.access.loading}.`,
    lines: [
      {
        label: "Opening",
        value: `${analysis.access.doorWidthM}m × ${analysis.access.doorHeightM}m`,
      },
      { label: "Walkway", value: `${analysis.access.walkwayWidthM}m` },
      { label: "Ceiling clearance", value: `${analysis.access.ceilingClearanceM}m` },
      { label: "Turning space", value: `${analysis.access.turningRadiusM}m` },
      {
        label: "Largest item",
        value: `${analysis.access.largestItemM.widthM}m wide × ${analysis.access.largestItemM.heightM}m high`,
      },
    ],
    notes: [...analysis.access.route, ...analysis.access.notes],
  };
}

export function efficiencyReport(analysis: SpaceAnalysis): SpaceReport {
  return {
    kind: "efficiency",
    title: "Efficiency report",
    headline: `Space health ${analysis.health.overall}/100 (${analysis.health.band.replace("_", " ")}).`,
    lines: [
      { label: "Utilisation", value: pct(analysis.health.utilisation) },
      { label: "Dead space", value: pct(analysis.health.deadSpace) },
      { label: "Accessibility", value: pct(analysis.health.accessibility) },
      { label: "Organisation", value: pct(analysis.health.organisation) },
      { label: "Efficiency", value: pct(analysis.health.efficiency) },
      { label: "Packing density", value: pct(analysis.optimisation.packingDensity * 100) },
    ],
    notes: analysis.optimisation.unusedAreas,
  };
}

export function revenueReport(analysis: SpaceAnalysis, monthlyPence?: number): SpaceReport {
  const uplift = analysis.hostRecommendations.reduce(
    (sum, entry) => sum + (entry.upliftPence ?? 0),
    0,
  );
  const lines: SpaceReport["lines"] = [];
  if (monthlyPence && monthlyPence > 0) {
    lines.push({ label: "Current asking price", value: `${formatPrice(monthlyPence)} / month` });
    lines.push({
      label: "Estimated uplift if improvements are made",
      value: `${formatPrice(uplift)} / month`,
      detail: "An estimate, not a guarantee of income.",
    });
  }
  lines.push({ label: "Lettable volume", value: `${analysis.usable.availableVolumeM3}m³` });
  lines.push({ label: "Space score", value: `${analysis.optimisation.aiScore}/100` });

  return {
    kind: "revenue",
    title: "Revenue report",
    headline:
      monthlyPence && monthlyPence > 0
        ? `Improvements could support around ${formatPrice(uplift)} more per month.`
        : "Add an asking price to see estimated revenue potential.",
    lines,
    notes: ["All figures are estimates based on the space itself, not on market demand."],
  };
}

export function improvementReport(analysis: SpaceAnalysis): SpaceReport {
  return {
    kind: "improvement",
    title: "Host improvement report",
    headline:
      analysis.hostRecommendations.length === 0
        ? "No improvements identified — the space is already well set up."
        : `${analysis.hostRecommendations.length} improvement${analysis.hostRecommendations.length === 1 ? "" : "s"} identified.`,
    lines: analysis.hostRecommendations.map((entry) => ({
      label: entry.action,
      value: `${entry.priority} priority`,
      detail: entry.reason,
    })),
    notes: analysis.hostRecommendations.flatMap((entry) => entry.evidence).slice(0, 6),
  };
}

export function buildReports(analysis: SpaceAnalysis, monthlyPence?: number): SpaceReport[] {
  return [
    spaceSummaryReport(analysis),
    capacityReport(analysis),
    accessibilityReport(analysis),
    efficiencyReport(analysis),
    revenueReport(analysis, monthlyPence),
    improvementReport(analysis),
  ];
}
