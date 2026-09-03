import { describe, expect, it } from "vitest";

import { ATTRIBUTION_RETENTION_DAYS, resolveAttribution } from "./attribution";

describe("first-touch attribution", () => {
  const current = { landingPath: "/discover", referrerHost: "www.google.com", utm_source: "search", utm_medium: "organic", utm_campaign: "launch" };
  it("keeps safe values in the bounded retention period", () => expect(resolveAttribution({ ...current, issued: 1000 }, { ...current, landingPath: "/search" }, 1100)).toEqual({ ...current, issued: 1000 }));
  it("starts a new window after retention expires", () => { const now = 1000 + (ATTRIBUTION_RETENTION_DAYS + 1) * 86_400_000; expect(resolveAttribution({ ...current, issued: 1000 }, { ...current, landingPath: "/tools" }, now)).toEqual({ ...current, landingPath: "/tools", issued: now }); });
});
