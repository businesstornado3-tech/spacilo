import { describe, expect, it } from "vitest";

import { buildOutreachCard } from "./outreach-cards";

const opportunity = {
  key: "op-1",
  connectorId: "reddit",
  situation: {
    summary: "Moving out of a flat in Portsmouth and needs somewhere for boxes for two months",
    problem: "No room at the new place until August",
    need: "looking for short-term storage",
    spaces: ["Portsmouth"],
    evidence: [{ quote: "need somewhere for my boxes for two months", field: "text" }],
  },
  painPoints: [
    {
      label: "Gap between tenancies",
      description: "Nowhere to keep belongings between moves",
      evidence: [{ quote: "two months", field: "text" }],
    },
  ],
  audience: { primary: "RENTER" },
  fit: { verdict: "BEST_EXISTING_SOLUTION" },
  evidence: [{ quote: "https://example.com/post/1", field: "reference" }],
  latestSeen: Date.parse("2026-05-01T10:00:00Z"),
} as any;

describe("outreach review cards", () => {
  it("shows the source, evidence and the exact email", () => {
    const card = buildOutreachCard({ opportunity, gmailReady: true, paused: false });
    expect(card.sourceName).toBe("reddit");
    expect(card.sourceReference).toBe("https://example.com/post/1");
    expect(card.situationEvidence[0]).toContain("two months");
    expect(card.proposedBody).toContain("earnroom.co.uk");
    expect(card.rationale).toHaveLength(5);
  });

  it("refuses to send when there is no contact address", () => {
    const card = buildOutreachCard({ opportunity, gmailReady: true, paused: false });
    expect(card.sendable).toBe(false);
    expect(card.blockers).toContain("NO_RECIPIENT");
  });

  it("blocks while outreach is paused or Gmail is not ready", () => {
    const paused = buildOutreachCard({
      opportunity,
      contact: { address: "person@example.com", consent: "OPTED_IN" },
      gmailReady: true,
      paused: true,
    });
    expect(paused.blockers).toContain("PAUSED");

    const notReady = buildOutreachCard({
      opportunity,
      contact: { address: "person@example.com", consent: "OPTED_IN" },
      gmailReady: false,
      paused: false,
    });
    expect(notReady.blockers).toContain("GMAIL_NOT_READY");
  });

  it("never contacts the same person twice", () => {
    const card = buildOutreachCard({
      opportunity,
      contact: { address: "person@example.com", consent: "OPTED_IN" },
      alreadyContacted: true,
      gmailReady: true,
      paused: false,
    });
    expect(card.sendable).toBe(false);
    expect(card.blockers).toContain("ALREADY_CONTACTED");
  });

  it("is sendable only when every gate passes", () => {
    const card = buildOutreachCard({
      opportunity,
      contact: { address: "person@example.com", consent: "OPTED_IN" },
      gmailReady: true,
      paused: false,
    });
    expect(card.sendable).toBe(true);
    expect(card.blockers).toHaveLength(0);
  });
});
