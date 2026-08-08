/**
 * AI feature flags.
 *
 * Every capability can be switched on or off independently, so a rollout or a
 * rollback is a configuration change with no code or UI edit. A disabled
 * capability degrades gracefully — the orchestrator returns a structured
 * "unavailable" response rather than throwing.
 */
import type { AiCapability } from "./types";
import { AI_CAPABILITIES } from "./types";

export type AiFeatureFlags = Record<AiCapability, boolean> & {
  /** Master switch. Off means every capability is off. */
  aiEnabled: boolean;
  /** Allow remote providers. Off keeps everything on local engines. */
  remoteProviders: boolean;
  streaming: boolean;
  backgroundJobs: boolean;
  caching: boolean;
};

function defaults(): AiFeatureFlags {
  const base = {
    aiEnabled: true,
    remoteProviders: true,
    streaming: true,
    backgroundJobs: true,
    caching: true,
  } as AiFeatureFlags;
  for (const capability of AI_CAPABILITIES) base[capability] = true;
  return base;
}

let flags: AiFeatureFlags = defaults();

export function aiFlags(): AiFeatureFlags {
  return { ...flags };
}

export function setAiFlags(patch: Partial<AiFeatureFlags>): AiFeatureFlags {
  flags = { ...flags, ...patch };
  return aiFlags();
}

export function resetAiFlags(): void {
  flags = defaults();
}

export function isCapabilityEnabled(capability: AiCapability): boolean {
  return flags.aiEnabled && flags[capability] === true;
}

export function isFlagEnabled(flag: keyof AiFeatureFlags): boolean {
  if (flag === "aiEnabled") return flags.aiEnabled;
  return flags.aiEnabled && flags[flag] === true;
}
