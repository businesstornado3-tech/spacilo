/**
 * Marketing Studio — Publish.
 *
 * One card per platform, exactly once each: connection, publication and the
 * live link all in the same place. Connecting starts the platform's own
 * official sign-in; publishing calls the existing server publisher, which is
 * the only thing that can ever mark something published.
 *
 * Nothing technical is shown here: no ids, no scopes, no state-machine names.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import * as React from "react";

import { Alert } from "@/components/common/Alert";
import { usePublishingConnections } from "@/hooks/useMarketingVideos";
import { definition } from "@/lib/marketing/platforms";
import {
  STUDIO_PLATFORM_LABEL,
  studioPlatformRows,
  type StudioConnectionInput,
  type StudioPlatform,
} from "@/lib/marketing/studio-platforms";
import {
  getPublishingSurface,
  publishVideoToPlatform,
  PUBLISHABLE_PLATFORMS,
  type PublishablePlatform,
  type PublishingSurface,
} from "@/lib/publishing.functions";
import { cn } from "@/lib/utils";

const surfaceKey = (campaignId: string | null) =>
  ["marketing", "publishing", campaignId ?? "none"] as const;

function toneFor(state: string): string {
  if (state === "PUBLISHED")
    return "border-success/30 bg-success-soft text-success-soft-foreground";
  if (state === "CONNECTED" || state === "FAILED" || state === "PUBLISHING")
    return "border-success/30 bg-success-soft text-success-soft-foreground";
  return "border-border bg-secondary text-muted-foreground";
}

const STATE_WORD: Record<string, string> = {
  NOT_CONNECTED: "Not connected",
  CONNECTED: "Connected ✓",
  PUBLISHING: "Connected ✓",
  PUBLISHED: "Published ✓",
  FAILED: "Connected ✓",
};

export function PublishSection({
  campaignId,
  campaignApproved,
}: {
  campaignId: string | null;
  campaignApproved: boolean;
}) {
  const queryClient = useQueryClient();
  const connections = usePublishingConnections(true);
  const fetchSurface = useServerFn(getPublishingSurface);
  const publish = useServerFn(publishVideoToPlatform);
  const [busy, setBusy] = React.useState<StudioPlatform | null>(null);
  /** Which video the founder is looking at. Null means "the newest one". */
  const [selectedVideoId, setSelectedVideoId] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<{ ok: boolean; text: string } | null>(null);

  const surfaceQuery = useQuery<PublishingSurface>({
    queryKey: surfaceKey(campaignId),
    queryFn: () => fetchSurface({ data: { campaignId } }),
  });

  const mutation = useMutation({
    mutationFn: (input: { videoId: string; platform: PublishablePlatform }) =>
      publish({ data: input }),
    onSettled: () => {
      setBusy(null);
      queryClient.invalidateQueries({ queryKey: surfaceKey(campaignId) });
    },
  });

  const surface = surfaceQuery.data;
  const snapshot = connections.query.data;
  if (!surface || !snapshot) {
    return <p className="type-body-sm text-muted-foreground">Loading your platforms…</p>;
  }

  const branded = surface.assets.filter((asset) => asset.brandedArtifactReady);
  // Every video in this campaign can be published in its own right. The
  // founder chooses which one; the newest is simply where the page opens.
  const current =
    branded.find((asset) => asset.videoId === selectedVideoId) ??
    branded.find((asset) => asset.videoId === surface.currentVideoId) ??
    branded[0] ??
    null;
  const assetFor = (_platform: StudioPlatform) => current;

  const connectionInputs: StudioConnectionInput[] = snapshot.platforms.map((entry) => ({
    platform: entry.platform,
    connection: entry.connection,
    accountLabel: entry.accountLabel,
    paused: entry.paused,
    publishingSupported: definition(entry.platform).apiPublishingSupported,
    approvalNote:
      entry.platform === "tiktok" && entry.connection === "CONNECTED"
        ? "Publishing approval required."
        : null,
  }));

  // Only the current video's own results. Historical records from an earlier
  // video of the same campaign are shown separately, never as this one's state.
  const publications = (current?.publications ?? [])
    .filter((entry) => !entry.historical)
    .map((entry) => ({
      platform: entry.platform,
      state: entry.state,
      platformUrl: entry.platformUrl,
      platformPostId: entry.platformPostId,
      error: entry.error,
    }));

  const historical = branded.flatMap((asset) =>
    asset.publications
      .filter((entry) => entry.historical && entry.state === "PUBLISHED")
      .map((entry) => ({ ...entry, videoId: asset.videoId })),
  );

  const rows = studioPlatformRows({
    connections: connectionInputs,
    publications,
    videoReady: Boolean(current),
    campaignApproved,
    publishingPaused: surface.publishingPaused,
    publishing: busy,
  });

  const connect = (platform: StudioPlatform) => {
    const target = platform === "youtube_shorts" ? "youtube" : platform;
    connections.start.mutateAsync(target).then((result) => {
      if (result.ok && result.url) window.location.assign(result.url);
      else setNotice({ ok: false, text: result.detail });
    });
  };

  const startPublish = (platform: StudioPlatform) => {
    const asset = assetFor(platform);
    if (!asset) {
      setNotice({ ok: false, text: "The campaign video is not ready yet." });
      return;
    }
    if (!(PUBLISHABLE_PLATFORMS as readonly string[]).includes(platform)) {
      setNotice({
        ok: false,
        text: `${STUDIO_PLATFORM_LABEL[platform]} publishing is not available yet.`,
      });
      return;
    }
    // Manual publishing always confirms the exact video being sent.
    const confirmed = window.confirm(
      `Publish this exact video to ${STUDIO_PLATFORM_LABEL[platform]}?\n\n` +
        `“${asset.title}” · ${asset.seconds}s · ${asset.aspect} · made ${new Date(
          asset.createdAt,
        ).toLocaleString("en-GB")}`,
    );
    if (!confirmed) return;
    setNotice(null);
    setBusy(platform);
    mutation.mutate(
      { videoId: asset.videoId, platform: platform as PublishablePlatform },
      {
        // The platform's own reason is shown, never a generic apology. The
        // reference is a short, non-secret handle for this one attempt.
        onSuccess: (result) =>
          setNotice({
            ok: result.ok,
            text: result.ok
              ? `Published to ${STUDIO_PLATFORM_LABEL[platform]}. ${result.detail}`
              : `${STUDIO_PLATFORM_LABEL[platform]} did not publish. Reason: ${result.detail} ${
                  result.retryable
                    ? "This can be tried again."
                    : "Trying again unchanged will not help — the reason above needs fixing first."
                } Reference: ${result.attemptRef}`,
          }),
        onError: (error) =>
          setNotice({
            ok: false,
            text: `${STUDIO_PLATFORM_LABEL[platform]} publishing could not be attempted: ${
              error instanceof Error ? error.message : "the request did not reach EarnRoom."
            }`,
          }),
      },
    );
  };

  return (
    <div className="space-y-3">
      {notice ? (
        <Alert tone={notice.ok ? "success" : "error"} title={notice.ok ? "Published" : "Not done"}>
          {notice.text}
        </Alert>
      ) : null}

      {current ? (
        <div className="rounded-xl border border-border bg-secondary/40 p-4">
          <p className="type-body-sm font-semibold">This video: “{current.title}”</p>
          <p className="mt-1 type-body-xs text-muted-foreground">
            {current.seconds} seconds · {current.aspect} · made{" "}
            {new Date(current.createdAt).toLocaleString("en-GB")}
          </p>
          <p className="mt-1 type-body-xs text-muted-foreground">
            The cards below show where this video has been published. Anything published earlier in
            this campaign was a different video.
          </p>
          {historical.length > 0 ? (
            <p className="mt-1 type-body-xs text-muted-foreground">
              Earlier videos in this campaign were already published to:{" "}
              {[
                ...new Set(
                  historical.map(
                    (entry) =>
                      STUDIO_PLATFORM_LABEL[entry.platform as StudioPlatform] ?? entry.platform,
                  ),
                ),
              ].join(", ")}
              .
            </p>
          ) : null}
        </div>
      ) : null}

      <ul className="grid gap-3 sm:grid-cols-2">
        {rows.map((row) => (
          <li key={row.platform} className="rounded-xl border border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="type-body-sm font-semibold">{row.label}</span>
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 type-body-xs font-medium",
                  toneFor(row.state),
                )}
              >
                {STATE_WORD[row.state] ?? row.state}
              </span>
            </div>
            <p className="mt-1 type-body-sm text-muted-foreground">{row.detail}</p>
            <p className="mt-1 type-body-xs text-muted-foreground">Publishing: {row.publishing}</p>

            {row.action === "WATCH" && row.watchUrl ? (
              <a
                href={row.watchUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-border px-3 type-nav font-semibold hover:bg-secondary"
              >
                {row.actionLabel}
              </a>
            ) : null}

            {row.action === "CONNECT" ? (
              <button
                type="button"
                onClick={() => connect(row.platform)}
                className="mt-3 min-h-11 rounded-lg bg-primary px-4 type-nav font-semibold text-primary-foreground"
              >
                Connect
              </button>
            ) : null}

            {row.action === "PUBLISH" ? (
              <button
                type="button"
                disabled={busy !== null || !row.canPublish}
                title={row.reason ?? undefined}
                onClick={() => startPublish(row.platform)}
                className="mt-3 min-h-11 rounded-lg bg-primary px-4 type-nav font-semibold text-primary-foreground disabled:opacity-60"
              >
                {row.actionLabel}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
