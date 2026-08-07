/**
 * Milestone 15 — host dashboard preparation.
 *
 * Widget models only. No UI is redesigned in this phase: these are the shapes
 * a future host dashboard renders, so the data work is already done and
 * deterministic when the design lands.
 */
import { formatPrice } from "@/lib/format";

import type { SpaceAnalysis } from "./contracts";

export type HostWidgetId =
  | "space_health"
  | "space_efficiency"
  | "revenue_potential"
  | "suggested_improvements"
  | "occupancy"
  | "capacity_trend";

export interface HostWidget {
  id: HostWidgetId;
  title: string;
  /** Headline figure, already formatted for display. */
  value: string;
  /** Supporting line, one sentence. */
  detail: string;
  /** 0–100 where a meter makes sense, otherwise null. */
  meter: number | null;
  tone: "positive" | "neutral" | "attention";
}

function tone(score: number): HostWidget["tone"] {
  if (score >= 70) return "positive";
  if (score >= 45) return "neutral";
  return "attention";
}

export function buildHostWidgets(
  analysis: SpaceAnalysis,
  options: { monthlyPence?: number; occupiedVolumeM3?: number } = {},
): HostWidget[] {
  const occupied = options.occupiedVolumeM3 ?? 0;
  const capacity = Math.max(0.1, analysis.optimisation.maximumCapacityM3);
  const occupancy = Math.round(Math.min(100, (occupied / capacity) * 100));
  const uplift = analysis.hostRecommendations.reduce(
    (sum, entry) => sum + (entry.upliftPence ?? 0),
    0,
  );

  return [
    {
      id: "space_health",
      title: "Space health",
      value: `${analysis.health.overall}/100`,
      detail: `Rated ${analysis.health.band.replace("_", " ")} on access, efficiency and organisation.`,
      meter: analysis.health.overall,
      tone: tone(analysis.health.overall),
    },
    {
      id: "space_efficiency",
      title: "Space efficiency",
      value: `${analysis.health.efficiency}%`,
      detail: `${analysis.usable.deadSpaceM3}m³ is currently dead space.`,
      meter: analysis.health.efficiency,
      tone: tone(analysis.health.efficiency),
    },
    {
      id: "revenue_potential",
      title: "Revenue potential",
      value:
        options.monthlyPence && options.monthlyPence > 0
          ? `${formatPrice(uplift)} / month`
          : `${analysis.optimisation.aiScore}/100`,
      detail:
        options.monthlyPence && options.monthlyPence > 0
          ? "Estimated uplift if the suggested improvements are made."
          : "Add an asking price to estimate revenue potential.",
      meter: analysis.optimisation.aiScore,
      tone: tone(analysis.optimisation.aiScore),
    },
    {
      id: "suggested_improvements",
      title: "Suggested improvements",
      value: `${analysis.hostRecommendations.length}`,
      detail:
        analysis.hostRecommendations[0]?.action ?? "Nothing outstanding — the space is well set up.",
      meter: null,
      tone: analysis.hostRecommendations.length > 2 ? "attention" : "neutral",
    },
    {
      id: "occupancy",
      title: "Occupancy",
      value: `${occupancy}%`,
      detail: `${analysis.optimisation.remainingVolumeM3}m³ still available to let.`,
      meter: occupancy,
      tone: occupancy >= 60 ? "positive" : "neutral",
    },
    {
      id: "capacity_trend",
      title: "Capacity trend",
      value: `${analysis.optimisation.expansionVolumeM3}m³`,
      detail: "Extra volume the suggested improvements could unlock.",
      meter: Math.round(
        Math.min(100, (analysis.optimisation.expansionVolumeM3 / capacity) * 100),
      ),
      tone: analysis.optimisation.expansionVolumeM3 > 1 ? "attention" : "neutral",
    },
  ];
}
