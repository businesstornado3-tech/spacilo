/**
 * Founder Console — connect your social accounts.
 *
 * EarnRoom never asks for a platform password. Each account is connected on
 * that platform's own sign-in screen, and a platform is only ever shown as
 * connected when a real authorisation is stored. Everything technical —
 * credentials, scopes, test calls, last error — sits behind the collapsed
 * advanced diagnostics.
 */
import * as React from "react";

import { Alert } from "@/components/common/Alert";
import { MetaCardExtras, useMetaConnection } from "@/components/admin/MetaPublishing";
import { YoutubeDestinationCard } from "@/components/admin/YoutubeDestination";
import { usePublishingConnections } from "@/hooks/useMarketingVideos";
import { definition } from "@/lib/marketing/platforms";
import { workerStatusLabel } from "@/lib/marketing/worker-status";
import { cn } from "@/lib/utils";

/** Founder-facing description of what each connection is for. */
const PLATFORM_NOTE: Record<string, string> = {
  youtube:
    "Publish long-form videos and Shorts to your YouTube channel. Shorts use this same connection.",
  instagram: "Publish Reels to your Instagram professional account.",
  facebook: "Publish videos to a Facebook Page you manage.",
  tiktok: "Publish native vertical videos to your TikTok account.",
  linkedin: "Publish professional updates to your LinkedIn organisation page.",
  pinterest: "Publish visual pins linking back to EarnRoom.",
};

function statusWord(connection: string, paused: boolean): string {
  if (connection === "CONNECTED") return paused ? "CONNECTED — PUBLISHING OFF" : "CONNECTED";
  if (connection === "EXPIRED" || connection === "ERROR") return "ACTION REQUIRED";
  return "NOT CONNECTED";
}

function statusTone(word: string): string {
  if (word.startsWith("CONNECTED")) {
    return "border-success/30 bg-success-soft text-success-soft-foreground";
  }
  if (word === "ACTION REQUIRED") return "border-destructive/30 bg-destructive/10 text-destructive";
  return "border-border bg-secondary text-muted-foreground";
}

