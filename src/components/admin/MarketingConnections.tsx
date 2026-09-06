/**
 * Platform connections and video service configuration.
 *
 * EarnRoom never asks for a platform password. Each account is connected on
 * that platform's own sign-in screen, and a platform is only ever shown as
 * connected when a real authorisation is stored.
 */
import * as React from "react";

import { Alert } from "@/components/common/Alert";
import { usePublishingConnections } from "@/hooks/useMarketingVideos";
import { cn } from "@/lib/utils";

export function MarketingConnections() {
  const connections = usePublishingConnections(true);
  const snapshot = connections.query.data;
  const [notice, setNotice] = React.useState<string | null>(null);

  if (connections.query.isError) {
    return (
      <Alert tone="error" title="Could not load connections">
        {(connections.query.error as Error).message}
      </Alert>
    );
  }
  if (!snapshot) return <p className="type-body-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border p-4">
        <h4 className="type-h5">Video generation</h4>
        <p className="mt-1 type-body-sm text-muted-foreground">
          {snapshot.video.mode.provider === "SELF_HOSTED"
            ? "Using EarnRoom's own video worker. Video API cost: £0 per generation."
            : "Using the paid hosted service. Each generation may be charged."}
        </p>

        <div className="mt-3 flex flex-wrap gap-1">
          {(
            [
              ["SELF_HOSTED", "Own worker — £0 per video"],
              ["PAID_HOSTED", "Paid service — charged per video"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              disabled={connections.videoProvider.isPending}
              onClick={() =>
                connections.videoProvider
                  .mutateAsync(
                    value === "PAID_HOSTED"
                      ? { provider: value, paidProviderEnabled: true }
                      : { provider: value },
                  )
                  .then(() =>
                    setNotice(
                      value === "PAID_HOSTED"
                        ? "Paid video service selected. Each generation must still be confirmed individually before it runs."
                        : "Own video worker selected. No video API charges.",
                    ),
                  )
              }
              className={cn(
                "min-h-9 rounded-lg border px-2 type-body-xs",
                snapshot.video.mode.provider === value
                  ? "border-primary bg-primary-soft text-primary-soft-foreground"
                  : "border-border text-muted-foreground hover:bg-secondary",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <dl className="mt-3 grid gap-1 type-body-xs text-muted-foreground sm:grid-cols-2">
          <div>
            <dt className="font-semibold">Own worker (Wan 2.2)</dt>
            <dd>
              {workerStatusLabel(snapshot.video.selfHosted)} — {snapshot.video.selfHosted.detail}
            </dd>
          </div>

          <div>
            <dt className="font-semibold">Model</dt>
            <dd>
              {snapshot.video.selfHosted.model} ({snapshot.video.selfHosted.modelVersion})
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Licence</dt>
            <dd>
              {snapshot.video.selfHosted.licence.licence} —{" "}
              {snapshot.video.selfHosted.licence.commercialUse}. Verified{" "}
              {snapshot.video.selfHosted.licence.verifiedOn}.
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Capacity</dt>
            <dd>
              {snapshot.video.selfHosted.running} running, {snapshot.video.selfHosted.queued} queued
              of {snapshot.video.selfHosted.maxConcurrentJobs} at once and{" "}
              {snapshot.video.selfHosted.maxJobsPerDay} a day.
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="font-semibold">Paid service</dt>
            <dd>{snapshot.video.paid.detail}</dd>
          </div>
        </dl>
      </div>

      {notice ? (
        <Alert tone="info" title="Connection">
          {notice}
        </Alert>
      ) : null}

      <ul className="grid gap-3 sm:grid-cols-2">
        {snapshot.platforms.map((platform) => (
          <li key={platform.platform} className="rounded-xl border border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="type-body-sm font-semibold">{platform.label}</span>
              <span
                className={cn(
                  "type-body-xs",
                  platform.connection === "CONNECTED"
                    ? "text-success-soft-foreground"
                    : "text-warning-soft-foreground",
                )}
              >
                {platform.statusLabel}
              </span>
            </div>

            <p className="mt-1 type-body-xs text-muted-foreground">
              {platform.configured
                ? platform.accountLabel
                  ? `Posting to ${platform.accountLabel}.`
                  : "No destination account selected yet."
                : `Requires configuration — ${platform.missingSecrets.join(" and ")} must be set up. Register the app at ${platform.developerConsole}.`}
            </p>
            {platform.approvalNote ? (
              <p className="mt-1 type-body-xs text-muted-foreground">{platform.approvalNote}</p>
            ) : null}
            {platform.lastError ? (
              <p className="mt-1 type-body-xs text-destructive">{platform.lastError}</p>
            ) : null}

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  connections.start.mutateAsync(platform.platform).then((result) => {
                    if (result.ok && result.url) window.open(result.url, "_blank", "noopener");
                    setNotice(result.detail);
                  })
                }
                className="min-h-11 rounded-lg border border-border px-3 type-nav text-muted-foreground hover:bg-secondary"
              >
                {platform.connection === "CONNECTED" ? "Reconnect" : "Connect account"}
              </button>
              <button
                type="button"
                onClick={() =>
                  connections.test
                    .mutateAsync(platform.platform)
                    .then((result) => setNotice(`${platform.label}: ${result.detail}`))
                }
                className="min-h-11 rounded-lg border border-border px-3 type-nav text-muted-foreground hover:bg-secondary"
              >
                Test connection
              </button>
              <button
                type="button"
                onClick={() =>
                  connections.update.mutate({
                    platform: platform.platform,
                    paused: !platform.paused,
                  })
                }
                className="min-h-11 rounded-lg border border-border px-3 type-nav text-muted-foreground hover:bg-secondary"
              >
                {platform.paused ? "Resume" : "Pause"}
              </button>
              {platform.connection === "CONNECTED" ? (
                <button
                  type="button"
                  onClick={() => connections.disconnect.mutate(platform.platform)}
                  className="min-h-11 rounded-lg border border-border px-3 type-nav text-destructive hover:bg-secondary"
                >
                  Disconnect
                </button>
              ) : null}
            </div>

            <div className="mt-3 flex flex-wrap gap-1">
              {(["DRAFT", "APPROVAL_REQUIRED", "AUTONOMOUS"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => connections.update.mutate({ platform: platform.platform, mode })}
                  className={cn(
                    "min-h-9 rounded-lg border px-2 type-body-xs",
                    platform.mode === mode
                      ? "border-primary bg-primary-soft text-primary-soft-foreground"
                      : "border-border text-muted-foreground hover:bg-secondary",
                  )}
                >
                  {mode.replace(/_/g, " ").toLowerCase()}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
