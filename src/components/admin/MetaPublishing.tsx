/**
 * Founder Console — Facebook Page and Instagram Professional publishing.
 *
 * This extends the existing Marketing Connections cards; it is not a separate
 * screen and it does not duplicate the connect/disconnect flow. It only adds
 * what Meta needs: choosing the Facebook Page, showing the Instagram account
 * linked to it, and publishing an existing approved EarnRoom video for real.
 *
 * No token is ever shown here — the server never sends one to the browser.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import * as React from "react";

import { cn } from "@/lib/utils";
import {
  getMetaConnectionState,
  listMetaPages,
  listMetaPublishableVideos,
  publishMetaVideo,
  selectMetaPage,
  getInstagramInsights,
  type MetaConnectionState,
  type MetaPageOption,
  type MetaPublishableVideo,
  type InstagramInsightsResult,
} from "@/lib/meta.functions";

const metaKeys = {
  state: ["marketing", "meta", "state"] as const,
  videos: ["marketing", "meta", "videos"] as const,
};

function statusTone(status: string): string {
  if (status === "CONNECTED")
    return "border-success/30 bg-success-soft text-success-soft-foreground";
  if (status === "LAST ATTEMPT FAILED" || status === "AUTHORIZATION REQUIRED") {
    return "border-destructive/30 bg-destructive/10 text-destructive";
  }
  if (status.startsWith("CONNECTED")) {
    return "border-warning/30 bg-warning-soft text-warning-soft-foreground";
  }
  return "border-border bg-secondary text-muted-foreground";
}

export function useMetaConnection() {
  const queryClient = useQueryClient();
  const fetchState = useServerFn(getMetaConnectionState);
  const fetchPages = useServerFn(listMetaPages);
  const choosePage = useServerFn(selectMetaPage);
  const fetchVideos = useServerFn(listMetaPublishableVideos);
  const publish = useServerFn(publishMetaVideo);
  const insights = useServerFn(getInstagramInsights);

  const state = useQuery<MetaConnectionState>({
    queryKey: metaKeys.state,
    queryFn: () => fetchState({}),
  });
  const videos = useQuery<{ videos: MetaPublishableVideo[] }>({
    queryKey: metaKeys.videos,
    queryFn: () => fetchVideos({}),
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: metaKeys.state });

  return {
    state,
    videos,
    pages: useMutation({ mutationFn: () => fetchPages({}) }),
    select: useMutation({
      mutationFn: (pageId: string) => choosePage({ data: { pageId } }),
      onSuccess: invalidate,
    }),
    publish: useMutation({
      mutationFn: (input: { platform: "facebook" | "instagram"; videoId: string }) =>
        publish({ data: input }),
      onSuccess: invalidate,
    }),
    insights: useMutation({
      mutationFn: (mediaId: string) => insights({ data: { mediaId } }),
    }),
  };
}

export type MetaConnection = ReturnType<typeof useMetaConnection>;

/**
 * The Meta-specific section shown inside the existing Facebook / Instagram
 * connection cards.
 */
