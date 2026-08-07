/**
 * Mock pricing provider.
 *
 * Wraps the existing deterministic price guidance so hosts see one number
 * across the product, whichever intelligence provider is active. Guidance,
 * never a promise: the host always sets the final price.
 */
import { suggestPrice } from "@/lib/pricing/suggestion";

import type { PricingEstimate } from "../contracts";
import { IntelligenceError } from "../errors";
import { buildMeta, throwIfAborted } from "../meta";
import type { PricingProvider, ProviderRequest } from "../providers";

const IDENTITY = {
  id: "mock-pricing-v1",
  label: "Spacilo AI pricing guidance",
  model: "spacefit-price-v1",
  remote: false,
} as const;

export const mockPricingProvider: PricingProvider = {
  ...IDENTITY,
  capabilities: ["pricing"],

  async estimatePrice(input, request?: ProviderRequest): Promise<PricingEstimate> {
    const startedAt = Date.now();
    throwIfAborted(request?.signal);

    const suggestion = suggestPrice({
      spaceType: input.spaceType,
      usableVolumeM3: input.volumeM3,
      accessType: input.access ?? null,
    } as Parameters<typeof suggestPrice>[0]);

    if (suggestion.suggestedMonthlyPence === null) {
      throw new IntelligenceError("low_confidence", suggestion.notes[0]);
    }

    return {
      monthlyPence: suggestion.suggestedMonthlyPence,
      lowPence: suggestion.lowMonthlyPence ?? suggestion.suggestedMonthlyPence,
      highPence: suggestion.highMonthlyPence ?? suggestion.suggestedMonthlyPence,
      basis: [
        `Base rate ${suggestion.baseRatePencePerM3}p per m³ per month.`,
        ...suggestion.factors.map((factor) => `${factor.label}: ${factor.effect}.`),
      ],
      meta: buildMeta(IDENTITY, startedAt),
    };
  },
};
