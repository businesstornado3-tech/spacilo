/**
 * Token and cost estimation.
 *
 * Local engines report no usage, so the platform estimates it consistently.
 * That keeps metrics comparable when a remote provider is swapped in later.
 */
import { aiConfig } from "./config";
import type { AiUsage } from "./types";

const CHARS_PER_TOKEN = 4;

export function estimateTokens(input: unknown): number {
  if (input === null || input === undefined) return 0;
  const text = typeof input === "string" ? input : safeStringify(input);
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function costPence(model: string, totalTokens: number): number {
  const table = aiConfig().cost.pencePerThousandTokens;
  const rate = table[model] ?? table["default"] ?? 0;
  return (totalTokens / 1000) * rate;
}

export function buildUsage(
  model: string,
  parts: { promptTokens?: number; completionTokens?: number } = {},
): AiUsage {
  const promptTokens = Math.max(0, Math.round(parts.promptTokens ?? 0));
  const completionTokens = Math.max(0, Math.round(parts.completionTokens ?? 0));
  const totalTokens = promptTokens + completionTokens;
  return {
    promptTokens,
    completionTokens,
    totalTokens,
    estimatedCostPence: costPence(model, totalTokens),
  };
}

export const EMPTY_USAGE: AiUsage = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  estimatedCostPence: 0,
};

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return String(value);
  }
}
