import type { SpaceFitBand } from "@/types/models";

export interface SpaceFitPresentation {
  band: SpaceFitBand;
  label: string;
  description: string;
}

/**
 * SpaceFit is an estimated compatibility score based on declared belongings.
 * It is not a guarantee that items will physically fit.
 */
export function spaceFitBand(score: number): SpaceFitPresentation {
  if (score >= 90)
    return {
      band: "excellent",
      label: "Excellent match",
      description: "Excellent match for your belongings",
    };
  if (score >= 75)
    return {
      band: "good",
      label: "Good match",
      description: "Good match for your belongings",
    };
  if (score >= 60)
    return {
      band: "possible",
      label: "Possible match",
      description: "May work, but space could be tight",
    };
  return {
    band: "poor",
    label: "Poor match",
    description: "Unlikely to suit your belongings",
  };
}

export const SPACEFIT_DISCLAIMER =
  "Fit is an estimate based on the belongings you declare. It is a compatibility score, not a guarantee that everything will fit.";
