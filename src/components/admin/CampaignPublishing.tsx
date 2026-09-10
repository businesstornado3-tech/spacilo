/**
 * Founder Console — the publishing control surface.
 *
 * One place to publish a finished campaign video to YouTube, YouTube Shorts,
 * Instagram or Facebook. Connection and publishing capability are shown as two
 * separate facts, because "connected" never means "ready to publish".
 *
 * Nothing here can fake a publication: the button calls the server, the server
 * calls the platform, and the state shown is whatever the platform confirmed.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import * as React from "react";

import { Alert } from "@/components/common/Alert";
import {
  getPublishingSurface,
  publishVideoToPlatform,
  type PublishOutcome,
  type PublishablePlatform,
  type PublishableAsset,
  type PlatformPublishingState,
  type PublishingSurface,
  type YoutubeVisibility,
} from "@/lib/publishing.functions";
import { cn } from "@/lib/utils";

const publishingKeys = {
  surface: (campaignId: string | null) =>
    ["marketing", "publishing", campaignId ?? "none"] as const,
};

function capabilityTone(capability: PlatformPublishingState["capability"]): string {
  if (capability === "READY")
    return "border-success/30 bg-success-soft text-success-soft-foreground";
  if (capability === "LAST_ATTEMPT_FAILED")
    return "border-destructive/30 bg-destructive/10 text-destructive";
  return "border-warning/30 bg-warning-soft text-warning-soft-foreground";
}

function label(capability: PlatformPublishingState["capability"]): string {
  return capability.replace(/_/g, " ");
}

function PlatformRow({
  platform,
  asset,
  disabledReason,
  busy,
  onPublish,
}: {
  platform: PlatformPublishingState;
  asset: PublishableAsset;
  disabledReason: string | null;
  busy: boolean;
  onPublish: (input: {
    platform: PublishablePlatform;
    visibility?: YoutubeVisibility;
    title?: string;
    description?: string;
  }) => void;
}) {
  const existing = asset.publications.find((entry) => entry.platform === platform.platform);
  const published = existing?.state === "PUBLISHED";
  const [visibility, setVisibility] = React.useState<YoutubeVisibility>("unlisted");
  const [title, setTitle] = React.useState(asset.title);
  const [description, setDescription] = React.useState(asset.description);

  const blocked = disabledReason ?? (platform.canPublish ? null : platform.capabilityDetail);

  return (
    <li className="rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="type-body-sm font-semibold">{platform.label}</span>
        <div className="flex flex-wrap items-center gap-1">
          <span className="rounded-full border border-border bg-secondary px-2 py-0.5 type-body-xs text-muted-foreground">
            {platform.connectionLabel}
          </span>
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 type-body-xs font-medium",
              capabilityTone(platform.capability),
            )}
          >
            {label(platform.capability)}
          </span>
        </div>
      </div>

      {platform.destination ? (
        <p className="mt-1 type-body-xs text-muted-foreground">
          Destination: {platform.destination}
          {platform.sharesConnectionWith === "youtube"
            ? " — the same connected YouTube channel, not a separate sign-in."
            : ""}
        </p>
      ) : null}
      <p className="mt-1 type-body-xs text-muted-foreground">{platform.capabilityDetail}</p>

      {published ? (
        <p className="mt-2 type-body-xs text-success-soft-foreground">
          ALREADY PUBLISHED — {existing?.platformPostId}
          {existing?.platformUrl ? (
            <>
              {" · "}
              <a className="underline" href={existing.platformUrl} target="_blank" rel="noreferrer">
                Open on the platform
              </a>
            </>
          ) : null}
        </p>
      ) : (
        <>
          {platform.supportsVisibility && platform.canPublish && !blocked ? (
            <div className="mt-2 grid gap-2">
              <label className="type-body-xs">
                Title
                <input
                  value={title}
                  maxLength={100}
                  onChange={(event) => setTitle(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1 type-body-sm"
                />
              </label>
              <label className="type-body-xs">
                Description
                <textarea
                  value={description}
                  rows={2}
                  maxLength={4000}
                  onChange={(event) => setDescription(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1 type-body-sm"
                />
              </label>
              <label className="type-body-xs">
                Visibility
                <select
                  value={visibility}
                  onChange={(event) => setVisibility(event.target.value as YoutubeVisibility)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1 type-body-sm"
                >
                  <option value="private">Private</option>
                  <option value="unlisted">Unlisted</option>
                  <option value="public">Public (only if Google permits it)</option>
                </select>
              </label>
              <p className="type-body-xs text-muted-foreground">
                YouTube decides the final visibility. EarnRoom reads it back from YouTube after the
                upload and shows what it actually is.
              </p>
            </div>
          ) : null}

          <button
            type="button"
            disabled={Boolean(blocked) || busy}
            title={blocked ?? undefined}
            onClick={() =>
              onPublish({
                platform: platform.platform,
                ...(platform.supportsVisibility
                  ? { visibility, title: title.slice(0, 100), description }
                  : {}),
              })
            }
            className="mt-2 min-h-11 rounded-lg bg-primary px-4 type-nav font-semibold text-primary-foreground disabled:opacity-60"
          >
            {busy
              ? "Publishing…"
              : platform.platform === "youtube_shorts"
                ? "Publish Short"
                : `Publish to ${platform.label}`}
          </button>
          {blocked ? (
            <p className="mt-1 type-body-xs text-warning-soft-foreground">{blocked}</p>
          ) : null}
          {existing && existing.state !== "PUBLISHED" ? (
            <p className="mt-1 type-body-xs text-destructive">
              Last attempt: {existing.state.replace(/_/g, " ").toLowerCase()}
              {existing.error ? ` — ${existing.error}` : ""}
            </p>
          ) : null}
        </>
      )}
    </li>
  );
}

export function CampaignPublishing({ campaignId }: { campaignId: string | null }) {
  const queryClient = useQueryClient();
  const fetchSurface = useServerFn(getPublishingSurface);
  const publish = useServerFn(publishVideoToPlatform);
  const [outcome, setOutcome] = React.useState<{ platform: string; result: PublishOutcome } | null>(
    null,
  );
  const [pending, setPending] = React.useState<string | null>(null);

  const query = useQuery<PublishingSurface>({
    queryKey: publishingKeys.surface(campaignId),
    queryFn: () => fetchSurface({ data: { campaignId } }),
  });

  const mutation = useMutation({
    mutationFn: (input: {
      videoId: string;
      platform: PublishablePlatform;
      visibility?: YoutubeVisibility;
      title?: string;
      description?: string;
    }) => publish({ data: input }),
    onSettled: () => {
      setPending(null);
      queryClient.invalidateQueries({ queryKey: publishingKeys.surface(campaignId) });
    },
  });

  const surface = query.data;
  if (!surface) {
    return <p className="type-body-sm text-muted-foreground">Reading publishing status…</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h4 className="type-h5">Publish</h4>
        <p className="mt-1 type-body-sm text-muted-foreground">
          Only the final branded EarnRoom video is ever published. Connection and publishing
          capability are shown separately, and nothing is marked published unless the platform
          confirms it.
        </p>
      </div>

      {surface.publishingPaused ? (
        <Alert tone="warning" title="Publishing is paused">
          Nothing can be published until publishing is turned back on.
        </Alert>
      ) : null}

      {surface.assets.length === 0 ? (
        <p className="type-body-sm text-muted-foreground">
          No campaign video exists yet, so there is nothing to publish.
        </p>
      ) : null}

      {surface.assets.map((asset) => (
        <div key={asset.videoId} className="rounded-xl border border-border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="type-body-sm font-semibold">{asset.title}</span>
            <span className="type-body-xs text-muted-foreground">
              {asset.aspect} · {asset.seconds}s · produced for {asset.producedFor}
            </span>
          </div>
          <p
            className={cn(
              "mt-1 type-body-xs",
              asset.brandedArtifactReady
                ? "text-success-soft-foreground"
                : "text-warning-soft-foreground",
            )}
          >
            {asset.artifactDetail}
          </p>

          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {surface.platforms.map((platform) => (
              <PlatformRow
                key={platform.platform}
                platform={platform}
                asset={asset}
                busy={pending === `${asset.videoId}:${platform.platform}`}
                disabledReason={
                  asset.brandedArtifactReady
                    ? null
                    : "The final branded EarnRoom video is not ready for this asset yet."
                }
                onPublish={(input) => {
                  setOutcome(null);
                  setPending(`${asset.videoId}:${input.platform}`);
                  mutation.mutate(
                    { videoId: asset.videoId, ...input },
                    {
                      onSuccess: (result) =>
                        setOutcome({ platform: platform.label, result: result as PublishOutcome }),
                    },
                  );
                }}
              />
            ))}
          </ul>
        </div>
      ))}

      {outcome ? (
        <Alert
          tone={outcome.result.ok ? "success" : "error"}
          title={`${outcome.platform}: ${outcome.result.state.replace(/_/g, " ").toLowerCase()}`}
        >
          <p>{outcome.result.detail}</p>
          {outcome.result.platformUrl ? (
            <a
              className="underline"
              href={outcome.result.platformUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open the published item
            </a>
          ) : null}
        </Alert>
      ) : null}

      {mutation.error ? (
        <Alert tone="error" title="That didn't run">
          {(mutation.error as Error).message}
        </Alert>
      ) : null}
    </div>
  );
}
