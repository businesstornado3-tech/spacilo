/**
 * Founder review of a campaign — pure presentation logic.
 *
 * This module decides what the founder is told about a campaign before it
 * goes anywhere: how big a preview player should be, whether a platform
 * version actually exists, what the approval state means in plain English,
 * and whether publication to each platform could honestly succeed.
 *
 * It never claims a video exists, never claims a platform is connected, and
 * never turns a missing step into an optimistic label.
 */
import type {
  AspectRatio,
  MarketingSettings,
  PlatformAsset,
  PlatformCapability,
  PublicationRecord,
} from "./types";

export type ReviewTone = "good" | "warn" | "bad" | "neutral";

/* --------------------------------------------------------------- player */

export type PlayerBox = {
  aspect: AspectRatio;
  /** Rendered width in CSS pixels — compact, never full page width. */
  widthPx: number;
  heightPx: number;
};

/**
 * A compact, aspect-correct player box. Portrait clips stay inside the
 * 360–480px height the founder console allows; landscape never exceeds 720px
 * wide.
 */
export function playerBox(aspect: AspectRatio): PlayerBox {
  if (aspect === "9:16") return { aspect, widthPx: 270, heightPx: 480 };
  if (aspect === "1:1") return { aspect, widthPx: 420, heightPx: 420 };
  return { aspect, widthPx: 720, heightPx: 405 };
}

/* -------------------------------------------------------------- versions */

export type VersionStatus =
  | "NOT GENERATED"
  | "BEING MADE"
  | "READY TO REVIEW"
  | "PUBLISHED"
  | "FAILED"
  | "CANCELLED";

export type VersionRow = {
  assetId: string;
  platform: string;
  label: string;
  /** "9:16 · 20s" — the shape and length this platform gets. */
  meta: string;
  status: VersionStatus;
  tone: ReviewTone;
  hasVideo: boolean;
  detail: string;
};

/** One platform version, described exactly as it stands. */
export function versionRow(asset: PlatformAsset, label: string): VersionRow {
  const meta = `${asset.aspect} · ${asset.seconds}s`;
  const base = { assetId: asset.id, platform: asset.platform, label, meta };

  if (asset.state === "PUBLISHED")
    return {
      ...base,
      status: "PUBLISHED",
      tone: "good",
      hasVideo: asset.videoUrl !== null,
      detail: "Published on this platform.",
    };
  if (asset.state === "CANCELLED")
    return {
      ...base,
      status: "CANCELLED",
      tone: "neutral",
      hasVideo: asset.videoUrl !== null,
      detail: "This version was cancelled.",
    };
  if (asset.videoStatus === "GENERATING")
    return {
      ...base,
      status: "BEING MADE",
      tone: "warn",
      hasVideo: false,
      detail: "This version is being made now.",
    };
  if (asset.videoStatus === "FAILED")
    return {
      ...base,
      status: "FAILED",
      tone: "bad",
      hasVideo: false,
      detail: "Making this version did not finish. You can try again.",
    };
  if (asset.videoUrl)
    return {
      ...base,
      status: "READY TO REVIEW",
      tone: "good",
      hasVideo: true,
      detail: "Watch it before you approve it.",
    };
  return {
    ...base,
    status: "NOT GENERATED",
    tone: "warn",
    hasVideo: false,
    detail:
      asset.videoStatus === "PROVIDER_NOT_CONFIGURED"
        ? "No video has been made yet — no route for making videos is ready."
        : "No video has been made for this platform yet.",
  };
}

/* -------------------------------------------------------------- decision */

export type DecisionInput = {
  status: string;
  validationPassed: boolean;
  approvedAt: string | null;
  decidedAt: string | null;
  note: string | null;
  videosReady: number;
  videosTotal: number;
  publishingPaused: boolean;
};

export type DecisionView = {
  headline: string;
  detail: string;
  tone: ReviewTone;
  canApprove: boolean;
  canReject: boolean;
  canPublish: boolean;
  /** Why approval is not possible, when it is not. */
  approveBlockedReason: string | null;
  publishBlockedReason: string | null;
};

function whenText(iso: string | null): string {
  if (!iso) return "";
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return "";
  return ` on ${new Date(time).toLocaleString("en-GB")}`;
}

