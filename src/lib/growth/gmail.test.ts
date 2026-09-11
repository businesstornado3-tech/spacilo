import { describe, expect, it } from "vitest";

import {
  OUTREACH_SENDER,
  buildOutreachMessage,
  buildRawEmail,
  extractEmailAddress,
  gmailStatusView,
  looksLikeEmailAddress,
  type GmailStatusInput,
  type OutreachSignal,
} from "./gmail";
import { sanitiseGmailError } from "./gmail.server";

const READY: GmailStatusInput = {
  credentialsPresent: true,
  accountVerified: true,
  verifiedAccount: OUTREACH_SENDER,
  authorisationFailed: false,
  channelMayTransmit: true,
  sendVerified: true,
  outboundHalted: false,
};

describe("Gmail connection status is never optimistic", () => {
  it("reports each state exactly", () => {
    expect(gmailStatusView({ ...READY, credentialsPresent: false }).status).toBe("NOT_CONNECTED");
    expect(gmailStatusView({ ...READY, accountVerified: false }).status).toBe(
      "CONNECTION_REQUIRED",
    );
    expect(gmailStatusView({ ...READY, authorisationFailed: true }).status).toBe(
      "REAUTHORIZATION_REQUIRED",
    );
    expect(gmailStatusView({ ...READY, outboundHalted: true }).status).toBe("SENDING_UNAVAILABLE");
    expect(gmailStatusView({ ...READY, channelMayTransmit: false }).status).toBe(
      "SENDING_UNAVAILABLE",
    );
    expect(gmailStatusView({ ...READY, sendVerified: false }).status).toBe("CONNECTED");
    expect(gmailStatusView({ ...READY, sendVerified: false }).sendingReady).toBe(false);
    expect(gmailStatusView({ ...READY, sendVerified: false }).canTestSend).toBe(true);
    expect(gmailStatusView(READY).status).toBe("SENDING_READY");
  });

  it("refuses to send from any other mailbox", () => {
    const view = gmailStatusView({ ...READY, verifiedAccount: "someone@else.com" });
    expect(view.sendingReady).toBe(false);
    expect(view.detail).toContain(OUTREACH_SENDER);
  });

  it("only offers connect or reconnect when that is the real remedy", () => {
    expect(gmailStatusView({ ...READY, credentialsPresent: false }).action).toBe("CONNECT");
    expect(gmailStatusView({ ...READY, authorisationFailed: true }).action).toBe("RECONNECT");
    expect(gmailStatusView(READY).action).toBe("NONE");
  });
});

describe("the outreach message uses only what was detected", () => {
  const signal: OutreachSignal = {
    lookingFor: "looking for somewhere to keep furniture for three months",
    statedProblem: "The new flat completes in October and there is nowhere to put anything",
    location: "Portsmouth",
    sourceContext: "asked a public question about short-term storage while moving",
    sourceName: "a public forum thread",
    prospectType: "RENTER",
  };

  it("carries the person's own words, the source and the location", () => {
    const message = buildOutreachMessage(signal);
    expect(message.body).toContain("furniture for three months");
    expect(message.body).toContain("a public forum thread");
    expect(message.subject).toContain("Portsmouth");
    expect(message.body).toContain("https://earnroom.co.uk");
    expect(message.body).toContain("STOP");
  });

  it("says nothing about a location that was not detected", () => {
    const message = buildOutreachMessage({ ...signal, location: null });
    expect(message.body).not.toContain(" in null");
    expect(message.subject).not.toContain("undefined");
  });

  it("speaks to a host about earning rather than renting", () => {
    const message = buildOutreachMessage({
      ...signal,
      prospectType: "HOST",
      lookingFor: "wondering what to do with an empty garage",
      statedProblem: null,
    });
    expect(message.subject).toContain("unused space");
    expect(message.body).toContain("earns instead of sitting empty");
  });

  it("records the evidence behind every claim", () => {
    const message = buildOutreachMessage(signal);
    expect(message.claims.length).toBeGreaterThanOrEqual(3);
    for (const claim of message.claims) expect(claim.evidence.length).toBeGreaterThan(0);
  });
});

describe("the wire format", () => {
  it("builds a base64url payload with the EarnRoom sender", () => {
    const raw = buildRawEmail({
      to: "someone@example.com",
      from: OUTREACH_SENDER,
      subject: "Storage — EarnRoom",
      body: "Hello",
    });
    expect(raw).not.toContain("+");
    expect(raw).not.toContain("/");
    expect(raw).not.toContain("=");
    const decoded = Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString();
    expect(decoded).toContain(`From: EarnRoom <${OUTREACH_SENDER}>`);
    expect(decoded).toContain("To: someone@example.com");
  });

  it("rejects a malformed address before anything is sent", () => {
    expect(looksLikeEmailAddress("person@example.co.uk")).toBe(true);
    expect(looksLikeEmailAddress("not-an-address")).toBe(false);
    expect(looksLikeEmailAddress("a@b")).toBe(false);
  });
});

describe("provider errors never carry credentials", () => {
  it("redacts token-shaped material", () => {
    const text = sanitiseGmailError(
      "failed with ya29.A0ARrdaM9abcdefghijklmnopqrstuvwxyz0123456789",
    );
    expect(text).toContain("[redacted]");
    expect(text).not.toContain("ya29.A0ARrdaM9abcdefghijklmnopqrstuvwxyz0123456789");
  });
});

describe("reading the verified account out of an audit sentence", () => {
  it("drops the sentence's full stop so the account still matches", () => {
    expect(
      extractEmailAddress("Gmail confirmed the authorised account is businesstornado3@gmail.com."),
    ).toBe(OUTREACH_SENDER);
  });

  it("returns nothing when there is no address", () => {
    expect(extractEmailAddress("Gmail refused the stored authorisation.")).toBeNull();
  });
});
