/**
 * Official OAuth architecture for publishing platforms.
 *
 * EarnRoom NEVER asks for or stores a platform password, never automates a
 * browser session and never scrapes. Each platform is connected by the founder
 * through that platform's own OAuth screen, and the only thing this module
 * knows is which application credentials exist server-side and what scopes the
 * official API requires.
 *
 * Pure module: it is handed the NAMES of configured secrets, never the values.
 */
import {
  INSTAGRAM_AUTHORIZE_URL,
  INSTAGRAM_LOGIN_SCOPES,
  INSTAGRAM_TOKEN_URL,
} from "./instagram-login";
import type { PlatformId } from "./types";

export type OAuthDefinition = {
  platform: PlatformId;
  label: string;
  /** The platform's own authorisation screen. */
  authorizeUrl: string;
  tokenUrl: string;
  /** Scopes the official API requires for video publishing. */
  scopes: readonly string[];
  /** Server-side secret names. Values never leave the server. */
  clientIdSecret: string;
  clientSecretSecret: string;
  /** Optional product-specific credentials that take precedence when set. */
  overrideClientIdSecret?: string;
  overrideClientSecretSecret?: string;
  /** Extra approval the platform imposes before unattended posting. */
  approvalNote: string | null;
  /** Where the founder registers the application. */
  developerConsole: string;
};

export const OAUTH_DEFINITIONS: readonly OAuthDefinition[] = [
  {
    platform: "youtube",
    label: "YouTube",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: [
      "https://www.googleapis.com/auth/youtube.upload",
      "https://www.googleapis.com/auth/youtube.readonly",
    ],
    clientIdSecret: "YOUTUBE_CLIENT_ID",
    clientSecretSecret: "YOUTUBE_CLIENT_SECRET",
    approvalNote:
      "Uploads from an unverified Google Cloud project are locked to private visibility until Google verifies the app.",
    developerConsole: "https://console.cloud.google.com/apis/credentials",
  },
  {
    platform: "youtube_shorts",
    label: "YouTube Shorts",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: ["https://www.googleapis.com/auth/youtube.upload"],
    clientIdSecret: "YOUTUBE_CLIENT_ID",
    clientSecretSecret: "YOUTUBE_CLIENT_SECRET",
    approvalNote:
      "Shorts use the same YouTube connection; a vertical upload under 60s becomes a Short.",
    developerConsole: "https://console.cloud.google.com/apis/credentials",
  },
  {
    // Instagram API with Instagram Login. The founder signs in on Instagram
    // itself and Meta returns an Instagram USER access token; no Facebook Page
    // is involved. The old Facebook-Login Instagram path is gone.
    platform: "instagram",
    label: "Instagram",
    authorizeUrl: INSTAGRAM_AUTHORIZE_URL,
    tokenUrl: INSTAGRAM_TOKEN_URL,
    scopes: INSTAGRAM_LOGIN_SCOPES,
    clientIdSecret: "META_APP_ID",
    clientSecretSecret: "META_APP_SECRET",
    // Meta issues a separate Instagram app id/secret for this product; when
    // those are configured they take precedence over the Meta app credentials.
    overrideClientIdSecret: "INSTAGRAM_APP_ID",
    overrideClientSecretSecret: "INSTAGRAM_APP_SECRET",
    approvalNote:
      "Requires an Instagram professional account and Meta App Review for content publishing. No Facebook Page is required.",
    developerConsole: "https://developers.facebook.com/apps",
  },
  {
    platform: "facebook",
    label: "Facebook",
    authorizeUrl: "https://www.facebook.com/v21.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v21.0/oauth/access_token",
    scopes: ["pages_show_list", "pages_manage_posts", "pages_read_engagement"],
    clientIdSecret: "META_APP_ID",
    clientSecretSecret: "META_APP_SECRET",
    approvalNote:
      "Publishing targets a Facebook Page you administer; Meta App Review is required for live use.",
    developerConsole: "https://developers.facebook.com/apps",
  },
  {
    platform: "tiktok",
    label: "TikTok",
    authorizeUrl: "https://www.tiktok.com/v2/auth/authorize/",
    tokenUrl: "https://open.tiktokapis.com/v2/oauth/token/",
    scopes: ["user.info.basic", "video.publish", "video.upload"],
    clientIdSecret: "TIKTOK_CLIENT_KEY",
    clientSecretSecret: "TIKTOK_CLIENT_SECRET",
    approvalNote:
      "Until TikTok audits the app, the Content Posting API can only send drafts to the account inbox — not publish publicly.",
    developerConsole: "https://developers.tiktok.com/apps",
  },
  {
    platform: "linkedin",
    label: "LinkedIn",
    authorizeUrl: "https://www.linkedin.com/oauth/v2/authorization",
    tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
    scopes: ["w_organization_social", "r_organization_social", "rw_organization_admin"],
    clientIdSecret: "LINKEDIN_CLIENT_ID",
    clientSecretSecret: "LINKEDIN_CLIENT_SECRET",
    approvalNote:
      "Company Page posting needs the Community Management API to be granted to the app.",
    developerConsole: "https://www.linkedin.com/developers/apps",
  },
  {
    platform: "pinterest",
    label: "Pinterest",
    authorizeUrl: "https://www.pinterest.com/oauth/",
    tokenUrl: "https://api.pinterest.com/v5/oauth/token",
    scopes: ["boards:read", "pins:read", "pins:write"],
    clientIdSecret: "PINTEREST_APP_ID",
    clientSecretSecret: "PINTEREST_APP_SECRET",
    approvalNote: "Standard API access must be granted before pins can be created from an app.",
    developerConsole: "https://developers.pinterest.com/apps",
  },
];

