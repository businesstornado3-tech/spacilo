/**
 * Publication state machine and platform adapter contract.
 *
 * Two rules are absolute here:
 *   1. `PUBLISHED` is only ever reached from a platform's own success response
 *      carrying a post id. There is no simulated publish path.
 *   2. Pause stops publishing but never stops generation.
 */
import { capabilityFor, type PlatformConnectionRecord } from "./platforms";
import type {
  MarketingCampaign,
  MarketingSettings,
  PlatformAsset,
  PlatformId,
  PublicationRecord,
  PublicationState,
  PublishResult,
  PublishingAdapter,
} from "./types";

const ALLOWED: Record<PublicationState, readonly PublicationState[]> = {
  GENERATED: ["VALIDATING", "CANCELLED", "PAUSED"],
  VALIDATING: ["VALIDATED", "VALIDATION_FAILED"],
  VALIDATED: ["APPROVAL_REQUIRED", "QUEUED", "PAUSED", "CANCELLED"],
  APPROVAL_REQUIRED: ["APPROVED", "CANCELLED", "PAUSED"],
  APPROVED: ["QUEUED", "PAUSED", "CANCELLED"],
  QUEUED: ["UPLOADING", "PAUSED", "CANCELLED", "AUTH_REQUIRED"],
  UPLOADING: ["PUBLISHED", "UPLOAD_FAILED", "PLATFORM_REJECTED", "AUTH_REQUIRED"],
  PUBLISHED: [],
  VALIDATION_FAILED: ["VALIDATING", "CANCELLED"],
  AUTH_REQUIRED: ["QUEUED", "CANCELLED"],
  UPLOAD_FAILED: ["QUEUED", "CANCELLED"],
  PLATFORM_REJECTED: ["CANCELLED", "VALIDATING"],
  PAUSED: ["QUEUED", "CANCELLED", "VALIDATED"],
  CANCELLED: [],
};

export function canTransition(from: PublicationState, to: PublicationState): boolean {
  return ALLOWED[from]?.includes(to) ?? false;
}

export function transition(
  record: PublicationRecord,
  to: PublicationState,
  at: number,
  detail?: string,
): PublicationRecord {
  if (!canTransition(record.state, to)) {
    throw new Error(`Illegal publication transition ${record.state} → ${to}`);
  }
  return {
    ...record,
    state: to,
    updatedAt: at,
    error: to === "PUBLISHED" ? null : (detail ?? record.error),
  };
}

/** The state an asset should land in after validation, given the mode. */
export function stateAfterValidation(
  passed: boolean,
  platform: PlatformId,
  settings: MarketingSettings,
): PublicationState {
  if (!passed) return "VALIDATION_FAILED";
  if (settings.pauseAllPublishing || settings.pausedPlatforms.includes(platform)) return "PAUSED";
  const mode = settings.platformModes[platform] ?? settings.globalMode;
  if (mode === "DRAFT") return "VALIDATED";
  // Autonomous publishing still waits for an approval unless the founder has
  // also switched auto-approve on.
  if (mode === "AUTONOMOUS" && settings.autoApprove) return "QUEUED";
  return "APPROVAL_REQUIRED";
}

export type PublishAttempt = {
  record: PublicationRecord;
  /** Present only when the platform confirmed publication. */
  result: PublishResult;
};

/**
 * Attempts one publication through an adapter. Every refusal path returns a
 * failure state with a reason; none of them return PUBLISHED.
 */
export async function attemptPublish(options: {
  adapter: PublishingAdapter;
  asset: PlatformAsset;
  campaign: MarketingCampaign;
  connections: readonly PlatformConnectionRecord[];
  settings: MarketingSettings;
  record: PublicationRecord;
  now: number;
}): Promise<PublishAttempt> {
  const { adapter, asset, campaign, settings, record, now } = options;
  const capability = capabilityFor(adapter.platform, options.connections, settings, now);

  if (capability.paused) {
    return {
      record: { ...record, state: "PAUSED", updatedAt: now, error: "Publishing is paused." },
      result: { ok: false, state: "PAUSED", error: "Publishing is paused.", retryable: true },
    };
  }
  if (capability.connection !== "CONNECTED") {
    return {
      record: { ...record, state: "AUTH_REQUIRED", updatedAt: now, error: capability.reason },
      result: { ok: false, state: "AUTH_REQUIRED", error: capability.reason, retryable: true },
    };
  }
  if (!capability.publishingSupported) {
    return {
      record: { ...record, state: "UPLOAD_FAILED", updatedAt: now, error: capability.reason },
      result: { ok: false, state: "UPLOAD_FAILED", error: capability.reason, retryable: false },
    };
  }
  if (!asset.videoUrl) {
    const reason = "No rendered video is available for this asset.";
    return {
      record: { ...record, state: "UPLOAD_FAILED", updatedAt: now, error: reason },
      result: { ok: false, state: "UPLOAD_FAILED", error: reason, retryable: true },
    };
  }

  const uploading: PublicationRecord = { ...record, state: "UPLOADING", updatedAt: now };
  let result: PublishResult;
  try {
    result = await adapter.publish(asset, campaign);
  } catch (error) {
    result = {
      ok: false,
      state: "UPLOAD_FAILED",
      error: error instanceof Error ? error.message : "Upload failed.",
      retryable: true,
    };
  }

  if (result.ok && result.platformPostId) {
    return {
      record: {
        ...uploading,
        state: "PUBLISHED",
        platformPostId: result.platformPostId,
        platformUrl: result.platformUrl,
        updatedAt: result.publishedAt,
        error: null,
      },
      result,
    };
  }

  const failure = result.ok
    ? {
        ok: false as const,
        state: "UPLOAD_FAILED" as const,
        error: "Platform did not return a post id.",
        retryable: true,
      }
    : result;
  return {
    record: {
      ...uploading,
      state: failure.state,
      updatedAt: now,
      error: failure.error,
      retryCount: record.retryCount + 1,
    },
    result: failure,
  };
}

/** Exponential backoff in ms for a retryable failure. */
export function retryDelayMs(retryCount: number): number {
  return Math.min(6 * 3_600_000, 60_000 * 2 ** Math.max(0, retryCount));
}

export function shouldRetry(record: PublicationRecord, maxRetries = 3): boolean {
  if (record.state === "PUBLISHED" || record.state === "CANCELLED") return false;
  if (record.state === "PLATFORM_REJECTED") return false;
  return record.retryCount < maxRetries;
}

/**
 * The only adapter shipped by default: it refuses honestly. Real adapters are
 * registered once official API credentials are configured server-side.
 */
export function unconfiguredAdapter(
  platform: PlatformId,
  settings: MarketingSettings,
): PublishingAdapter {
  return {
    platform,
    capability: () => capabilityFor(platform, [], settings, Date.now()),
    publish: async () => ({
      ok: false,
      state: "AUTH_REQUIRED",
      error: "Requires configuration: no official API connection for this platform yet.",
      retryable: true,
    }),
  };
}
