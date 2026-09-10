/**
 * Acquisition channel diagnostic — the single honest answer to "is this
 * channel really able to reach anyone?".
 *
 * Pure and deterministic. It is handed facts that were read from the database
 * or from server-side configuration and returns one status per channel. It
 * never infers a connection, never upgrades a state and can only report LIVE
 * when a real credential, a real destination and a real permission all exist.
 */
import type { ConnectionState, PlatformId, PublicationState } from "./types";

export const ACQUISITION_STATUSES = [
  "LIVE",
  "MOCK",
  "NOT_CONNECTED",
  "AUTH_REQUIRED",
  "PLATFORM_APPROVAL_REQUIRED",
  "CONFIGURATION_REQUIRED",
  "BLOCKED_BY_POLICY",
  "FAILED",
] as const;

export type AcquisitionStatus = (typeof ACQUISITION_STATUSES)[number];

export type ChannelDiagnostic = {
  key: string;
  label: string;
  kind: "social" | "outreach";
  status: AcquisitionStatus;
  /** Founder-facing explanation. Never a stack trace, never a secret. */
  detail: string;
  /** True only when this channel can genuinely deliver to a real destination. */
  live: boolean;
};

export type SocialChannelSignals = {
  platform: PlatformId;
  label: string;
  /** Application credentials exist server-side (names only are ever known). */
  credentialsConfigured: boolean;
  connection: ConnectionState;
  /** A stored, unexpired authorisation token exists server-side. */
  hasStoredToken: boolean;
  /** A destination channel, page, board or account has been selected. */
  hasDestinationAccount: boolean;
  paused: boolean;
  /** Whether the official API permits unattended public publishing today. */
  publicPublishingApproved: boolean;
  approvalNote: string | null;
  lastError: string | null;
  lastPublicationState: PublicationState | null;
};

const FAILED_STATES: readonly PublicationState[] = [
  "UPLOAD_FAILED",
  "PLATFORM_REJECTED",
  "VALIDATION_FAILED",
];

export function socialChannelStatus(signals: SocialChannelSignals): ChannelDiagnostic {
  const base = { key: signals.platform, label: signals.label, kind: "social" as const };
  const out = (status: AcquisitionStatus, detail: string): ChannelDiagnostic => ({
    ...base,
    status,
    detail,
    live: status === "LIVE",
  });

  if (signals.paused) {
    return out("BLOCKED_BY_POLICY", "Publishing is paused for this platform.");
  }
  if (!signals.credentialsConfigured) {
    return out(
      "CONFIGURATION_REQUIRED",
      "The application credentials for this platform have not been set up yet.",
    );
  }
  if (signals.connection === "NOT_CONNECTED" || signals.connection === "REQUIRES_CONFIGURATION") {
    return out("NOT_CONNECTED", "No account has been connected on this platform yet.");
  }
  if (signals.connection === "AUTH_EXPIRED" || !signals.hasStoredToken) {
    return out("AUTH_REQUIRED", "The stored authorisation is missing or expired — reconnect it.");
  }
  if (signals.connection === "INSUFFICIENT_PERMISSIONS") {
    return out("AUTH_REQUIRED", "The connected account has not granted the permissions needed.");
  }
  if (!signals.hasDestinationAccount) {
    return out(
      "CONFIGURATION_REQUIRED",
      "Connected, but no destination channel, page or board has been chosen.",
    );
  }
  if (!signals.publicPublishingApproved) {
    return out(
      "PLATFORM_APPROVAL_REQUIRED",
      signals.approvalNote ?? "The platform has not approved this app for public publishing.",
    );
  }
  if (signals.lastPublicationState && FAILED_STATES.includes(signals.lastPublicationState)) {
    return out("FAILED", signals.lastError ?? "The last publication attempt did not succeed.");
  }
  return out("LIVE", "Connected and authorised — publishing goes to the real platform.");
}

export type OutreachChannelSignals = {
  channel: string;
  label: string;
  enabled: boolean;
  paused: boolean;
  emergencyStop: boolean;
  /** "live" transmits to a person; "mock" contacts nobody; "none" is unbuilt. */
  deliveryMode: "live" | "mock" | "none";
  credentialState: "verified" | "missing" | "not_required" | string;
  termsStatus: "authorised" | "pending_review" | string;
  /** Whether a genuinely transmitting adapter is registered for the channel. */
  adapterTransmits: boolean;
  /**
   * The precise missing dependency, in the founder's language, when this
   * channel has no provider configured at all. Reported ahead of "switched
   * off", because switching it on would not make it able to deliver.
   */
  setupNote?: string | null;
  lastError?: string | null;
};

