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
  if (state === "PUBLISHED") return "border-success/30 bg-success-soft text-success-soft-foreground";
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
  const assetFor = (platform: StudioPlatform) =>
    branded.find((asset) => asset.producedFor === platform) ?? branded[0] ?? null;

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

  const publications = branded.flatMap((asset) =>
    asset.publications.map((entry) => ({
      platform: entry.platform,
      state: entry.state,
      platformUrl: entry.platformUrl,
      platformPostId: entry.platformPostId,
    })),
  );

  const rows = studioPlatformRows({
    connections: connectionInputs,
    publications,
    videoReady: branded.length > 0,
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
    setNotice(null);
    setBusy(platform);
    mutation.mutate(
      { videoId: asset.videoId, platform: platform as PublishablePlatform },
      {
        onSuccess: (result) =>
          setNotice({
            ok: result.ok,
            text: result.ok
              ? `Published to ${STUDIO_PLATFORM_LABEL[platform]}.`
              : `${STUDIO_PLATFORM_LABEL[platform]} publishing did not complete. Please try again.`,
          }),
        onError: () =>
          setNotice({
            ok: false,
            text: `${STUDIO_PLATFORM_LABEL[platform]} publishing failed. Please try again.`,
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
            {row.reason ? (
              <p className="mt-1 type-body-xs text-muted-foreground">Reason: {row.reason}</p>
            ) : null}

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
                disabled={busy !== null}
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
