/**
 * Host suitability provenance.
 *
 * EarnRoom AI can observe things about a space — "looks like a garage",
 * "no visible window". Those observations are proposals. They are stored
 * separately from the host's answers and only become part of the profile
 * when the host confirms or corrects them. A proposal never becomes
 * canonical on its own, and a rejected proposal never reappears as fact.
 */
import type { SuitabilityAttributes } from "@/lib/policy/types";
import { sanitiseSuitability } from "@/lib/policy/suitability";

export type ObservationState = "ai_proposed" | "host_confirmed" | "host_corrected" | "host_rejected";

export interface SpaceObservation {
  observation_key: string;
  observation: string;
  confidence: number | null;
  verification_state: ObservationState;
}

/** Only host-settled observations may touch the profile. */
export function isCanonical(observation: SpaceObservation): boolean {
  return (
    observation.verification_state === "host_confirmed" ||
    observation.verification_state === "host_corrected"
  );
}

/**
 * Merge settled observations into the host's answers. Proposals and
 * rejections are ignored, and existing host answers are never overwritten
 * by anything the AI suggested.
 */
export function applyObservations(
  attributes: SuitabilityAttributes,
  observations: SpaceObservation[],
): SuitabilityAttributes {
  const next: SuitabilityAttributes = { ...attributes };
  for (const observation of observations) {
    if (!isCanonical(observation)) continue;
    next[observation.observation_key] = observation.observation;
  }
  return sanitiseSuitability(next);
}

/** What the host still has to look at before their answers are complete. */
export function pendingProposals(observations: SpaceObservation[]): SpaceObservation[] {
  return observations.filter((observation) => observation.verification_state === "ai_proposed");
}

/** AI confidence is internal — renters never see a number they can't judge. */
export function publicObservationView(observation: SpaceObservation): {
  observation_key: string;
  observation: string;
  verification_state: ObservationState;
} {
  return {
    observation_key: observation.observation_key,
    observation: observation.observation,
    verification_state: observation.verification_state,
  };
}
