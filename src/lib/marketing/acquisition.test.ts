import { describe, expect, it } from "vitest";

import {
  acquisitionTotals,
  funnelStages,
  isConfirmedPublication,
  outreachChannelStatus,
  socialChannelStatus,
  type OutreachChannelSignals,
  type SocialChannelSignals,
} from "./acquisition";

function social(overrides: Partial<SocialChannelSignals> = {}): SocialChannelSignals {
  return {
    platform: "youtube",
    label: "YouTube",
    credentialsConfigured: true,
    connection: "CONNECTED",
    hasStoredToken: true,
    hasDestinationAccount: true,
    paused: false,
    publicPublishingApproved: true,
    approvalNote: null,
    lastError: null,
    lastPublicationState: null,
    ...overrides,
  };
}

function outreach(overrides: Partial<OutreachChannelSignals> = {}): OutreachChannelSignals {
  return {
    channel: "email",
    label: "Email",
    enabled: true,
    paused: false,
    emergencyStop: false,
    deliveryMode: "live",
    credentialState: "verified",
    termsStatus: "authorised",
    adapterTransmits: true,
    lastError: null,
    ...overrides,
  };
}

describe("social channel diagnostic", () => {
  it("is LIVE only when credentials, token, destination and approval all exist", () => {
    expect(socialChannelStatus(social()).status).toBe("LIVE");
  });

  it("never claims LIVE without a stored authorisation", () => {
    expect(socialChannelStatus(social({ hasStoredToken: false })).status).toBe("AUTH_REQUIRED");
  });

  it("reports missing application credentials as configuration required", () => {
    expect(socialChannelStatus(social({ credentialsConfigured: false })).status).toBe(
      "CONFIGURATION_REQUIRED",
    );
  });

  it("reports an unconnected platform honestly", () => {
    expect(socialChannelStatus(social({ connection: "REQUIRES_CONFIGURATION" })).status).toBe(
      "NOT_CONNECTED",
    );
  });

  it("reports platform approval when public posting is not permitted yet", () => {
    const result = socialChannelStatus(
      social({ platform: "tiktok", label: "TikTok", publicPublishingApproved: false, approvalNote: "Audit pending." }),
    );
    expect(result.status).toBe("PLATFORM_APPROVAL_REQUIRED");
    expect(result.detail).toContain("Audit");
    expect(result.live).toBe(false);
  });

  it("surfaces the last failure rather than a stale live badge", () => {
    expect(
      socialChannelStatus(social({ lastPublicationState: "PLATFORM_REJECTED", lastError: "Rejected." }))
        .status,
    ).toBe("FAILED");
  });

  it("treats a pause as a policy block", () => {
    expect(socialChannelStatus(social({ paused: true })).status).toBe("BLOCKED_BY_POLICY");
  });
});

describe("outreach channel diagnostic", () => {
  it("marks a non-transmitting adapter as MOCK, never LIVE", () => {
    expect(outreachChannelStatus(outreach({ adapterTransmits: false })).status).toBe("MOCK");
    expect(outreachChannelStatus(outreach({ deliveryMode: "mock" })).status).toBe("MOCK");
  });

  it("marks an unbuilt route as configuration required", () => {
    expect(outreachChannelStatus(outreach({ deliveryMode: "none" })).status).toBe(
      "CONFIGURATION_REQUIRED",
    );
  });

  it("blocks everything under emergency stop", () => {
    expect(outreachChannelStatus(outreach({ emergencyStop: true })).status).toBe(
      "BLOCKED_BY_POLICY",
    );
  });

  it("requires terms sign-off before anything else can be live", () => {
    expect(outreachChannelStatus(outreach({ termsStatus: "pending_review" })).status).toBe(
      "PLATFORM_APPROVAL_REQUIRED",
    );
  });

  it("is LIVE only with verified credentials and a transmitting adapter", () => {
    expect(outreachChannelStatus(outreach()).status).toBe("LIVE");
    expect(outreachChannelStatus(outreach({ credentialState: "missing" })).status).toBe(
      "AUTH_REQUIRED",
    );
  });
});

describe("funnel evidence", () => {
  it("shows zero as zero and never marks an unproven stage", () => {
    const stages = funnelStages({
      opportunities: 3,
      interpreted: 3,
      campaigns: 1,
      contentGenerated: 1,
      validated: 1,
      eligibleForDelivery: 0,
      realDeliveries: 0,
      referredVisits: 0,
      registrations: 0,
      bookings: 0,
      completedBookings: 0,
    });
    expect(stages).toHaveLength(11);
    expect(stages.find((stage) => stage.key === "delivery")?.proven).toBe(false);
    expect(stages.find((stage) => stage.key === "campaign")?.proven).toBe(true);
  });
});

describe("publication confirmation", () => {
  it("requires an external identifier before calling anything published", () => {
    expect(isConfirmedPublication({ state: "PUBLISHED", platformPostId: null })).toBe(false);
    expect(isConfirmedPublication({ state: "PUBLISHED", platformPostId: "abc" })).toBe(true);
    expect(isConfirmedPublication({ state: "UPLOADING", platformPostId: "abc" })).toBe(false);
  });
});

describe("totals", () => {
  it("counts each status separately so mock never inflates live", () => {
    const totals = acquisitionTotals([
      socialChannelStatus(social()),
      outreachChannelStatus(outreach({ adapterTransmits: false })),
      socialChannelStatus(social({ platform: "instagram", label: "Instagram", credentialsConfigured: false })),
    ]);
    expect(totals.live).toBe(1);
    expect(totals.mock).toBe(1);
    expect(totals.configurationRequired).toBe(1);
  });
});
