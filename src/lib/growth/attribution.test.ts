import { describe, expect, it } from "vitest";

import {
  attributionRecord,
  landingAttribution,
  learningSignalFromAttribution,
} from "./attribution";

describe("growth attribution", () => {
  it("creates a stable first-touch key and normalises the landing path", () => {
    const first = landingAttribution({
      path: "/Storage/Portsmouth/?utm_source=ignored",
      referrer: "https://search.example/results?q=storage",
      currentHost: "earnroom.co.uk",
      params: { utm_source: "search", utm_medium: "organic", utm_campaign: "portsmouth" },
      now: 100,
    });
    const second = landingAttribution({
      path: "/Storage/Portsmouth/",
      referrer: "https://search.example/other",
      currentHost: "earnroom.co.uk",
      params: { utm_source: "search", utm_medium: "organic", utm_campaign: "portsmouth" },
      now: 200,
    });

    expect(first.landingPath).toBe("/storage/portsmouth");
    expect(first.referrerHost).toBe("search.example");
    expect(first.idempotencyKey).toBe(second.idempotencyKey);
  });

  it("records safe attribution fields and strips free-text-like values", () => {
    const landing = landingAttribution({ path: "/find-storage", now: 100, params: { utm_source: "newsletter" } });
    const record = attributionRecord({
      eventName: "signup_completed",
      occurredAt: 200,
      path: "/renter/requests/123",
      landing,
      opportunityKey: "opp_1",
      props: {
        audience: "RENTER",
        geography: "portsmouth",
        status: "complete",
        message: "must not be retained",
      },
    });

    expect(record).not.toBeNull();
    expect(record?.idempotencyKey).toMatch(/^attr_/);
    expect(record?.destination).toBe("/renter/requests/:id");
    expect(record?.source).toBe("newsletter");
    expect(record?.metadata).toMatchObject({ audience: "RENTER", geography: "portsmouth" });
    expect(record?.metadata).not.toHaveProperty("message");
  });

  it("maps conversion moments to learning without inventing unattributed outcomes", () => {
    const record = attributionRecord({
      eventName: "booking_completed",
      occurredAt: 300,
      opportunityKey: "opp_1",
      props: { value_pence: 5000 },
    });
    const signal = record ? learningSignalFromAttribution(record) : null;
    expect(signal).toMatchObject({ opportunityKey: "opp_1", outcome: "converted", at: 300 });

    const unattributed = attributionRecord({ eventName: "booking_completed", occurredAt: 300 });
    expect(unattributed ? learningSignalFromAttribution(unattributed) : null).toBeNull();
  });
});