/** Turns the stored decision state into something a person can act on. */
export function decisionView(input: DecisionInput): DecisionView {
  const status = input.status.toUpperCase();
  const approveBlockedReason = !input.validationPassed
    ? "The safety and accuracy checks did not pass, so this campaign cannot be approved."
    : input.videosTotal > 0 && input.videosReady === 0
      ? "No video has been made yet. Make at least one video before you approve it."
      : null;

  if (status === "REJECTED")
    return {
      headline: "You rejected this campaign",
      detail:
        (input.note ? `Your reason: ${input.note}.` : "It will not be published.") +
        (input.decidedAt ? ` Decided${whenText(input.decidedAt)}.` : ""),
      tone: "bad",
      canApprove: approveBlockedReason === null,
      canReject: false,
      canPublish: false,
      approveBlockedReason,
      publishBlockedReason: "You rejected this campaign.",
    };

  if (status === "PUBLISHED")
    return {
      headline: "This campaign has been published",
      detail: "Nothing further is needed. Results appear under Learning once platforms report.",
      tone: "good",
      canApprove: false,
      canReject: false,
      canPublish: true,
      approveBlockedReason: null,
      publishBlockedReason: null,
    };

  if (status === "APPROVED") {
    const publishBlockedReason = input.publishingPaused
      ? "Publishing is paused. Resume it in Publishing settings first."
      : input.videosReady === 0 && input.videosTotal > 0
        ? "No video has been made yet, so there is nothing to publish."
        : null;
    return {
      headline: "You approved this campaign",
      detail: `Approved${whenText(input.approvedAt ?? input.decidedAt)}. ${
        publishBlockedReason ?? "You can attempt publication whenever you are ready."
      }`,
      tone: "good",
      canApprove: false,
      canReject: true,
      canPublish: publishBlockedReason === null,
      approveBlockedReason: null,
      publishBlockedReason,
    };
  }

  return {
    headline: "Waiting for your decision",
    detail:
      approveBlockedReason ??
      `${input.videosReady} of ${input.videosTotal} version(s) ready. Watch them, then approve or reject.`,
    tone: approveBlockedReason ? "warn" : "neutral",
    canApprove: approveBlockedReason === null,
    canReject: true,
    canPublish: false,
    approveBlockedReason,
    publishBlockedReason: "Approve the campaign before publishing it.",
  };
}

/* ------------------------------------------------------------ readiness */

export type PlatformReadiness = {
  platform: string;
  label: string;
  ready: boolean;
  summary: string;
  /** Everything standing in the way, each in one plain sentence. */
  blockers: string[];
  tone: ReviewTone;
};

export type ReadinessInput = {
  campaignStatus: string;
  settings: Pick<MarketingSettings, "pauseAllPublishing" | "globalMode">;
  capabilities: readonly PlatformCapability[];
  assets: readonly PlatformAsset[];
  publications: readonly PublicationRecord[];
};

/**
 * Per-platform publication readiness, described honestly. A platform is only
 * "ready" when the campaign is approved, a video exists for it, publishing is
 * on, and that platform is genuinely connected and allowed to publish.
 */
export function publicationReadiness(input: ReadinessInput): PlatformReadiness[] {
  const status = input.campaignStatus.toUpperCase();
  return input.assets.map((asset) => {
    const capability = input.capabilities.find((entry) => entry.platform === asset.platform);
    const publication = input.publications.find(
      (entry) => entry.assetId === asset.id && entry.platform === asset.platform,
    );
    const label = capability?.label ?? asset.platform;
    const blockers: string[] = [];

    if (status !== "APPROVED" && status !== "PUBLISHED")
      blockers.push("The campaign has not been approved yet.");
    if (status === "REJECTED") blockers.push("You rejected this campaign.");
    if (input.settings.pauseAllPublishing) blockers.push("Publishing is paused for everything.");
    if (input.settings.globalMode === "DRAFT")
      blockers.push("Publishing settings are on draft only, so nothing is sent out.");
    if (!asset.videoUrl) blockers.push("No video has been made for this platform yet.");
    if (!capability) blockers.push("EarnRoom has no publishing route for this platform.");
    else {
      if (capability.paused) blockers.push(`${label} is paused.`);
      if (!capability.publishingSupported)
        blockers.push(`${label} does not allow EarnRoom to post for you.`);
      if (capability.connection !== "CONNECTED")
        blockers.push(
          capability.connection === "AUTH_EXPIRED"
            ? `Your ${label} sign-in has expired — connect it again.`
            : `Your ${label} account is not connected.`,
        );
    }

    if (publication?.state === "PUBLISHED")
      return {
        platform: asset.platform,
        label,
        ready: true,
        summary: publication.platformUrl
          ? `Published — ${publication.platformUrl}`
          : "Published on this platform.",
        blockers: [],
        tone: "good",
      };

    return {
      platform: asset.platform,
      label,
      ready: blockers.length === 0,
      summary:
        blockers.length === 0
          ? "Ready to publish."
          : blockers.length === 1
            ? blockers[0]!
            : `${blockers.length} things need sorting first.`,
      blockers,
      tone: blockers.length === 0 ? "good" : "warn",
    };
  });
}
