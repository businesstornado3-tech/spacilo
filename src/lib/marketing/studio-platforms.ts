/**
 * One row per platform for the Marketing Studio "Publish" list.
 *
 * This is the single place where a platform's connection fact and its
 * publication fact are combined into one founder-facing card, so the studio can
 * never show the same platform twice with two different answers.
 *
 * It invents nothing: connection comes from the stored connection record,
 * publication comes from the stored publication record, and a row is only ever
 * PUBLISHED when the platform itself confirmed an id.
 *
 * Pure module: no clock, no network, no database.
 */

/** The seven platforms the founder sees, in display order. Exactly once each. */
export const STUDIO_PLATFORMS = [
  "youtube",
  "youtube_shorts",
  "instagram",
  "facebook",
  "tiktok",
  "linkedin",
  "pinterest",
] as const;

export type StudioPlatform = (typeof STUDIO_PLATFORMS)[number];

export const STUDIO_PLATFORM_LABEL: Record<StudioPlatform, string> = {
  youtube: "YouTube",
  youtube_shorts: "YouTube Shorts",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  pinterest: "Pinterest",
};

export type StudioPlatformState =
  | "NOT_CONNECTED"
  | "CONNECTED"
  | "READY"
  | "NOT_READY"
  | "PUBLISHING"
  | "PUBLISHED"
  | "FAILED";

export type StudioPlatformAction = "CONNECT" | "PUBLISH" | "WATCH" | "NONE";

export type StudioPlatformRow = {
  platform: StudioPlatform;
  label: string;
  state: StudioPlatformState;
  /** One short line under the name: the account, or why it is not ready. */
  detail: string;
  /** The real account/page/channel name, never an id. */
  account: string | null;
  action: StudioPlatformAction;
  actionLabel: string;
  /** The real platform URL, only ever the one the platform returned. */
  watchUrl: string | null;
  /** One concise reason when the row is NOT_READY. Null otherwise. */
  reason: string | null;
};

export type StudioConnectionInput = {
  platform: string;
  connection: string;
  accountLabel: string | null;
  paused: boolean;
  /** Whether the platform's own API publishing is usable at all today. */
  publishingSupported: boolean;
  /** Set when the platform still needs its own approval to publish publicly. */
  approvalNote?: string | null;
};

export type StudioPublicationInput = {
  platform: string;
  state: string;
  platformUrl: string | null;
  platformPostId: string | null;
};

/**
 * Builds all seven rows. `videoReady` is the canonical final-branded-artifact
 * fact; `campaignApproved` is the canonical campaign safety/approval fact.
 */
export function studioPlatformRows(input: {
  connections: readonly StudioConnectionInput[];
  publications: readonly StudioPublicationInput[];
  videoReady: boolean;
  campaignApproved: boolean;
  publishingPaused: boolean;
  /** Platform currently mid-publish, if any. */
  publishing?: StudioPlatform | null;
}): StudioPlatformRow[] {
  return STUDIO_PLATFORMS.map((platform) => {
    // Shorts read the YouTube authorisation — there is only ever one YouTube
    // sign-in and one channel.
    const key = platform === "youtube_shorts" ? "youtube" : platform;
    const connection = input.connections.find((entry) => entry.platform === key) ?? null;
    const publication = input.publications.find((entry) => entry.platform === platform) ?? null;
    const label = STUDIO_PLATFORM_LABEL[platform];
    const account = connection?.accountLabel ?? null;
    const connected = connection?.connection === "CONNECTED";

    const base = { platform, label, account, watchUrl: null as string | null };

    if (publication?.state === "PUBLISHED") {
      return {
        ...base,
        state: "PUBLISHED" as const,
        detail: account ? `Published to ${account}` : "Published",
        action: publication.platformUrl ? ("WATCH" as const) : ("NONE" as const),
        actionLabel: publication.platformUrl ? `Watch on ${label}` : "Published",
        watchUrl: publication.platformUrl,
        reason: null,
      };
    }

    if (!connected) {
      return {
        ...base,
        state: "NOT_CONNECTED" as const,
        detail:
          platform === "youtube_shorts"
            ? "Uses your YouTube channel — connect YouTube once."
            : "Not connected",
        action: platform === "youtube_shorts" ? ("NONE" as const) : ("CONNECT" as const),
        actionLabel: platform === "youtube_shorts" ? "Connect YouTube first" : "Connect",
        reason: "Account connection required.",
      };
    }

    const connectedDetail =
      platform === "youtube_shorts"
        ? account
          ? `Uses YouTube channel: ${account}`
          : "Uses your connected YouTube channel"
        : (account ?? "Connected");

    if (input.publishing === platform) {
      return {
        ...base,
        state: "PUBLISHING" as const,
        detail: `Publishing to ${label}…`,
        action: "NONE" as const,
        actionLabel: "Publishing…",
        reason: null,
      };
    }

    const blocked = ((): string | null => {
      if (!connection?.publishingSupported) return `${label} publishing is not available yet.`;
      if (connection?.approvalNote) return connection.approvalNote;
      if (input.publishingPaused || connection?.paused) return "Publishing is paused.";
      if (!input.campaignApproved) return "Campaign approval required.";
      if (!input.videoReady) return "Video is not ready.";
      return null;
    })();

    if (blocked) {
      return {
        ...base,
        state: "NOT_READY" as const,
        detail: connectedDetail,
        action: "NONE" as const,
        actionLabel: "Publish",
        reason: blocked,
      };
    }

    if (publication && publication.state !== "PUBLISHED" && publication.state.includes("FAIL")) {
      return {
        ...base,
        state: "FAILED" as const,
        detail: connectedDetail,
        action: "PUBLISH" as const,
        actionLabel: "Try again",
        reason: `${label} publishing failed. Please try again.`,
      };
    }

    return {
      ...base,
      state: "READY" as const,
      detail: connectedDetail,
      action: "PUBLISH" as const,
      actionLabel: "Publish",
      reason: null,
    };
  });
}
