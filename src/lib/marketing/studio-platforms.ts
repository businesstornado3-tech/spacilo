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

/**
 * The account state only. Whether today's campaign can be published is a
 * separate fact and must never turn a connected account into "not ready".
 */
export type StudioPlatformState =
  "NOT_CONNECTED" | "CONNECTED" | "PUBLISHING" | "PUBLISHED" | "FAILED";

export type StudioPlatformAction = "CONNECT" | "PUBLISH" | "WATCH" | "NONE";

export type StudioPlatformRow = {
  platform: StudioPlatform;
  label: string;
  /** Connection only. */
  state: StudioPlatformState;
  /** One short line under the name: the account. */
  detail: string;
  /** The real account/page/channel name, never an id. */
  account: string | null;
  action: StudioPlatformAction;
  actionLabel: string;
  /** False when the Publish button must be visible but not usable yet. */
  canPublish: boolean;
  /** The publishing line: READY, or the plain reason it cannot run yet. */
  publishing: string;
  /** The real platform URL, only ever the one the platform returned. */
  watchUrl: string | null;
  /** One concise reason when publishing cannot run. Null otherwise. */
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
  /** The real, already-sanitised reason the platform gave. Never a token. */
  error?: string | null;
};

/** Publication states that mean the last attempt did not succeed. */
export const FAILED_PUBLICATION_STATES = [
  "UPLOAD_FAILED",
  "PLATFORM_REJECTED",
  "VALIDATION_FAILED",
  "AUTH_REQUIRED",
  "FAILED",
] as const;

/** Turns a stored publication state into one plain founder-facing sentence. */
export function failureHeadline(state: string, label: string): string {
  switch (state) {
    case "AUTH_REQUIRED":
      return `${label} did not accept the stored sign-in.`;
    case "PLATFORM_REJECTED":
      return `${label} rejected the video.`;
    case "VALIDATION_FAILED":
      return `The video did not meet ${label}'s requirements.`;
    case "UPLOAD_FAILED":
      return `The upload to ${label} did not finish.`;
    default:
      return `${label} did not confirm a publication.`;
  }
}

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
        canPublish: false,
        publishing: "Published",
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
        canPublish: false,
        publishing: "Account connection required",
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
        detail: connectedDetail,
        action: "NONE" as const,
        actionLabel: "Publishing…",
        canPublish: false,
        publishing: "Publishing…",
        reason: null,
      };
    }

    // The account stays CONNECTED whatever the campaign is doing. Only the
    // publishing line changes.
    const blocked = ((): string | null => {
      if (!connection?.publishingSupported)
        return `Publishing unavailable — ${label} publishing setup required.`;
      if (connection?.approvalNote) return connection.approvalNote;
      if (input.publishingPaused || connection?.paused) return "Publishing is paused.";
      if (!input.campaignApproved) return "Campaign approval required.";
      if (!input.videoReady) return "Campaign video required.";
      return null;
    })();

    const failed =
      publication && publication.state !== "PUBLISHED" && publication.state.includes("FAIL");

    return {
      ...base,
      state: failed ? ("FAILED" as const) : ("CONNECTED" as const),
      detail: connectedDetail,
      action: "PUBLISH" as const,
      actionLabel: failed && !blocked ? "Try again" : "Publish",
      canPublish: !blocked,
      publishing: blocked ?? (failed ? "Last attempt failed" : "Ready"),
      reason: blocked ?? (failed ? `${label} publishing failed. Please try again.` : null),
    };
  });
}
