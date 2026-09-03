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

/**
 * Whether a channel is genuinely entitled to transmit to a person right now.
 *
 * This is the real gate on autonomous outbound. The engine never asks a human
 * to approve an individual message; it asks this function whether the channel
 * itself is authorised — credentials present, terms reviewed, lawful basis
 * recorded. Anything less is BLOCKED automatically, with no exceptions.
 */
export function channelMayTransmit(id: ChannelId): boolean {
  const state = registry.get(id);
  if (!state) return false;
  return (
    channelUsable(id) &&
    state.deliveryMode === "live" &&
    state.credentialState === "verified" &&
    state.termsStatus === "authorised"
  );
}

/** Why a channel cannot transmit, in the founder's language. */
export function channelBlockReason(id: ChannelId): string | null {
  const state = registry.get(id);
  if (!state) return "No such channel is registered.";
  if (!state.enabled) return "Channel is disabled.";
  if (growthConfig().emergencyStop) return "Emergency stop is engaged.";
  if (growthConfig().pausedChannels.includes(id)) return "Channel is paused by the founder.";
  if (state.deliveryMode !== "live") return "No live delivery adapter is configured for this channel.";
  if (state.credentialState !== "verified") return "Channel credentials are not verified.";
  if (state.termsStatus !== "authorised") return "Channel terms and lawful basis are not authorised.";
  return null;
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
      // In-product only: it renders an EarnRoom journey to someone already in
      // EarnRoom, so it transmits nothing and needs no credentials.
      deliveryMode: "mock",
      credentialState: "not_required",
      termsStatus: "authorised",
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
      deliveryMode: "none",
      credentialState: "missing",
      termsStatus: "pending_review",
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
      deliveryMode: "none",
      credentialState: "missing",
      termsStatus: "pending_review",
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
      deliveryMode: "none",
      credentialState: "missing",
      termsStatus: "pending_review",
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
