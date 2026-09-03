/**
 * Phase 11 — source connector registry and permission framework.
 *
 * A connector states what it is *permitted* to do; the engine never exceeds
 * that. No connector here logs into a third-party platform, impersonates a
 * human, or stores personal platform credentials to bypass a restriction. A
 * platform that offers no authorised automation route is registered honestly
 * as BLOCKED and simply contributes nothing until that changes.
 */
import { growthConfig } from "./config";
import type { ConnectorCapabilityLevel, ConnectorState } from "./types";

function connector(partial: Partial<ConnectorState> & Pick<ConnectorState, "id" | "name" | "kind" | "flag">): ConnectorState {
  return {
    enabled: false,
    connected: false,
    permissions: { read: false, search: false, message: false, campaign: false, termsStatus: "unknown" },
    level: "BLOCKED",
    lastSyncAt: null,
    lastError: null,
    rateLimit: { perHour: 60, usedThisHour: 0 },
    retentionDays: growthConfig().defaultRetentionDays,
    notes: "",
    ...partial,
  };
}

/**
 * The shipped registry. Only the first-party connector is authorised, because
 * it is EarnRoom's own data and EarnRoom's own audience.
 */
export function defaultConnectors(): ConnectorState[] {
  return [
    connector({
      id: "first_party",
      name: "EarnRoom first-party signals",
      kind: "first_party",
      flag: "CONNECTOR_FIRST_PARTY_ENABLED",
      enabled: true,
      connected: true,
      permissions: { read: true, search: true, message: true, campaign: true, termsStatus: "authorised" },
      level: "DISCOVER_ANALYSE_AND_CAMPAIGN",
      rateLimit: { perHour: 5000, usedThisHour: 0 },
      notes: "Searches, tool usage, requests and journey events generated inside EarnRoom.",
    }),
    connector({
      id: "partner_feed",
      name: "Partner feed",
      kind: "partner_feed",
      flag: "CONNECTOR_PARTNER_FEED_ENABLED",
      notes: "Enabled per partner agreement. No feed is configured.",
    }),
    connector({
      id: "public_web_signal",
      name: "Permitted public web signal",
      kind: "rss",
      flag: "CONNECTOR_PUBLIC_WEB_ENABLED",
      permissions: { read: true, search: false, message: false, campaign: false, termsStatus: "pending_review" },
      level: "DISCOVER_ONLY",
      notes: "Founder-supplied feeds or URLs only. Discovery and analysis, never outreach.",
    }),
    connector({
      id: "search_trend",
      name: "Search / trend source",
      kind: "search_trend",
      flag: "CONNECTOR_SEARCH_TREND_ENABLED",
      permissions: { read: true, search: true, message: false, campaign: false, termsStatus: "pending_review" },
      level: "DISCOVER_AND_ANALYSE",
      notes: "Requires a licensed API before it can be enabled. Never used for outreach.",
    }),
    connector({
      id: "gumtree",
      name: "Gumtree",
      kind: "marketplace",
      flag: "CONNECTOR_GUMTREE_ENABLED",
      permissions: { read: false, search: false, message: false, campaign: false, termsStatus: "not_authorised" },
      level: "BLOCKED",
      notes:
        "No authorised API or automated messaging route is configured. Automation is not attempted and no personal login is used.",
    }),
    connector({
      id: "facebook_marketplace",
      name: "Facebook Marketplace",
      kind: "social",
      flag: "CONNECTOR_FACEBOOK_ENABLED",
      permissions: { read: false, search: false, message: false, campaign: false, termsStatus: "not_authorised" },
      level: "BLOCKED",
      notes:
        "No authorised API or automated messaging route is configured. Automation is not attempted and no personal login is used.",
    }),
  ];
}

let registry = new Map<string, ConnectorState>(defaultConnectors().map((c) => [c.id, c]));

export function listConnectors(): ConnectorState[] {
  return [...registry.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function getConnector(id: string): ConnectorState | null {
  return registry.get(id) ?? null;
}

export function registerConnector(state: ConnectorState): ConnectorState {
  registry.set(state.id, state);
  return state;
}

export function updateConnector(id: string, patch: Partial<ConnectorState>): ConnectorState | null {
  const current = registry.get(id);
  if (!current) return null;
  const next: ConnectorState = {
    ...current,
    ...patch,
    permissions: { ...current.permissions, ...(patch.permissions ?? {}) },
    rateLimit: { ...current.rateLimit, ...(patch.rateLimit ?? {}) },
  };
  // A connector can never advertise more than its permissions support.
  next.level = deriveLevel(next);
  registry.set(id, next);
  return next;
}

export function resetConnectors(): void {
  registry = new Map(defaultConnectors().map((c) => [c.id, c]));
}

/** Permissions are the source of truth; the level is derived from them. */
export function deriveLevel(state: ConnectorState): ConnectorCapabilityLevel {
  const p = state.permissions;
  if (!state.enabled || !p.read || p.termsStatus === "not_authorised") return "BLOCKED";
  if (p.campaign && p.message && p.termsStatus === "authorised") return "DISCOVER_ANALYSE_AND_CAMPAIGN";
  if (p.search || p.read) return p.read && state.connected ? "DISCOVER_AND_ANALYSE" : "DISCOVER_ONLY";
  return "BLOCKED";
}

/** Effective level, after founder pauses and the global emergency stop. */
export function effectiveLevel(id: string): ConnectorCapabilityLevel {
  const state = registry.get(id);
  if (!state) return "BLOCKED";
  const config = growthConfig();
  if (config.pausedConnectors.includes(id)) return "BLOCKED";
  if (!state.enabled) return "BLOCKED";
  const level = state.level;
  if (config.emergencyStop && level === "DISCOVER_ANALYSE_AND_CAMPAIGN") return "DISCOVER_AND_ANALYSE";
  return level;
}

export function mayAnalyse(id: string): boolean {
  const level = effectiveLevel(id);
  return level === "DISCOVER_AND_ANALYSE" || level === "DISCOVER_ANALYSE_AND_CAMPAIGN";
}

export function mayCampaign(id: string): boolean {
  return effectiveLevel(id) === "DISCOVER_ANALYSE_AND_CAMPAIGN";
}

export function recordSync(id: string, at: number, error?: string): void {
  const state = registry.get(id);
  if (!state) return;
  registry.set(id, {
    ...state,
    lastSyncAt: error ? state.lastSyncAt : at,
    lastError: error ?? null,
  });
}