export function MarketingConnections() {
  const connections = usePublishingConnections(true);
  const meta = useMetaConnection();
  const snapshot = connections.query.data;
  const [notice, setNotice] = React.useState<string | null>(null);
  const [manage, setManage] = React.useState<string | null>(null);

  if (connections.query.isError) {
    return (
      <Alert tone="error" title="Could not load connections">
        {(connections.query.error as Error).message}
      </Alert>
    );
  }
  if (!snapshot) return <p className="type-body-sm text-muted-foreground">Loading…</p>;

  // YouTube Shorts is the same channel and the same authorisation, so it is
  // never shown as a separate account to connect.
  const platforms = snapshot.platforms.filter((entry) => entry.platform !== "youtube_shorts");

  return (
    <div className="space-y-5">
      <div>
        <h3 className="type-h4">Connect your social accounts</h3>
        <p className="mt-1 type-body-sm text-muted-foreground">
          Connect the platforms where EarnRoom may publish marketing content. Sign in securely
          through each platform. EarnRoom never asks for or stores a platform password.
        </p>
      </div>

      {notice ? (
        <Alert tone="info" title="Connection">
          {notice}
        </Alert>
      ) : null}

      <ul className="grid gap-3 sm:grid-cols-2">
        {platforms.map((platform) => {
          const word = statusWord(platform.connection, platform.paused);
          const connected = platform.connection === "CONNECTED";
          const supported = definition(platform.platform).apiPublishingSupported;
          return (
            <li key={platform.platform} className="rounded-xl border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="type-body-sm font-semibold">{platform.label}</span>
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 type-body-xs font-medium",
                    statusTone(word),
                  )}
                >
                  {word}
                </span>
              </div>

              <p className="mt-2 type-body-sm text-muted-foreground">
                {PLATFORM_NOTE[platform.platform] ?? platform.label}
              </p>

              {!supported ? (
                <p className="mt-1 type-body-xs text-warning-soft-foreground">
                  {platform.label} publishing is not available yet.
                </p>
              ) : connected ? (
                <p className="mt-1 type-body-xs text-muted-foreground">
                  {platform.accountLabel
                    ? `Publishing to ${platform.accountLabel}.`
                    : "No destination account chosen yet."}
                </p>
              ) : null}

              {supported && platform.platform === "tiktok" && connected ? (
                <p className="mt-1 type-body-xs text-muted-foreground">
                  Account connected. Public publishing requires TikTok's platform approval; until
                  then posts stay private on TikTok.
                </p>
              ) : null}

              {supported ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {connected ? (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          setManage(manage === platform.platform ? null : platform.platform)
                        }
                        aria-expanded={manage === platform.platform}
                        className="min-h-11 rounded-lg border border-border px-3 type-nav text-muted-foreground hover:bg-secondary"
                      >
                        Manage
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          connections.disconnect
                            .mutateAsync(platform.platform)
                            .then(() => setNotice(`${platform.label} disconnected.`))
                        }
                        className="min-h-11 rounded-lg border border-border px-3 type-nav text-destructive hover:bg-secondary"
                      >
                        Disconnect
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        connections.start.mutateAsync(platform.platform).then((result) => {
                          if (result.ok && result.url)
                            window.open(result.url, "_blank", "noopener");
                          setNotice(result.detail);
                        })
                      }
                      className="min-h-11 rounded-lg bg-primary px-3 type-nav font-semibold text-primary-foreground"
                    >
                      Connect {platform.label}
                    </button>
                  )}
                </div>
              ) : null}

              {platform.platform === "facebook" || platform.platform === "instagram" ? (
                <MetaCardExtras
                  platform={platform.platform as "facebook" | "instagram"}
                  meta={meta}
                />
              ) : null}

              {platform.platform === "youtube" ? (
                <YoutubeDestinationCard connected={connected} />
              ) : null}

              {manage === platform.platform ? (
                <div className="mt-3 space-y-2 rounded-lg border border-border bg-secondary/40 p-3">
                  <label className="flex items-center gap-2 type-body-sm">
                    <input
                      type="checkbox"
                      checked={!platform.paused}
                      onChange={(event) =>
                        connections.update.mutate({
                          platform: platform.platform,
                          paused: !event.target.checked,
                        })
                      }
                    />
                    Publishing to {platform.label} is {platform.paused ? "off" : "on"}
                  </label>
                  <div className="flex flex-wrap gap-1">
                    {(["DRAFT", "APPROVAL_REQUIRED", "AUTONOMOUS"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        disabled={mode === "AUTONOMOUS" && !platform.autonomousAvailable}
                        onClick={() =>
                          connections.update.mutate({ platform: platform.platform, mode })
                        }
                        className={cn(
                          "min-h-9 rounded-lg border px-2 type-body-xs disabled:opacity-50",
                          platform.mode === mode
                            ? "border-primary bg-primary-soft text-primary-soft-foreground"
                            : "border-border text-muted-foreground hover:bg-secondary",
                        )}
                      >
                        {mode.replace(/_/g, " ").toLowerCase()}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      connections.start.mutateAsync(platform.platform).then((result) => {
                        if (result.ok && result.url) window.open(result.url, "_blank", "noopener");
                        setNotice(result.detail);
                      })
                    }
                    className="min-h-9 rounded-lg border border-border px-2 type-body-xs hover:bg-secondary"
                  >
                    Change account
                  </button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <details className="rounded-xl border border-border p-4">
        <summary className="cursor-pointer type-body-sm font-semibold">
          Advanced platform diagnostics
        </summary>

        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {snapshot.platforms.map((platform) => (
            <li key={platform.platform} className="rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="type-body-sm font-semibold">{platform.label}</span>
                <span className="type-body-xs text-muted-foreground">{platform.statusLabel}</span>
              </div>
              <dl className="mt-2 grid gap-0.5 type-body-xs text-muted-foreground">
                <div>
                  Application credentials:{" "}
                  {platform.configured
                    ? "configured"
                    : `missing ${platform.missingSecrets.join(" and ")} (${platform.developerConsole})`}
                </div>
                <div>Permissions requested: {platform.scopes.join(", ")}</div>
                {platform.approvalNote ? <div>{platform.approvalNote}</div> : null}
                {platform.lastError ? (
                  <div className="text-destructive">Last error: {platform.lastError}</div>
                ) : null}
              </dl>
              <button
                type="button"
                onClick={() =>
                  connections.test
                    .mutateAsync(platform.platform)
                    .then((result) => setNotice(`${platform.label}: ${result.detail}`))
                }
                className="mt-2 min-h-9 rounded-lg border border-border px-2 type-body-xs hover:bg-secondary"
              >
                Test connection
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-4 rounded-lg border border-border p-3">
          <h4 className="type-body-sm font-semibold">Video generation service</h4>
          <p className="mt-1 type-body-xs text-muted-foreground">
            {snapshot.video.mode.provider === "SELF_HOSTED"
              ? "Using EarnRoom's own video worker. Video service cost: £0 per generation."
              : "Using the paid hosted service. Each generation may be charged."}
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
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
                          : "Own video worker selected. No video service charges.",
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
              <dt className="font-semibold">Own worker</dt>
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
                {snapshot.video.selfHosted.running} running, {snapshot.video.selfHosted.queued}{" "}
                queued of {snapshot.video.selfHosted.maxConcurrentJobs} at once and{" "}
                {snapshot.video.selfHosted.maxJobsPerDay} a day.
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="font-semibold">Cost</dt>
              <dd>
                Video service fee: £0 per video on the own worker. Infrastructure/compute:{" "}
                {snapshot.video.selfHosted.infrastructurePencePerGpuMinute === null
                  ? "unknown — the GPU cost per minute has not been entered."
                  : `about £${((snapshot.video.selfHosted.infrastructurePencePerGpuMinute * 60) / 100).toFixed(2)} per GPU hour, billed by your GPU host.`}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="font-semibold">Paid service</dt>
              <dd>{snapshot.video.paid.detail}</dd>
            </div>
          </dl>
        </div>
      </details>
    </div>
  );
}
