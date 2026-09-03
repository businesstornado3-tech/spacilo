/**
 * Phase 11 Stage 4 — autonomous decision and policy gates.
 *
 * The engine decides for itself whether an opportunity is worth acting on: no
 * founder approves individual leads. What the founder controls is the *policy*
 * — flags, thresholds, suppression, frequency, channels and the emergency
 * stop — and every one of those is enforced here, before a message can exist.
 *
 * The gates fail closed. Anything unknown, unconsented, unauthorised or simply
 * not configured produces BLOCK or DEFER, never a send.
 */
import { growthConfig, isGrowthFlagEnabled, outboundHalted } from "./config";
import { mayCampaign } from "./connectors";
import { channelBlockReason, channelMayTransmit, channelUsable, consentSatisfied, getChannel } from "./channels";
import type {
  CampaignDecision,
  ChannelId,
  ConsentState,
  GrowthOpportunity,
  PolicyCheck,
  PolicyDecision,
} from "./types";

export type PolicyContext = {
  opportunity: GrowthOpportunity;
  channel: ChannelId | null;
  consent: ConsentState;
  /** Whether a contactable, lawfully obtained handle exists at all. */
  hasContact: boolean;
  /** Sends already made to this recipient in the last 24h. */
  recentSends24h: number;
  /** Hours since the last contact with this recipient, if ever. */
  hoursSinceLastContact: number | null;
  /** True when the person opted out; an absolute block. */
  suppressed: boolean;
  now: number;
};

function check(id: string, passed: boolean, detail: string): PolicyCheck {
  return { id, passed, detail };
}

/**
 * Evaluates every gate. `requiresConfiguration` means a human must authorise a
 * channel or connector — never that a human must approve this specific person.
 */
export function evaluatePolicy(context: PolicyContext): PolicyDecision {
  const config = growthConfig();
  const { opportunity } = context;
  const checks: PolicyCheck[] = [];

  checks.push(check("phase11_enabled", isGrowthFlagEnabled("PHASE11_ENABLED"), "Phase 11 master flag."));
  checks.push(
    check("campaign_engine_enabled", isGrowthFlagEnabled("AI_CAMPAIGN_ENGINE_ENABLED"), "Campaign engine flag."),
  );
  checks.push(check("emergency_stop_clear", !config.emergencyStop, "Founder emergency stop."));
  checks.push(check("outbound_enabled", !outboundHalted(), "Autonomous sending flag."));
  checks.push(check("not_opted_out", !context.suppressed, "Recipient opt-out and suppression list."));
  checks.push(
    check(
      "connector_may_campaign",
      mayCampaign(opportunity.connectorId),
      "Source connector is authorised for outreach.",
    ),
  );
  checks.push(check("contact_available", context.hasContact, "A lawfully obtained contact handle exists."));
  checks.push(
    check(
      "channel_usable",
      context.channel !== null && channelUsable(context.channel),
      "Channel is configured, enabled and unpaused.",
    ),
  );
  checks.push(
    check(
      "consent_basis",
      context.channel !== null && consentSatisfied(context.channel, context.consent),
      "Consent or legitimate interest satisfies the channel.",
    ),
  );

  const channelState = context.channel ? getChannel(context.channel) : null;
  const perDay = channelState?.perRecipientPerDay ?? config.limits.perRecipientPerDay;
  checks.push(check("frequency_cap", context.recentSends24h < perDay, `At most ${perDay} message per recipient/day.`));
  const cooldown = channelState?.cooldownHours ?? config.limits.campaignCooldownHours;
  checks.push(
    check(
      "cooldown",
      context.hoursSinceLastContact === null || context.hoursSinceLastContact >= cooldown,
      `${cooldown}h cooldown between contacts.`,
    ),
  );
  checks.push(
    check(
      "score_floor",
      opportunity.scores.opportunity >= config.thresholds.campaignFloor,
      "Opportunity score is above the campaign floor.",
    ),
  );
  checks.push(
    check(
      "confidence_floor",
      opportunity.scores.intentConfidence >= config.thresholds.confidenceFloor,
      "Understanding is confident enough to say anything.",
    ),
  );
  checks.push(
    check(
      "category_not_suppressed",
      !config.suppressedCategories.includes(String(opportunity.situation.problem ?? "")),
      "Opportunity category is not suppressed.",
    ),
  );

  // The decisive outbound gate: may this channel lawfully transmit at all?
  // A person is never asked to approve this lead — only to authorise the
  // channel once, which is a configuration act, not a per-message review.
  checks.push(
    check(
      "channel_authorised_to_transmit",
      context.channel !== null && channelMayTransmit(context.channel),
      context.channel === null
        ? "No channel is attached to this opportunity."
        : (channelBlockReason(context.channel) ??
          "Channel is authorised to transmit."),
    ),
  );

  const failed = checks.filter((item) => !item.passed);
  const configurationGates = new Set([
    "channel_usable",
    "connector_may_campaign",
    "outbound_enabled",
    "channel_authorised_to_transmit",
  ]);
  const requiresConfiguration = failed.some((item) => configurationGates.has(item.id));

  // An explicit opt-out, emergency stop or disabled master phase can never be
  // deferred into a later send; missing contact/consent is safely captured.
  const absolute = failed.some((item) =>
    ["not_opted_out", "emergency_stop_clear", "phase11_enabled"].includes(item.id),
  );

  // ESCALATE is a *policy* signal to the founder ("a strong, repeatable need
  // is stuck behind an unauthorised channel"), never a request to approve an
  // individual person or message.
  const escalate =
    !absolute &&
    requiresConfiguration &&
    opportunity.scores.opportunity >= config.thresholds.bandHigh;

  const verdict: PolicyDecision["verdict"] = failed.length === 0
    ? "ALLOW"
    : absolute
      ? "BLOCK"
      : escalate
        ? "ESCALATE"
        : "DEFER";

  return {
    verdict,
    checks,
    reasons: failed.length === 0 ? ["Every policy gate passed."] : failed.map((item) => `${item.id}: ${item.detail}`),
    requiresConfiguration,
  };
}

/**
 * The autonomous decision itself. It is taken from the opportunity and the
 * policy verdict alone — no per-lead human step exists anywhere in this path.
 */
export function decideCampaign(
  opportunity: GrowthOpportunity,
  policy: PolicyDecision,
  now: number,
): CampaignDecision {
  const config = growthConfig();
  if (policy.verdict === "BLOCK") {
    return { value: "DO_NOT_CAMPAIGN", reasons: policy.reasons };
  }
  if (policy.verdict === "ESCALATE") {
    return {
      value: "CAPTURE_ONLY",
      reasons: ["A strong need is blocked only by channel authorisation.", ...policy.reasons],
    };
  }
  if (opportunity.scores.opportunity < config.thresholds.campaignFloor) {
    return { value: "RETAIN_FOR_INSIGHT", reasons: ["Below the campaign floor; kept as evidence only."] };
  }
  if (policy.verdict === "ALLOW") {
    return { value: "CAMPAIGN_NOW", reasons: ["Every policy gate passed."] };
  }
  // Deferred: the need is real, but a channel or authorisation is missing. The
  // opportunity is still captured in-product rather than thrown away.
  const blockedOnConfiguration = policy.requiresConfiguration;
  return {
    value: blockedOnConfiguration ? "CAPTURE_ONLY" : "CAMPAIGN_LATER",
    reasons: policy.reasons,
    ...(blockedOnConfiguration ? {} : { scheduledFor: now + config.limits.followUpWindowHours * 3600_000 }),
  };
}
