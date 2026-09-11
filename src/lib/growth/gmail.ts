/**
 * Gmail outreach — the pure layer.
 *
 * EarnRoom's outreach intelligence already decides *whether* a person may be
 * contacted (see `eligibility.ts`, `policy.ts`, `channels.ts`). This module
 * adds one thing only: turning an already-approved opportunity into a plain,
 * honest email, and describing the Gmail connection state truthfully.
 *
 * Deliberate limits:
 * - Only the Gmail *send* endpoint is ever used by EarnRoom's code. Nothing
 *   here reads, searches or modifies a mailbox.
 * - Every sentence in a generated message must come from the detected signal.
 *   Nothing about the person is invented.
 *
 * Pure module: no network, no database, no clock beyond what it is given.
 */

/** The one mailbox EarnRoom is allowed to send outreach from. */
export const OUTREACH_SENDER = "businesstornado3@gmail.com";

/** Version stamp recorded with every message, so wording is traceable. */
export const OUTREACH_CONTENT_VERSION = "earnroom-outreach-v1";

/** The only Gmail permission EarnRoom's own code needs to do this work. */
export const REQUIRED_GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.send";

export type GmailStatus =
  | "NOT_CONNECTED"
  | "CONNECTION_REQUIRED"
  | "CONNECTED"
  | "REAUTHORIZATION_REQUIRED"
  | "SENDING_UNAVAILABLE"
  | "SENDING_READY";

export type GmailStatusInput = {
  /** Both server-side credentials exist. */
  credentialsPresent: boolean;
  /** A real Gmail profile call has succeeded at least once. */
  accountVerified: boolean;
  /** The address Gmail itself reported, if any. */
  verifiedAccount: string | null;
  /** Gmail refused the last call with an authorisation error. */
  authorisationFailed: boolean;
  /** The outreach channel is authorised to transmit right now. */
  channelMayTransmit: boolean;
  /** Why the channel cannot transmit, in plain words, when it cannot. */
  channelBlockReason?: string | null;
  /**
   * Gmail has actually accepted a message from EarnRoom and returned a
   * message id. Identity alone never proves the send action works.
   */
  sendVerified: boolean;
  /** Founder pause / emergency stop. */
  outboundHalted: boolean;
};

export type GmailStatusView = {
  status: GmailStatus;
  detail: string;
  /** True only when a real outreach email could genuinely be sent now. */
  sendingReady: boolean;
  /** Whether a founder-only test send may be attempted now. */
  canTestSend: boolean;
  /** Whether the founder should be offered Connect/Reconnect. */
  action: "CONNECT" | "RECONNECT" | "NONE";
};

/** The honest Gmail state. Never claims readiness it cannot prove. */
export function gmailStatusView(input: GmailStatusInput): GmailStatusView {
  if (!input.credentialsPresent) {
    return {
      status: "NOT_CONNECTED",
      detail: "No Gmail account is connected, so no outreach email can be sent.",
      sendingReady: false,
      canTestSend: false,
      action: "CONNECT",
    };
  }
  if (input.authorisationFailed) {
    return {
      status: "REAUTHORIZATION_REQUIRED",
      detail: "Gmail refused the stored authorisation. Reconnect the account.",
      sendingReady: false,
      canTestSend: false,
      action: "RECONNECT",
    };
  }
  if (!input.accountVerified) {
    return {
      status: "CONNECTION_REQUIRED",
      detail: "The Gmail account has not been checked yet. Run the connection test.",
      sendingReady: false,
      canTestSend: false,
      action: "NONE",
    };
  }
  if (input.verifiedAccount !== OUTREACH_SENDER) {
    return {
      status: "SENDING_UNAVAILABLE",
      detail: `Connected to ${input.verifiedAccount ?? "an unknown account"}, but outreach may only be sent from ${OUTREACH_SENDER}.`,
      sendingReady: false,
      canTestSend: false,
      action: "RECONNECT",
    };
  }
  if (input.outboundHalted) {
    return {
      status: "SENDING_UNAVAILABLE",
      detail: "Outbound sending is paused, so nothing will be delivered.",
      sendingReady: false,
      canTestSend: false,
      action: "NONE",
    };
  }
  if (!input.channelMayTransmit) {
    return {
      status: "SENDING_UNAVAILABLE",
      detail:
        input.channelBlockReason ??
        "The email channel is not authorised to transmit yet.",
      sendingReady: false,
      canTestSend: false,
      action: "NONE",
    };
  }
  if (!input.sendVerified) {
    return {
      status: "CONNECTED",
      detail: `Connected for account verification as ${OUTREACH_SENDER}, but Gmail sending has not been proven yet. Run Test send to prove it.`,
      sendingReady: false,
      canTestSend: true,
      action: "NONE",
    };
  }
  return {
    status: "SENDING_READY",
    detail: `Ready — Gmail accepted a message from ${OUTREACH_SENDER} and returned a message id.`,
    sendingReady: true,
    canTestSend: true,
    action: "NONE",
  };
}

