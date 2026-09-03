import { normalisePath, referrerHost } from "@/lib/analytics/events";
import type { ChannelId, GrowthLearningSignal } from "./types";

/** Bounded, privacy-conscious touch data for the internal growth engine. */
export type LandingAttribution = {
  idempotencyKey: string;
  landingPath: string;
  referrerHost: string | null;
  source: string | null;
  medium: string | null;
  campaign: string | null;
  issuedAt: number;
};

export type AttributionEvent = {
  /** Stable source event id, used only for deduplication. */
  eventId?: string;
  eventName: string;
  occurredAt: number;
  path?: string | null;
  props?: Readonly<Record<string, string | number | boolean | null>>;
  landing?: LandingAttribution | null;
  opportunityKey?: string | null;
  campaignId?: string | null;
};

export type GrowthAttributionRecord = {
  /** Stable database idempotency key; no identity is encoded in it. */
  idempotencyKey: string;
  attributionModel: "first_touch" | "campaign_touch" | "last_touch";
  opportunityKey: string | null;
  campaignId: string | null;
  eventName: string;
  destination: string | null;
  source: string | null;
  audience: string | null;
  geography: string | null;
  occurredAt: number;
  metadata: Record<string, string | number | boolean | null>;
};

const OUTCOME_BY_EVENT: Record<string, GrowthLearningSignal["outcome"]> = {
  cta_clicked: "clicked",
  signup_completed: "registered",
  storage_request_created: "converted",
  booking_created: "converted",
  booking_completed: "converted",
  host_listing_published: "converted",
};

function stableDigest(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function safeText(value: unknown): string | null {
  return typeof value === "string" && value.trim() && value.length <= 64 ? value.trim() : null;
}

/** Creates a repeat-safe first-touch identity without storing an address or URL query. */
export function landingAttribution(input: {
  path: string;
  referrer?: string | null;
  currentHost?: string;
  params?: Readonly<Record<string, string | null | undefined>>;
  now: number;
}): LandingAttribution {
  const path = normalisePath(input.path);
  const host = input.currentHost ?? "earnroom.co.uk";
  const source = safeText(input.params?.["utm_source"]);
  const medium = safeText(input.params?.["utm_medium"]);
  const campaign = safeText(input.params?.["utm_campaign"]);
  const sourceKey = [source, medium, campaign, path, referrerHost(input.referrer ?? "", host) ?? "direct"].join("|");
  return {
    idempotencyKey: `touch_${stableDigest(sourceKey)}`,
    landingPath: path,
    referrerHost: referrerHost(input.referrer ?? "", host),
    source,
    medium,
    campaign,
    issuedAt: input.now,
  };
}

/** Converts an approved analytics moment into a durable internal attribution record. */
export function attributionRecord(event: AttributionEvent): GrowthAttributionRecord | null {
  if (!event.eventName.trim()) return null;
  const landing = event.landing ?? null;
  const props = event.props ?? {};
  const audience = safeText(props["audience"] ?? props["role"] ?? props["segment"]);
  const geography = safeText(props["geography"] ?? props["location_slug"]);
  const destination = event.path ? normalisePath(event.path) : null;
  const metadata: Record<string, string | number | boolean | null> = {};
  for (const key of ["source", "medium", "campaign", "audience", "geography", "role", "segment", "capability", "status", "value_pence", "channel"]) {
    const value = props[key];
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) {
      const safe = typeof value === "string" ? safeText(value) : value;
      if (safe !== null) metadata[key] = safe;
    }
  }
  if (landing?.referrerHost) metadata["referrer_host"] = landing.referrerHost;
  if (landing?.landingPath) metadata["landing_path"] = landing.landingPath;
  const idempotencyKey = `attr_${stableDigest([
    event.eventId ?? "no-event-id",
    landing?.idempotencyKey ?? "direct",
    event.campaignId ?? "none",
    event.opportunityKey ?? "none",
    event.eventName,
    destination ?? "none",
    event.occurredAt,
  ].join("|"))}`;
  return {
    idempotencyKey,
    attributionModel: event.campaignId ? "campaign_touch" : "first_touch",
    opportunityKey: event.opportunityKey ?? null,
    campaignId: event.campaignId ?? null,
    eventName: event.eventName,
    destination,
    source: landing?.source ?? safeText(props["source"]),
    audience,
    geography,
    occurredAt: event.occurredAt,
    metadata,
  };
}

export function learningSignalFromAttribution(
  record: GrowthAttributionRecord,
): GrowthLearningSignal | null {
  const outcome = OUTCOME_BY_EVENT[record.eventName];
  if (!outcome || !record.opportunityKey) return null;
  const rawValue = record.metadata["value_pence"];
  const valuePence = typeof rawValue === "number" && Number.isInteger(rawValue) && rawValue >= 0 ? rawValue : undefined;
  const channel = record.campaignId ? (record.metadata["channel"] as ChannelId | undefined) ?? null : null;
  return {
    opportunityKey: record.opportunityKey,
    channel,
    outcome,
    ...(valuePence === undefined ? {} : { valuePence }),
    at: record.occurredAt,
  };
}

export function learningSignalFromDelivery(input: {
  opportunityKey: string;
  channel: ChannelId | null;
  outcome: GrowthLearningSignal["outcome"];
  at: number;
  valuePence?: number;
}): GrowthLearningSignal {
  return { ...input };
}