export function oauthDefinition(platform: PlatformId): OAuthDefinition {
  const found = OAUTH_DEFINITIONS.find((entry) => entry.platform === platform);
  if (!found) throw new Error(`No OAuth definition for ${platform}`);
  return found;
}

export type OAuthConfigState = {
  platform: PlatformId;
  /** True only when both application credentials exist server-side. */
  configured: boolean;
  missingSecrets: readonly string[];
  scopes: readonly string[];
  approvalNote: string | null;
  developerConsole: string;
  /** Plain-language status for the founder console. */
  label: string;
};

/**
 * @param configuredSecrets names of secrets that exist on the server. Values
 *   are never passed in and never leave the server.
 */
export function oauthConfigState(
  platform: PlatformId,
  configuredSecrets: readonly string[],
): OAuthConfigState {
  const def = oauthDefinition(platform);
  const overridePresent = Boolean(
    def.overrideClientIdSecret &&
    def.overrideClientSecretSecret &&
    configuredSecrets.includes(def.overrideClientIdSecret) &&
    configuredSecrets.includes(def.overrideClientSecretSecret),
  );
  const missing = overridePresent
    ? []
    : [def.clientIdSecret, def.clientSecretSecret].filter(
        (name) => !configuredSecrets.includes(name),
      );
  return {
    platform,
    configured: missing.length === 0,
    missingSecrets: missing,
    scopes: def.scopes,
    approvalNote: def.approvalNote,
    developerConsole: def.developerConsole,
    label:
      missing.length === 0
        ? "Application credentials configured — connect the account"
        : "Requires configuration",
  };
}

/** Builds the platform's own authorisation URL. No secret value is included. */
export function authorizeUrl(input: {
  platform: PlatformId;
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const def = oauthDefinition(input.platform);
  const url = new URL(def.authorizeUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", input.state);
  // TikTok and Instagram Login both take a comma-separated scope list.
  const separator = input.platform === "tiktok" || input.platform === "instagram" ? "," : " ";
  url.searchParams.set("scope", def.scopes.join(separator));
  if (input.platform === "youtube" || input.platform === "youtube_shorts") {
    url.searchParams.set("access_type", "offline");
    // `select_account consent` re-asks for the account and re-shows the
    // permission screen even when the account already granted access, and
    // granular consent renders each requested YouTube permission separately
    // so a verification recording can show them. No scope is added or removed.
    url.searchParams.set("prompt", "select_account consent");
    url.searchParams.set("enable_granular_consent", "true");
    url.searchParams.set("include_granted_scopes", "false");
  }
  return url.toString();
}

/**
 * Resolves the application credentials for a platform from server-side
 * configuration. Values are read here and never leave the server; only the
 * NAMES of any missing secrets are reported.
 */
export function resolveOAuthCredentials(
  platform: PlatformId,
  env: Record<string, string | undefined>,
): { clientId: string | null; clientSecret: string | null; missing: string[] } {
  const def = oauthDefinition(platform);
  if (def.overrideClientIdSecret && def.overrideClientSecretSecret) {
    const id = env[def.overrideClientIdSecret];
    const secret = env[def.overrideClientSecretSecret];
    if (id && secret) return { clientId: id, clientSecret: secret, missing: [] };
  }
  const clientId = env[def.clientIdSecret] ?? null;
  const clientSecret = env[def.clientSecretSecret] ?? null;
  const missing: string[] = [];
  if (!clientId) missing.push(def.clientIdSecret);
  if (!clientSecret) missing.push(def.clientSecretSecret);
  return { clientId, clientSecret, missing };
}
