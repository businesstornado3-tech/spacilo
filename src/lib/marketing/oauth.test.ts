import { describe, expect, it } from "vitest";

import { OAUTH_DEFINITIONS, authorizeUrl, oauthConfigState, oauthDefinition } from "./oauth";

describe("official OAuth architecture", () => {
  it("treats a platform as unconfigured until BOTH application credentials exist", () => {
    const none = oauthConfigState("youtube", []);
    expect(none.configured).toBe(false);
    expect(none.label).toBe("Requires configuration");

    const half = oauthConfigState("youtube", ["YOUTUBE_CLIENT_ID"]);
    expect(half.configured).toBe(false);
    expect(half.missingSecrets).toEqual(["YOUTUBE_CLIENT_SECRET"]);

    const both = oauthConfigState("youtube", ["YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET"]);
    expect(both.configured).toBe(true);
    expect(both.missingSecrets).toEqual([]);
  });

  it("never places a client secret in the authorisation URL", () => {
    const url = authorizeUrl({
      platform: "tiktok",
      clientId: "public-client-key",
      redirectUri: "https://earnroom.co.uk/api/public/marketing/oauth/tiktok",
      state: "founder-id",
    });
    expect(url).toContain("client_id=public-client-key");
    expect(url).not.toContain("secret");
    expect(url).toContain("state=founder-id");
  });

  it("requests offline access for YouTube so uploads survive a token refresh", () => {
    const url = authorizeUrl({
      platform: "youtube",
      clientId: "id",
      redirectUri: "https://earnroom.co.uk/cb",
      state: "s",
    });
    expect(url).toContain("access_type=offline");
  });

  it("declares the real platform approval constraints rather than assuming access", () => {
    expect(oauthDefinition("tiktok").approvalNote).toMatch(/audit/i);
    expect(oauthDefinition("instagram").approvalNote).toMatch(/App Review/i);
    for (const def of OAUTH_DEFINITIONS) {
      expect(def.scopes.length).toBeGreaterThan(0);
      expect(def.developerConsole).toMatch(/^https:\/\//);
    }
  });
});