export function outreachChannelStatus(signals: OutreachChannelSignals): ChannelDiagnostic {
  const base = { key: signals.channel, label: signals.label, kind: "outreach" as const };
  const out = (status: AcquisitionStatus, detail: string): ChannelDiagnostic => ({
    ...base,
    status,
    detail,
    live: status === "LIVE",
  });

  if (signals.emergencyStop) return out("BLOCKED_BY_POLICY", "Emergency stop is engaged.");
  // A channel with no delivery route and no credentials is not "switched off"
  // by choice — it is not built or not configured, and saying so is the only
  // honest answer. Turning it on would change nothing.
  if (signals.deliveryMode === "none") {
    return out(
      "CONFIGURATION_REQUIRED",
      signals.setupNote ?? "Setup required — no provider is configured for this channel.",
    );
  }
  if (signals.deliveryMode === "live" && signals.credentialState !== "verified") {
    return out(
      "CONFIGURATION_REQUIRED",
      signals.setupNote ?? "Setup required — provider credentials are not configured.",
    );
  }
  if (!signals.enabled) return out("BLOCKED_BY_POLICY", "This channel is switched off.");
  if (signals.paused) return out("BLOCKED_BY_POLICY", "This channel is paused.");
  if (signals.termsStatus !== "authorised") {
    return out("PLATFORM_APPROVAL_REQUIRED", "Terms and lawful basis have not been signed off.");
  }
  if (signals.deliveryMode === "mock" || !signals.adapterTransmits) {
    return out("MOCK", signals.setupNote ?? "Practice only — this reaches nobody outside EarnRoom.");
  }
  if (signals.lastError) return out("FAILED", signals.lastError);
  return out("LIVE", "Authorised to deliver to real people.");
}

/** Real, persisted evidence for each funnel stage. Nothing here is inferred. */
export type FunnelEvidence = {
  opportunities: number;
  interpreted: number;
  campaigns: number;
  contentGenerated: number;
  validated: number;
  eligibleForDelivery: number;
  realDeliveries: number;
  referredVisits: number;
  registrations: number;
  bookings: number;
  completedBookings: number;
};

export type FunnelStage = { key: string; label: string; count: number; proven: boolean };

export function funnelStages(evidence: FunnelEvidence): FunnelStage[] {
  const stage = (key: string, label: string, count: number): FunnelStage => ({
    key,
    label,
    count,
    proven: count > 0,
  });
  return [
    stage("opportunity", "Opportunity", evidence.opportunities),
    stage("interpretation", "AI interpretation", evidence.interpreted),
    stage("campaign", "Campaign", evidence.campaigns),
    stage("content", "Content", evidence.contentGenerated),
    stage("validation", "Validation", evidence.validated),
    stage("eligible", "Eligible for delivery", evidence.eligibleForDelivery),
    stage("delivery", "Real delivery", evidence.realDeliveries),
    stage("visit", "Real visitor", evidence.referredVisits),
    stage("registration", "Registration", evidence.registrations),
    stage("booking", "Booking", evidence.bookings),
    stage("conversion", "Completed booking", evidence.completedBookings),
  ];
}

export function acquisitionTotals(channels: readonly ChannelDiagnostic[]): {
  live: number;
  mock: number;
  notConnected: number;
  authRequired: number;
  approvalRequired: number;
  configurationRequired: number;
  blocked: number;
  failed: number;
} {
  const count = (status: AcquisitionStatus) =>
    channels.filter((channel) => channel.status === status).length;
  return {
    live: count("LIVE"),
    mock: count("MOCK"),
    notConnected: count("NOT_CONNECTED"),
    authRequired: count("AUTH_REQUIRED"),
    approvalRequired: count("PLATFORM_APPROVAL_REQUIRED"),
    configurationRequired: count("CONFIGURATION_REQUIRED"),
    blocked: count("BLOCKED_BY_POLICY"),
    failed: count("FAILED"),
  };
}

/**
 * A publication may only be described as published when the platform itself
 * returned an identifier. An accepted HTTP request is not a publication.
 */
export function isConfirmedPublication(record: {
  state: PublicationState;
  platformPostId: string | null;
}): boolean {
  return record.state === "PUBLISHED" && Boolean(record.platformPostId);
}
