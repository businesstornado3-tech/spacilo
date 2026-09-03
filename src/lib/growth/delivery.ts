/**
 * Phase 11 Stage 6 — campaign execution adapters.
 *
 * This is the only place in EarnRoom that could ever transmit an outbound
 * growth message, and by default nothing here transmits anything. Every
 * shipped adapter is a *mock*: it proves the execution path, the send lock,
 * the attempt record and the idempotency boundary work, while `transmits`
 * stays false so no person is contacted.
 *
 * A real adapter may only be registered once a channel has authorised
 * credentials, a lawful basis and a terms review. Until then the engine
 * behaves exactly as if the channel does not exist.
 */
import { campaignExpired, mayRetry } from "./campaign";
import { channelMayTransmit, channelUsable } from "./channels";
import { outboundHalted } from "./config";
import type { AuditEvent, Campaign, ChannelId, GrowthLearningSignal } from "./types";

export type DeliveryStatus = "sent" | "skipped" | "failed" | "blocked";

export type DeliveryOutcome = {
  status: DeliveryStatus;
  /** Provider-side id when a real adapter transmitted; null for mocks. */
  providerReference: string | null;
  detail: string;
};

export type DeliveryRequest = {
  campaign: Campaign;
  /** Hashed recipient reference. No address ever reaches this module. */
  recipient: string | null;
  now: number;
};

export type DeliveryAdapter = {
  channel: ChannelId;
  /** "mock" never reaches a person; "live" requires authorised credentials. */
  mode: "mock" | "live";
  /** Whether this adapter actually transmits to a human being. */
  transmits: boolean;
  send: (request: DeliveryRequest) => Promise<DeliveryOutcome>;
};

/** A mock adapter: full execution path, guaranteed to contact nobody. */
export function mockAdapter(channel: ChannelId): DeliveryAdapter {
  return {
    channel,
    mode: "mock",
    transmits: false,
    send: async ({ campaign }) => ({
      status: "sent",
      providerReference: null,
      detail: `mock:${channel}:${campaign.idempotencyKey}`,
    }),
  };
}

export function defaultAdapters(): DeliveryAdapter[] {
  return [
    mockAdapter("earnroom_internal"),
    mockAdapter("email"),
    mockAdapter("sms"),
    mockAdapter("platform_message"),
  ];
}

let adapters = new Map<ChannelId, DeliveryAdapter>(defaultAdapters().map((a) => [a.channel, a]));

export function listAdapters(): DeliveryAdapter[] {
  return [...adapters.values()];
}

export function getAdapter(channel: ChannelId): DeliveryAdapter | null {
  return adapters.get(channel) ?? null;
}

export function registerAdapter(adapter: DeliveryAdapter): DeliveryAdapter {
  adapters.set(adapter.channel, adapter);
  return adapter;
}

export function resetAdapters(): void {
  adapters = new Map(defaultAdapters().map((a) => [a.channel, a]));
}

/** True only when a genuinely transmitting adapter is configured and allowed. */
export function realOutboundAvailable(channel: ChannelId): boolean {
  const adapter = adapters.get(channel);
  return Boolean(adapter?.transmits) && channelMayTransmit(channel) && !outboundHalted();
}

export type ExecutionContext = {
  /** Attempts already recorded against this campaign. */
  attempts: number;
  /** Hashed recipient reference, if any. */
  recipient: string | null;
  /**
   * True when this worker holds the exclusive send lock for the idempotency
   * key. Without it, execution refuses to run — two workers can never send.
   */
  holdsLock: boolean;
  now: number;
};

export type ExecutionResult = {
  executed: boolean;
  outcome: DeliveryOutcome;
  /** State the campaign should be persisted with after this attempt. */
  state: Campaign["state"];
  attemptNumber: number;
  audit: AuditEvent[];
  learning: GrowthLearningSignal[];
};

function audit(
  campaign: Campaign,
  action: AuditEvent["action"],
  reason: string,
  now: number,
  detail?: Record<string, string | number | boolean | null>,
): AuditEvent {
  return {
    id: `${campaign.idempotencyKey}:${action}:${now}`,
    at: now,
    actor: "system",
    action,
    reason,
    source: "growth.delivery",
    referenceId: campaign.idempotencyKey,
    ...(detail ? { detail } : {}),
  };
}