/** The subject and body of the founder-only test message. */
export function buildTestSendMessage(): { subject: string; body: string } {
  return {
    subject: "EarnRoom Gmail outreach test",
    body: [
      "EarnRoom Gmail outreach test — no prospect email was sent.",
      "This message was sent by the founder from the EarnRoom Marketing Studio to prove that Gmail accepts messages from this account.",
      `Sender: ${OUTREACH_SENDER}`,
      "https://earnroom.co.uk",
    ].join("\n\n"),
  };
}

/* --------------------------------------------------------------- message */

/** Everything a message may say, and where each part came from. */
export type OutreachSignal = {
  /** What the person said they are looking for, in their own words. */
  lookingFor: string;
  /** Their stated storage problem, or unused-space opportunity. */
  statedProblem: string | null;
  /** Only where the source legitimately gives one. */
  location: string | null;
  /** Short, factual context from the public source. */
  sourceContext: string;
  /** Where the signal was observed, named plainly. */
  sourceName: string;
  prospectType: "RENTER" | "HOST";
};

export type OutreachMessage = {
  subject: string;
  body: string;
  contentVersion: string;
  /** Each claim with the evidence behind it, for the audit trail. */
  claims: readonly { claim: string; evidence: string }[];
};

function sentence(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (!trimmed) return "";
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/**
 * Builds the outreach email from the detected signal only.
 *
 * If a field was not detected it is simply left out — the message never
 * invents a location, a circumstance or a prior relationship.
 */
export function buildOutreachMessage(signal: OutreachSignal): OutreachMessage {
  const renter = signal.prospectType === "RENTER";
  const where = signal.location ? ` in ${signal.location}` : "";

  const subject = renter
    ? `Storage${where} — EarnRoom may be able to help`
    : `Earn from your unused space${where} with EarnRoom`;

  const lines: string[] = [];
  lines.push("Hello,");
  lines.push(
    `I saw your post on ${signal.sourceName}: ${sentence(signal.sourceContext)} That is why I am writing.`,
  );
  lines.push(sentence(`You mentioned you are ${signal.lookingFor}`));
  if (signal.statedProblem) lines.push(sentence(signal.statedProblem));
  lines.push(
    renter
      ? `EarnRoom is a UK marketplace where people rent spare space — garages, lofts, spare rooms — from neighbours${where}. It is often cheaper and closer than a self-storage unit.`
      : `EarnRoom is a UK marketplace where people let out spare space — a garage, loft or spare room${where} — to neighbours who need storage, so unused space earns instead of sitting empty.`,
  );
  lines.push("If it looks useful, you can see how it works at https://earnroom.co.uk");
  lines.push(
    "If you would rather not hear from EarnRoom again, reply with the word STOP and I will not contact you.",
  );
  lines.push("Best wishes,\nEarnRoom");

  const claims: { claim: string; evidence: string }[] = [
    { claim: "The person is looking for this.", evidence: signal.lookingFor },
    {
      claim: "Seen on this public source.",
      evidence: `${signal.sourceName}: ${signal.sourceContext}`,
    },
  ];
  if (signal.statedProblem) {
    claims.push({ claim: "Stated problem or opportunity.", evidence: signal.statedProblem });
  }
  if (signal.location) claims.push({ claim: "Location.", evidence: signal.location });

  return {
    subject,
    body: lines.join("\n\n"),
    contentVersion: OUTREACH_CONTENT_VERSION,
    claims,
  };
}

/* ----------------------------------------------------------------- RFC822 */

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  // btoa exists in the worker runtime; Buffer is used when it does not.
  return typeof btoa === "function" ? btoa(binary) : Buffer.from(bytes).toString("base64");
}

function encodeHeader(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${base64(new TextEncoder().encode(value))}?=`;
}

/** Builds the base64url RFC 2822 payload Gmail's send endpoint expects. */
export function buildRawEmail(input: {
  to: string;
  from: string;
  subject: string;
  body: string;
}): string {
  const message = [
    `From: EarnRoom <${input.from}>`,
    `To: ${input.to}`,
    `Subject: ${encodeHeader(input.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    input.body,
  ].join("\r\n");
  return base64(new TextEncoder().encode(message))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** A conservative address check. A malformed address is never contacted. */
export function looksLikeEmailAddress(value: string): boolean {
  return /^[^\s@,;:<>"]+@[^\s@,;:<>"]+\.[a-z]{2,}$/i.test(value.trim());
}
