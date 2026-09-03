/**
 * Phase 11 Stage 6 — campaign generation and lifecycle.
 *
 * A campaign is only ever built from what the engine actually observed. Every
 * sentence in a message is paired with the evidence behind it, and the message
 * may not claim a space is available unless real published supply says so — a
 * person with nothing to offer them is told the truth instead.
 *
 * Sending itself is deliberately not implemented here: the send lock,
 * idempotency key and attempt record exist so that when an authorised channel
 * is finally configured, a retry can never produce a second message.
 */
import { growthConfig } from "./config";
import type {
  Campaign,
  CampaignDecision,
  CampaignMessage,
  CampaignState,
  ChannelId,
  GrowthOpportunity,
  PolicyDecision,
  SupplyContext,
} from "./types";

/** Small, stable, non-cryptographic digest — used for keys, never for secrets. */
export function digest(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** A recipient is referenced by hash only; no address is stored on the record. */
export function recipientHash(channel: ChannelId, address: string): string {
  return `rcp_${digest(`${channel}:${address.trim().toLowerCase()}`)}`;
}

/**
 * The uniqueness boundary for a send. The same need, to the same person, on
 * the same channel, in the same cooldown window is one campaign — forever.
 */
export function campaignFingerprint(parts: {
  opportunityKey: string;
  channel: ChannelId;
  recipient: string;
  windowStart: number;
}): string {
  return `cmp_${digest(`${parts.opportunityKey}|${parts.channel}|${parts.recipient}|${parts.windowStart}`)}`;
}

/** Start of the current cooldown window, so a fingerprint is stable within it. */
export function cooldownWindowStart(now: number, cooldownHours: number): number {
  const span = Math.max(1, cooldownHours) * 3600_000;
  return Math.floor(now / span) * span;
}

const STYLE_OPENING: Record<string, string> = {
  transition: "You may need somewhere for your things while things are in between.",
  host_acquisition: "Space you are not using could be earning instead.",
  business: "When stock outgrows the unit, extra space should not mean a long lease.",
  student: "Between terms, your things still need somewhere to go.",
  capture: "Tell us what you need to store and where.",
  neutral: "EarnRoom helps with space.",
};

/**
 * Builds an evidence-grounded message. It states only what the engine can
 * support, and it is explicit when there is no supply yet in that area.
 */
export function buildMessage(opportunity: GrowthOpportunity, supply: SupplyContext): CampaignMessage {
  const style =
    opportunity.audience.primary === "HOST"
      ? "host_acquisition"
      : opportunity.audience.primary === "BUSINESS"
        ? "business"
        : opportunity.audience.primary === "STUDENT"
          ? "student"
          : opportunity.audience.primary === "MOVING_TRANSITION" || opportunity.audience.primary === "PROPERTY_RELATED"
            ? "transition"
            : supply.mayClaimAvailability
              ? "neutral"
              : "capture";

  const place = opportunity.situation.location.label;
  const claims: { claim: string; evidence: string }[] = [];
  const lines: string[] = [STYLE_OPENING[style] ?? STYLE_OPENING["neutral"]!];

  for (const item of opportunity.evidence.slice(0, 3)) {
    claims.push({ claim: `Observed ${item.field}.`, evidence: item.quote });
  }

  if (supply.mayClaimAvailability && supply.publishedSpaces > 0) {
    const where = place ? ` in ${place}` : "";
    lines.push(`There ${supply.publishedSpaces === 1 ? "is" : "are"} ${supply.publishedSpaces} space${supply.publishedSpaces === 1 ? "" : "s"} listed${where} right now.`);
    claims.push({
      claim: `${supply.publishedSpaces} published space(s)${where}.`,
      evidence: `published_spaces=${supply.publishedSpaces}`,
    });
  } else if (opportunity.audience.primary === "HOST") {
    lines.push("You can list a garage, loft, spare room or driveway and see what it could earn before committing.");
    claims.push({ claim: "Listing is free to start.", evidence: "existing_product_behaviour" });
  } else {
    const where = place ? ` in ${place}` : " in your area";
    lines.push(`We do not have space listed${where} yet, so we cannot promise availability.`);
    lines.push("Tell us what you need and we will let you know the moment a suitable space is listed.");
    claims.push({ claim: "No availability is claimed.", evidence: `published_spaces=${supply.publishedSpaces}` });
  }

  const cta = opportunity.fit.destination
    ? { label: opportunity.fit.destination.label, to: opportunity.fit.destination.to }
    : null;

  return {
    subject: place ? `Space in ${place}` : "Space that works for you",
    body: lines.join(" "),
    cta,
    claims,
    style,
    tone: "plain",
  };
}

export type CampaignInput = {
  opportunity: GrowthOpportunity;
  supply: SupplyContext;
  decision: CampaignDecision;
  policy: PolicyDecision;
  channel: ChannelId | null;
  /** Hashed recipient reference, or null when nobody is contactable. */
  recipient: string | null;
  now: number;
};

/**
 * Produces the campaign record. State is derived from the policy verdict, so a
 * blocked or deferred campaign can exist as an auditable decision without ever
 * being queued for delivery.
 */
export function buildCampaign(input: CampaignInput): Campaign {
  const config = growthConfig();
  const { opportunity, decision, policy, channel, recipient, now } = input;
  const windowStart = cooldownWindowStart(now, config.limits.campaignCooldownHours);
  const fingerprint =
    channel && recipient
      ? campaignFingerprint({ opportunityKey: opportunity.key, channel, recipient, windowStart })
      : `cmp_${digest(`${opportunity.key}|internal|${windowStart}`)}`;

  const state: CampaignState =
    policy.verdict === "BLOCK"
      ? "BLOCKED"
      : policy.verdict === "ALLOW" && decision.value === "CAMPAIGN_NOW"
        ? "QUEUED"
        : decision.value === "CAMPAIGN_LATER"
          ? "READY"
          : "QUALIFIED";

  return {
    id: fingerprint,
    opportunityKey: opportunity.key,
    idempotencyKey: fingerprint,
    channel,
    message: policy.verdict === "BLOCK" ? null : buildMessage(opportunity, input.supply),
    state,
    decision,
    policy,
    createdAt: now,
    // Nothing in this module sends. `sentAt` is written only by a delivery
    // adapter that holds the send lock for this idempotency key.
    sentAt: null,
    expiresAt: now + config.limits.campaignTtlHours * 3600_000,
  };
}

/** True when a queued campaign has aged out and must not be sent. */
export function campaignExpired(campaign: Campaign, now: number): boolean {
  return campaign.expiresAt !== null && now >= campaign.expiresAt;
}

/** Whether another delivery attempt is permitted for this campaign. */
export function mayRetry(attempts: number, now: number, campaign: Campaign): boolean {
  if (campaignExpired(campaign, now)) return false;
  if (campaign.state === "SENT" || campaign.state === "BLOCKED") return false;
  return attempts < growthConfig().limits.maxAttempts;
}