function refuse(
  campaign: Campaign,
  reason: string,
  now: number,
  state: Campaign["state"],
  status: DeliveryStatus,
  attemptNumber: number,
): ExecutionResult {
  return {
    executed: false,
    outcome: { status, providerReference: null, detail: reason },
    state,
    attemptNumber,
    audit: [audit(campaign, "action_blocked", reason, now)],
    learning:
      status === "blocked"
        ? [{ opportunityKey: campaign.opportunityKey, channel: campaign.channel, outcome: "blocked", at: now }]
        : [],
  };
}

/**
 * Executes one campaign attempt. Fails closed at every step: a missing lock,
 * a halted system, an unusable channel, an expired campaign or an exhausted
 * retry budget all refuse before the adapter is ever called.
 */
export async function executeCampaign(
  campaign: Campaign,
  context: ExecutionContext,
): Promise<ExecutionResult> {
  const { now, attempts } = context;
  const attemptNumber = attempts + 1;

  if (campaign.state === "SENT" || campaign.sentAt !== null) {
    return refuse(campaign, "Already sent; idempotency key is spent.", now, "SENT", "skipped", attemptNumber);
  }
  if (campaign.state === "BLOCKED" || campaign.policy.verdict === "BLOCK") {
    return refuse(campaign, "Policy blocked this campaign.", now, "BLOCKED", "blocked", attemptNumber);
  }
  if (!context.holdsLock) {
    return refuse(campaign, "Send lock not held by this worker.", now, campaign.state, "skipped", attemptNumber);
  }
  if (campaign.state !== "QUEUED") {
    return refuse(campaign, `Campaign is ${campaign.state}, not QUEUED.`, now, campaign.state, "skipped", attemptNumber);
  }
  if (campaignExpired(campaign, now)) {
    return refuse(campaign, "Campaign expired before it could be sent.", now, "EXPIRED", "skipped", attemptNumber);
  }
  if (!mayRetry(attempts, now, campaign)) {
    return refuse(campaign, "Attempt budget exhausted.", now, "EXPIRED", "failed", attemptNumber);
  }
  if (!campaign.channel || !channelUsable(campaign.channel)) {
    return refuse(campaign, "Channel is disabled or not usable.", now, campaign.state, "skipped", attemptNumber);
  }
  if (!context.recipient) {
    return refuse(campaign, "A hashed recipient reference is required.", now, campaign.state, "skipped", attempts);
  }
  if (!campaign.message) {
    return refuse(campaign, "No message was generated.", now, campaign.state, "skipped", attempts);
  }

  const adapter = adapters.get(campaign.channel);
  if (!adapter) {
    return refuse(campaign, "No delivery adapter registered for the channel.", now, campaign.state, "skipped", attempts);
  }
  // Mock execution is intentionally available for internal verification. A
  // transmitting adapter must pass the global switch before it is called.
  if (adapter.transmits && outboundHalted()) {
    return refuse(campaign, "Autonomous sending is disabled or emergency-stopped.", now, campaign.state, "skipped", attempts);
  }
  // A transmitting adapter may only run on a channel that is genuinely
  // authorised to reach people. Anything else is blocked automatically.
  if (adapter.transmits && !channelMayTransmit(campaign.channel)) {
    return refuse(
      campaign,
      "Channel is not authorised to transmit; the send was blocked automatically.",
      now,
      "BLOCKED",
      "blocked",
      attempts,
    );
  }

  let outcome: DeliveryOutcome;
  try {
    outcome = await adapter.send({ campaign, recipient: context.recipient, now });
  } catch (error) {
    outcome = {
      status: "failed",
      providerReference: null,
      detail: error instanceof Error ? error.message : "Unknown delivery error.",
    };
  }

  const sent = outcome.status === "sent";
  return {
    executed: sent,
    outcome,
    state: sent ? "SENT" : attemptNumber >= 2 ? "EXPIRED" : "QUEUED",
    attemptNumber,
    audit: [
      audit(
        campaign,
        sent ? "campaign_sent" : "error",
        sent
          ? `Delivered via ${adapter.mode} ${adapter.channel} adapter.`
          : `Delivery attempt ${attemptNumber} failed: ${outcome.detail}`,
        now,
        { adapter_mode: adapter.mode, transmitted: adapter.transmits, attempt: attemptNumber },
      ),
    ],
    learning: sent
      ? [{ opportunityKey: campaign.opportunityKey, channel: campaign.channel, outcome: "sent", at: now }]
      : [],
  };
}
