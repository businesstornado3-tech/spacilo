/**
 * Platform registry, capability detection and publishing modes.
 *
 * Honest by construction: a platform is only ever reported as connected when a
 * real server-side credential/connection record says so. With nothing
 * configured, every platform reads "Requires configuration" — never a
 * simulated connection.
 */
import type {
  AspectRatio,
  ConnectionState,
  MarketingSettings,
  PlatformCapability,
  PlatformId,
  PublishingMode,
} from "./types";

export type PlatformDefinition = {
  id: PlatformId;
  label: string;
  aspects: readonly AspectRatio[];
  maxSeconds: number;
  /** Whether the official API supports programmatic publishing at all. */
  apiPublishingSupported: boolean;
  /** Whether unattended publishing is possible via the official API. */
  apiAutonomousSupported: boolean;
  note: string;
};

export const PLATFORMS: readonly PlatformDefinition[] = [
  {
    id: "youtube",
    label: "YouTube",
    aspects: ["16:9"],
    maxSeconds: 900,
    apiPublishingSupported: true,
    apiAutonomousSupported: true,
    note: "YouTube Data API upload.",
  },
  {
    id: "youtube_shorts",
    label: "YouTube Shorts",
    aspects: ["9:16"],
    maxSeconds: 60,
    apiPublishingSupported: true,
    apiAutonomousSupported: true,
    note: "Shorts via YouTube Data API.",
  },
  {
    id: "instagram",
    label: "Instagram",
    aspects: ["9:16", "1:1"],
    maxSeconds: 90,
    apiPublishingSupported: true,
    apiAutonomousSupported: true,
    note: "Instagram Graph API content publishing (business account required).",
  },
  {
    id: "tiktok",
    label: "TikTok",
    aspects: ["9:16"],
    maxSeconds: 180,
    apiPublishingSupported: true,
    apiAutonomousSupported: false,
    note: "TikTok Content Posting API — unaudited apps can only send drafts to the account inbox.",
  },
  {
    id: "facebook",
    label: "Facebook",
    aspects: ["9:16", "16:9"],
    maxSeconds: 240,
    apiPublishingSupported: true,
    apiAutonomousSupported: true,
    note: "Facebook Pages video publishing.",
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    aspects: ["16:9", "1:1"],
    maxSeconds: 600,
    apiPublishingSupported: true,
    apiAutonomousSupported: true,
    note: "LinkedIn organisation posts.",
  },
  {
    id: "pinterest",
    label: "Pinterest",
    aspects: ["9:16", "1:1"],
    maxSeconds: 300,
    apiPublishingSupported: true,
    apiAutonomousSupported: true,
    note: "Pinterest video pins.",
  },
];

/** What the server knows about a platform connection. Never holds a token. */
export type PlatformConnectionRecord = {
  platform: PlatformId;
  connection: ConnectionState;
  /** Scopes actually granted, for permission checks. */
  scopes: readonly string[];
  expiresAt: number | null;
  lastError: string | null;
};

export function definition(platform: PlatformId): PlatformDefinition {
  const found = PLATFORMS.find((candidate) => candidate.id === platform);
  if (!found) throw new Error(`Unknown platform: ${platform}`);
  return found;
}

export function effectiveMode(platform: PlatformId, settings: MarketingSettings): PublishingMode {
  return settings.platformModes[platform] ?? settings.globalMode;
}

function statusLabel(capability: Omit<PlatformCapability, "statusLabel">): string {
  if (capability.paused) return "Publishing paused";
  switch (capability.connection) {
    case "NOT_CONNECTED":
      return "Not connected";
    case "REQUIRES_CONFIGURATION":
      return "Requires configuration";
    case "AUTH_EXPIRED":
      return "Authentication expired";
    case "INSUFFICIENT_PERMISSIONS":
      return "Permissions insufficient";
    default:
      break;
  }
  if (!capability.publishingSupported) return "Connected — publishing unsupported";
  if (capability.mode === "AUTONOMOUS" && capability.autonomousAvailable)
    return "Connected — autonomous publishing available";
  if (capability.mode === "AUTONOMOUS") return "Connected — autonomous publishing unavailable";
  if (capability.mode === "DRAFT") return "Connected — drafts only";
  return "Connected — approval required";
}

export function capabilityFor(
  platform: PlatformId,
  connections: readonly PlatformConnectionRecord[],
  settings: MarketingSettings,
  now: number,
): PlatformCapability {
  const def = definition(platform);
  const record = connections.find((candidate) => candidate.platform === platform);
  const expired = Boolean(record?.expiresAt && record.expiresAt <= now);
  const connection: ConnectionState = !record
    ? "REQUIRES_CONFIGURATION"
    : expired
      ? "AUTH_EXPIRED"
      : record.connection;

  const paused = settings.pauseAllPublishing || settings.pausedPlatforms.includes(platform);
  const mode = effectiveMode(platform, settings);
  const connected = connection === "CONNECTED";
  const publishingSupported = connected && def.apiPublishingSupported;
  const autonomousAvailable =
    publishingSupported && def.apiAutonomousSupported && mode === "AUTONOMOUS" && !paused;

  const base: Omit<PlatformCapability, "statusLabel"> = {
    platform,
    label: def.label,
    connection,
    publishingSupported,
    autonomousAvailable,
    mode,
    paused,
    reason: !record
      ? "No credentials or OAuth connection configured for this platform yet."
      : expired
        ? "The stored authorisation has expired and must be reconnected."
        : record.lastError
          ? record.lastError
          : def.note,
    aspects: def.aspects,
    maxSeconds: def.maxSeconds,
  };

  return { ...base, statusLabel: statusLabel(base) };
}

export function allCapabilities(
  connections: readonly PlatformConnectionRecord[],
  settings: MarketingSettings,
  now: number,
): PlatformCapability[] {
  return PLATFORMS.map((def) => capabilityFor(def.id, connections, settings, now));
}

export function defaultMarketingSettings(): MarketingSettings {
  return {
    dailyCampaignTarget: 1,
    maxDailyPublications: 4,
    // Nothing publishes unattended until the founder deliberately changes this.
    globalMode: "APPROVAL_REQUIRED",
    platformModes: {},
    pauseAllPublishing: false,
    pausedPlatforms: [],
    contentMix: {
      market_intelligence: 3,
      seo: 3,
      demand_creation: 2,
      host_acquisition: 2,
      renter_acquisition: 2,
      brand_awareness: 1,
    },
    geographicCooldownDays: 14,
  };
}
