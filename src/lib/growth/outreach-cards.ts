/**
 * Outreach review cards — the pure layer.
 *
 * The founder must be able to read, before anything is sent:
 *   where the signal came from, what the person actually said, what EarnRoom
 *   believes their problem is, why EarnRoom is relevant, the exact email that
 *   would go out, and whether it can be sent at all.
 *
 * Nothing here invents evidence. A field that the stored opportunity does not
 * support is reported as "not established", never guessed, and a card with no
 * recipient address is explicitly not sendable.
 *
 * Pure module: no network, no database, no clock beyond what it is given.
 */
import { buildOutreachMessage, looksLikeEmailAddress, type OutreachSignal } from "./gmail";
import type { EvidenceItem, GrowthOpportunity } from "./types";

export type OutreachCardBlocker =
  | "NO_RECIPIENT"
  | "INVALID_RECIPIENT"
  | "NO_CONSENT"
  | "NOT_ELIGIBLE"
  | "ALREADY_CONTACTED"
  | "GMAIL_NOT_READY"
  | "PAUSED";

export type OutreachCard = {
  opportunityKey: string;
  /** Where it was seen, in plain words. */
  sourceName: string;
  /** The public reference the signal carries, when it has one. */
  sourceReference: string | null;
  observedAt: string | null;
  /** The search or query that surfaced it, when recorded. */
  discoveredVia: string | null;
  location: string | null;
  prospectType: "RENTER" | "HOST";
  /** What the person is looking for, in their own words where possible. */
  lookingFor: string;
  /** The situation EarnRoom read, with the quotes behind it. */
  situation: string;
  situationEvidence: readonly string[];
  painPoints: readonly { label: string; description: string; evidence: readonly string[] }[];
  /** Why EarnRoom may be relevant — cautious, never a promise. */
  relevance: string;
  /** The exact message that would be sent. */
  proposedSubject: string;
  proposedBody: string;
  /** source → situation → pain → value → email, one line each. */
  rationale: readonly string[];
  recipientEmail: string | null;
  sendable: boolean;
  blockers: readonly OutreachCardBlocker[];
  blockerDetail: string | null;
};

function quotes(items: readonly EvidenceItem[] | undefined): string[] {
  return (items ?? []).map((item) => item.quote).filter((quote) => quote.trim().length > 0);
}

const BLOCKER_WORDS: Record<OutreachCardBlocker, string> = {
  NO_RECIPIENT: "No public contact address was found for this person, so nothing can be sent.",
  INVALID_RECIPIENT: "The contact address found is not a usable email address.",
  NO_CONSENT: "The contact route does not permit outreach, so nothing can be sent.",
  NOT_ELIGIBLE: "EarnRoom's outreach rules do not allow contacting this person.",
  ALREADY_CONTACTED: "This person has already been contacted about this.",
  GMAIL_NOT_READY: "Gmail sending is not ready yet.",
  PAUSED: "Outreach is paused.",
};

export type OutreachCardInput = {
  opportunity: GrowthOpportunity;
  /** The stored contact for the signal, when the source legitimately gave one. */
  contact?: { address: string; consent: string } | null;
  /** True when this person already received an EarnRoom outreach email. */
  alreadyContacted?: boolean;
  gmailReady: boolean;
  paused: boolean;
};

/** Builds one founder-facing review card from a stored opportunity. */
export function buildOutreachCard(input: OutreachCardInput): OutreachCard {
  const { opportunity } = input;
  const situation = opportunity.situation;
  const roles = opportunity.audience?.primary ?? "UNKNOWN";
  const prospectType: "RENTER" | "HOST" = roles === "HOST" ? "HOST" : "RENTER";

  const lookingFor = situation.need ?? situation.summary;
  const sourceName = opportunity.connectorId;
  const reference =
    (opportunity.evidence ?? []).find((item) => item.field === "reference")?.quote ?? null;
  const discoveredVia =
    (opportunity.evidence ?? []).find((item) => item.field === "query")?.quote ?? null;
  const location = situation.spaces?.[0] ?? null;

  const signal: OutreachSignal = {
    lookingFor,
    statedProblem: situation.problem,
    location,
    sourceContext: situation.summary,
    sourceName,
    prospectType,
  };
  const message = buildOutreachMessage(signal);

  const blockers: OutreachCardBlocker[] = [];
  const address = input.contact?.address ?? null;
  if (!address) blockers.push("NO_RECIPIENT");
  else if (!looksLikeEmailAddress(address)) blockers.push("INVALID_RECIPIENT");
  if (address && input.contact?.consent === "PROHIBITED") blockers.push("NO_CONSENT");
  if (opportunity.fit?.verdict === "NOT_A_FIT") blockers.push("NOT_ELIGIBLE");
  if (input.alreadyContacted) blockers.push("ALREADY_CONTACTED");
  if (!input.gmailReady) blockers.push("GMAIL_NOT_READY");
  if (input.paused) blockers.push("PAUSED");

  const painPoints = (opportunity.painPoints ?? []).map((point) => ({
    label: point.label,
    description: point.description,
    evidence: quotes(point.evidence),
  }));

  return {
    opportunityKey: opportunity.key,
    sourceName,
    sourceReference: reference,
    observedAt: opportunity.latestSeen ? new Date(opportunity.latestSeen).toISOString() : null,
    discoveredVia,
    location,
    prospectType,
    lookingFor,
    situation: situation.summary,
    situationEvidence: quotes(situation.evidence),
    painPoints,
    relevance:
      prospectType === "HOST"
        ? "EarnRoom may be relevant because they appear to have space that is not being used. This is a judgement from the public post, not a certainty."
        : "EarnRoom may be relevant because they appear to be looking for storage near them. This is a judgement from the public post, not a certainty.",
    proposedSubject: message.subject,
    proposedBody: message.body,
    rationale: [
      `Source: seen on ${sourceName}${reference ? ` (${reference})` : ""}.`,
      `Situation: ${situation.summary}`,
      `Problem: ${situation.problem ?? "not established from the post."}`,
      `Why EarnRoom: ${
        prospectType === "HOST"
          ? "unused space could earn instead of sitting empty."
          : "neighbours' spare space is often cheaper and closer than a storage unit."
      }`,
      `Email: ${message.subject}`,
    ],
    recipientEmail: address,
    sendable: blockers.length === 0,
    blockers,
    blockerDetail: blockers.length > 0 ? (BLOCKER_WORDS[blockers[0]!] ?? null) : null,
  };
}
