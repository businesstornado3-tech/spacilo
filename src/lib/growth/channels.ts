/**
 * Phase 11 Stage 5 — outbound channel registry.
 *
 * A channel is a *route to a person*, and every route here is one EarnRoom is
 * genuinely entitled to use. There is no scraping route, no platform login, no
 * impersonation and no "unofficial" messaging path: a channel that has not been
 * configured with real credentials and a lawful basis is simply disabled, and
 * the engine treats disabled as "cannot contact anyone".
 */
import { growthConfig } from "./config";
import type { ChannelId, ChannelState, ConsentState } from "./types";

function channel(state: ChannelState): ChannelState {
  return state;
}

export function defaultChannels(): ChannelState[] {
  return [
    channel({
      id: "earnroom_internal",
      label: "In-product surface",
      // Always available: it shows an existing EarnRoom journey to someone
      // already using EarnRoom. It contacts nobody.
      enabled: true,
      requiresConsent: false,
      acceptsLegitimateInterest: true,
      perRecipientPerDay: 1,
      cooldownHours: 24,
      requiresSenderIdentity: false,
    }),
    channel({
      id: "email",
      label: "Email",
      enabled: false,
      requiresConsent: true,
      acceptsLegitimateInterest: true,
      perRecipientPerDay: 1,
      cooldownHours: 168,
      requiresSenderIdentity: true,
    }),
    channel({
      id: "sms",
      label: "SMS",
      enabled: false,
      requiresConsent: true,
      acceptsLegitimateInterest: false,
      perRecipientPerDay: 1,
      cooldownHours: 336,
      requiresSenderIdentity: true,
    }),
    channel({
      id: "platform_message",
      label: "Authorised platform message",
      enabled: false,
      requiresConsent: true,
      acceptsLegitimateInterest: false,
      perRecipientPerDay: 1,
      cooldownHours: 336,
      requiresSenderIdentity: true,
    }),
  ];
}

let registry = new Map<ChannelId, ChannelState>(defaultChannels().map((c) => [c.id, c]));

export function listChannels(): ChannelState[] {
  return [...registry.values()];
}

export function getChannel(id: ChannelId): ChannelState | null {
  return registry.get(id) ?? null;
}

export function registerChannel(state: ChannelState): ChannelState {
  registry.set(state.id, state);
  return state;
}

export function resetChannels(): void {
  registry = new Map(defaultChannels().map((c) => [c.id, c]));
}

/** A channel is usable only when enabled, unpaused and not emergency-stopped. */
export function channelUsable(id: ChannelId): boolean {
  const state = registry.get(id);
  if (!state || !state.enabled) return false;
  const config = growthConfig();
  if (config.emergencyStop) return false;
  return !config.pausedChannels.includes(id);
}

/** Whether a given consent state satisfies the channel's legal basis. */
export function consentSatisfied(id: ChannelId, consent: ConsentState): boolean {
  const state = registry.get(id);
  if (!state) return false;
  if (consent === "withdrawn") return false;
  if (consent === "none") return !state.requiresConsent;
  if (consent === "granted") return true;
  if (consent === "legitimate_interest") return state.acceptsLegitimateInterest;
  return !state.requiresConsent;
}
