/**
 * Mock packing provider.
 *
 * Delegates to the existing deterministic SpacePlanner engine and its score.
 * Packing is arithmetic, not guesswork, so this provider stays exact even when
 * a real vision provider is plugged in above it.
 */
import { buildPlan } from "@/lib/spaceplanner";
import { scorePlan } from "@/lib/spaceplanner/score";

import type { PackingResult } from "../contracts";
import { buildMeta, throwIfAborted } from "../meta";
import type { PackingProvider, ProviderRequest } from "../providers";

const IDENTITY = {
  id: "mock-packing-v1",
  label: "Spacilo AI SpacePlanner",
  model: "spaceplanner-deterministic-v1",
  remote: false,
} as const;

export const mockPackingProvider: PackingProvider = {
  ...IDENTITY,
  capabilities: ["packing"],

  async pack(lines, space, request?: ProviderRequest): Promise<PackingResult> {
    const startedAt = Date.now();
    throwIfAborted(request?.signal);
    const plan = buildPlan(lines, space);
    const score = scorePlan(plan);
    return { plan, score, meta: buildMeta(IDENTITY, startedAt) };
  },
};