export function MetaCardExtras({
  platform,
  meta,
}: {
  platform: "facebook" | "instagram";
  meta: MetaConnection;
}) {
  const [pages, setPages] = React.useState<MetaPageOption[] | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [videoId, setVideoId] = React.useState<string>("");
  const [publishedId, setPublishedId] = React.useState<string | null>(null);
  const [figures, setFigures] = React.useState<InstagramInsightsResult | null>(null);

  const snapshot = meta.state.data;
  if (!snapshot) return null;
  const entry = snapshot[platform];
  const canPublish = entry.status === "CONNECTED";

  return (
    <div className="mt-3 space-y-2 rounded-lg border border-border bg-secondary/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="type-body-xs font-semibold">
          {platform === "instagram" ? "Instagram publishing" : "Facebook Page publishing"}
        </span>
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 type-body-xs font-medium",
            statusTone(entry.status),
          )}
        >
          {entry.status}
        </span>
      </div>
      <p className="type-body-xs text-muted-foreground">{entry.detail}</p>

      {platform === "instagram" && entry.accountId ? (
        <p className="type-body-xs text-muted-foreground">
          Instagram account ID {entry.accountId}
        </p>
      ) : null}

      {entry.accountLabel ? (
        <p className="type-body-xs">
          {platform === "facebook" ? "Facebook Page: " : "Instagram account: "}
          <span className="font-semibold">{entry.accountLabel}</span>
        </p>
      ) : null}

      {platform === "facebook" && snapshot.connected ? (
        <div className="space-y-2">
          <button
            type="button"
            disabled={meta.pages.isPending}
            onClick={() =>
              meta.pages.mutateAsync().then((result) => {
                setPages(result.pages);
                setNotice(result.detail);
              })
            }
            className="min-h-9 rounded-lg border border-border px-2 type-body-xs hover:bg-secondary"
          >
            {entry.accountId ? "Change Facebook Page" : "Find my Facebook Pages"}
          </button>

          {pages && pages.length > 0 ? (
            <ul className="space-y-1">
              {pages.map((page) => (
                <li key={page.id} className="flex items-center justify-between gap-2">
                  <span className="type-body-xs">
                    {page.name}
                    {page.category ? ` — ${page.category}` : ""}
                  </span>
                  <button
                    type="button"
                    disabled={meta.select.isPending || page.id === entry.accountId}
                    onClick={() =>
                      meta.select
                        .mutateAsync(page.id)
                        .then((result) => setNotice(result.detail))
                        .then(() => setPages(null))
                    }
                    className="min-h-9 shrink-0 rounded-lg border border-border px-2 type-body-xs hover:bg-secondary disabled:opacity-50"
                  >
                    {page.id === entry.accountId ? "Selected" : "Use this Page"}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {canPublish ? (
        <div className="space-y-2 border-t border-border pt-2">
          <label className="block type-body-xs text-muted-foreground" htmlFor={`meta-${platform}`}>
            Publish an existing EarnRoom video
          </label>
          <select
            id={`meta-${platform}`}
            value={videoId}
            onChange={(event) => setVideoId(event.target.value)}
            className="min-h-9 w-full rounded-lg border border-border bg-background px-2 type-body-xs"
          >
            <option value="">Choose a video…</option>
            {(meta.videos.data?.videos ?? []).map((video) => (
              <option key={video.id} value={video.id}>
                {video.title} · {new Date(video.createdAt).toLocaleDateString("en-GB")}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!videoId || meta.publish.isPending}
            onClick={() =>
              meta.publish
                .mutateAsync({ platform, videoId })
                .then((result) => {
                  setPublishedId(result.ok ? result.platformPostId : null);
                  setNotice(
                    result.ok
                      ? `${result.detail} Id ${result.platformPostId}${result.platformUrl ? ` — ${result.platformUrl}` : ""}`
                      : `${result.state}: ${result.detail}`,
                  );
                })
            }
            className="min-h-9 rounded-lg bg-primary px-3 type-body-xs font-semibold text-primary-foreground disabled:opacity-50"
          >
            {meta.publish.isPending
              ? "Publishing…"
              : `Publish to ${platform === "facebook" ? "Facebook Page" : "Instagram"}`}
          </button>
          {entry.lastPublishedAt ? (
            <p className="type-body-xs text-muted-foreground">
              Last confirmed by Meta on {new Date(entry.lastPublishedAt).toLocaleString("en-GB")}.
            </p>
          ) : null}
        </div>
      ) : null}

      {platform === "instagram" && publishedId ? (
        <div className="space-y-1 border-t border-border pt-2">
          <button
            type="button"
            disabled={meta.insights.isPending}
            onClick={() => meta.insights.mutateAsync(publishedId).then(setFigures)}
            className="min-h-9 rounded-lg border border-border px-2 type-body-xs hover:bg-secondary"
          >
            {meta.insights.isPending ? "Checking…" : "Check Instagram figures"}
          </button>
          {figures ? (
            <div className="space-y-1">
              <p className="type-body-xs font-semibold">Platform metrics</p>
              {figures.platformMetrics.length > 0 ? (
                <ul className="type-body-xs text-muted-foreground">
                  {figures.platformMetrics.map((metric) => (
                    <li key={metric.name}>
                      {metric.name}: {metric.value.toLocaleString("en-GB")}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="type-body-xs text-muted-foreground">{figures.detail}</p>
              )}
              {figures.unavailable.map((name) => (
                <p key={name} className="type-body-xs text-muted-foreground">
                  {name}: NOT AVAILABLE FROM INSTAGRAM API
                </p>
              ))}
              <p className="type-body-xs font-semibold">EarnRoom attributed conversions</p>
              <ul className="type-body-xs text-muted-foreground">
                {figures.attributedConversions.map((entryRow) => (
                  <li key={entryRow.name}>
                    {entryRow.name}:{" "}
                    {entryRow.value === null
                      ? "none recorded yet"
                      : entryRow.value.toLocaleString("en-GB")}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {notice ? <p className="type-body-xs text-muted-foreground">{notice}</p> : null}
    </div>
  );
}
