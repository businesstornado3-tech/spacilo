/**
 * Matching a renter's belongings to real Spacilo listings.
 *
 * Ranking is deterministic and explainable: estimated fit first, then how much
 * would remain, then price and distance. The fit figure is always an estimate.
 */
import { buildPhotoPlan, type PhotoPlanResult } from "./plan";
import type { DetectedObject } from "@/lib/vision/types";

export interface MatchCandidate {
  id: string;
  title: string;
  /** Usable internal dimensions in metres, from the listing. */
  widthM: number;
  depthM: number;
  heightM: number;
  monthlyPence: number;
  distanceKm?: number;
  /** 0–100 marketplace trust/quality signal, when known. */
  trustScore?: number;
  available?: boolean;
}

export interface SpaceMatch {
  candidate: MatchCandidate;
  plan: PhotoPlanResult;
  fitPercent: number;
  remainingM3: number;
  score: number;
}

export function matchSpaces(
  objects: DetectedObject[],
  candidates: MatchCandidate[],
): SpaceMatch[] {
  const matches: SpaceMatch[] = [];

  for (const candidate of candidates) {
    if (candidate.available === false) continue;
    const plan = buildPhotoPlan(objects, {
      widthM: candidate.widthM,
      depthM: candidate.depthM,
      heightM: candidate.heightM,
      name: candidate.title,
      basis: "listing",
    });
    if (!plan) continue;

    const priceScore = Math.max(0, 20 - candidate.monthlyPence / 1500);
    const distanceScore = candidate.distanceKm === undefined ? 6 : Math.max(0, 12 - candidate.distanceKm);
    const trustScore = (candidate.trustScore ?? 60) / 10;
    const efficiency = Math.max(0, 12 - plan.spaceRemainingM3 * 2);

    matches.push({
      candidate,
      plan,
      fitPercent: plan.fitPercent,
      remainingM3: plan.spaceRemainingM3,
      score:
        plan.fitPercent * 1.4 + priceScore + distanceScore + trustScore + efficiency,
    });
  }

  return matches.sort((a, b) => b.score - a.score);
}
