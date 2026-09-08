/**
 * Outreach Eligibility Gate — deterministic, and above the AI.
 *
 * The intelligence layer may classify an opportunity and may recommend
 * outreach. It cannot authorise it. This module takes only facts (source
 * terms, contact mechanism, suppression, prior contact, duplication, consent)
 * and returns one verdict. An AI recommendation is accepted as input purely so
 * it can be recorded alongside the verdict; it is never read when deciding.
 */
import { channelMayTransmit, consentSatisfied, getChannel } from "./channels";
import { growthConfig } from "./config";
import type { ChannelId, ConsentState } from "./types";

export const OUTREACH_VERDICTS = [
  "ELIGIBLE",
  "NOT_ELIGIBLE",
  "REQUIRES_REVIEW",
  "SOURCE_RESTRICTED",
  "CONTACT_NOT_PERMITTED",
  "DUPLICATE",
  "ALREADY_CONTACTED",
  "DO_NOT_CONTACT",
] as const;

export type OutreachVerdict = (typeof OUTREACH_VERDICTS)[number];

export type OutreachEligibilityInput = {
  /** Hashed recipient reference. No address ever reaches this module. */
  recipient: string | null;
  channel: ChannelId | null;
  /** The public source's terms permit this use, reviewed by a human. */
  sourceTermsPermitOutreach: boolean;
  /** A human has completed the source's terms review. */
  sourceTermsReviewed: boolean;
  /** The contact mechanism itself allows unsolicited contact of this kind. */
  contactMechanismPermitsOutreach: boolean;
  consent: ConsentState;
  /** Absolute: the person opted out or is on the suppression list. */
  suppressed: boolean;
  /** Hours since this recipient was last contacted; null when never. */
  hoursSinceLastContact: number | null;
  /** A campaign with the same fingerprint already exists. */
  duplicateFingerprint: boolean;
  /**
   * What the intelligence layer suggested. Recorded, never obeyed.
   */
  aiRecommendation?: "CONTACT" | "DO_NOT_CONTACT" | null;
};

export type OutreachEligibility = {
  verdict: OutreachVerdict;
  reason: string;
  /** True only for ELIGIBLE. Callers must not derive permission any other way. */
  mayContact: boolean;
  /** Echoed for the audit trail; it had no effect on the verdict. */
  aiRecommendation: "CONTACT" | "DO_NOT_CONTACT" | null;
};

function decide(verdict: OutreachVerdict, reason: string): Omit<OutreachEligibility, "aiRecommendation"> {
  return { verdict, reason, mayContact: verdict === "ELIGIBLE" };
}

export function evaluateOutreachEligibility(
  input: OutreachEligibilityInput,
): OutreachEligibility {
  const aiRecommendation = input.aiRecommendation ?? null;
  const result = ((): Omit<OutreachEligibility, "aiRecommendation"> => {
    if (input.suppressed) {
      return decide("DO_NOT_CONTACT", "This person has opted out or is suppressed.");
    }
    if (!input.sourceTermsPermitOutreach) {
      return decide("SOURCE_RESTRICTED", "The source's terms do not permit contacting people found there.");
    }
    if (!input.contactMechanismPermitsOutreach) {
      return decide("CONTACT_NOT_PERMITTED", "The contact route does not allow this kind of message.");
    }
    if (input.duplicateFingerprint) {
      return decide("DUPLICATE", "An equivalent campaign already exists for this situation.");
    }
    if (!input.recipient) {
      return decide("NOT_ELIGIBLE", "No lawfully obtained contact reference exists.");
    }
    if (!input.channel) {
      return decide("NOT_ELIGIBLE", "No channel is attached to this opportunity.");
    }
    const channel = getChannel(input.channel);
    if (!channel) {
      return decide("NOT_ELIGIBLE", "That channel is not registered.");
    }
    const cooldown = channel.cooldownHours ?? growthConfig().limits.campaignCooldownHours;
    if (input.hoursSinceLastContact !== null && input.hoursSinceLastContact < cooldown) {
      return decide("ALREADY_CONTACTED", `Contacted within the last ${cooldown} hours.`);
    }
    if (!consentSatisfied(input.channel, input.consent)) {
      return decide("NOT_ELIGIBLE", "There is no lawful basis to contact this person on this channel.");
    }
    if (!input.sourceTermsReviewed) {
      return decide("REQUIRES_REVIEW", "The source's terms have not been reviewed by a person yet.");
    }
    if (!channelMayTransmit(input.channel)) {
      return decide("NOT_ELIGIBLE", "The channel is not authorised to transmit.");
    }
    return decide("ELIGIBLE", "Every eligibility condition is satisfied.");
  })();

  return { ...result, aiRecommendation };
}
