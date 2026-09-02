/**
 * Mock booking provider.
 *
 * Turns a packed plan into the compatibility answer the booking flow needs:
 * will it fit, how tightly, and what to do about it. It reuses the same score
 * and recommendation engines the planner shows, so a renter never sees two
 * different answers to the same question.
 */
import type { CompatibilityResult, CompatibilityVerdict, PackingResult } from "../contracts";
import { buildMeta, throwIfAborted } from "../meta";
import type { BookingProvider, ProviderRequest } from "../providers";
import { mockRecommendationProvider } from "./recommendations";

const IDENTITY = {
  id: "mock-booking-v1",
  label: "EarnRoom AI booking intelligence",
  model: "spaceplanner-deterministic-v1",
  remote: false,
} as const;

export function verdictFor(result: PackingResult): CompatibilityVerdict {
  if (!result.plan.metrics.everythingFits) return "does_not_fit";
  return result.score.value >= 78 ? "fits" : "tight";
}

export const mockBookingProvider: BookingProvider = {
  ...IDENTITY,
  capabilities: ["booking", "recommendations"],

  async assessCompatibility(result, request?: ProviderRequest): Promise<CompatibilityResult> {
    const startedAt = Date.now();
    throwIfAborted(request?.signal);

    return {
      verdict: verdictFor(result),
      fitPercent: result.score.fitPercent,
      score: result.score,
      recommendations: await mockRecommendationProvider.recommend(result, request),
      meta: buildMeta(IDENTITY, startedAt),
    };
  },
};
