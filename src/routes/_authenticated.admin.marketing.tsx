/**
 * Founder marketing studio.
 *
 * Presentation only. Every figure and control here is backed by a server
 * function that re-checks `is_platform_admin(auth.uid())`, and nothing on this
 * page can publish anything a platform connection does not allow.
 */
import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";

import { AdminShell, AdminSectionBlock } from "@/components/admin/AdminShell";
import { MarketingConnections } from "@/components/admin/MarketingConnections";
import { MarketingVideoPanel } from "@/components/admin/MarketingVideoPanel";
import { EmptyState, LoadingState } from "@/components/common/States";
import { Alert } from "@/components/common/Alert";
import { useMarketingStudio } from "@/hooks/useMarketingStudio";
import { usePublishingConnections } from "@/hooks/useMarketingVideos";
import { definition } from "@/lib/marketing/platforms";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/marketing")({
  component: MarketingStudioRoute,
  head: () => ({
    meta: [
      { title: "Marketing studio · EarnRoom" },
      {
        name: "description",
        content: "Internal EarnRoom marketing and growth intelligence console.",
      },
      { property: "og:title", content: "Marketing studio · EarnRoom" },
      { property: "og:description", content: "Internal EarnRoom marketing console." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function Pill({
  tone,
  children,
}: {
  tone: "neutral" | "good" | "warn" | "bad";
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 type-body-xs font-medium",
        tone === "good" && "border-success/30 bg-success-soft text-success-soft-foreground",
        tone === "warn" && "border-warning/30 bg-warning-soft text-warning-soft-foreground",
        tone === "bad" && "border-destructive/30 bg-destructive/10 text-destructive",
        tone === "neutral" && "border-border bg-secondary text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

function MarketingStudioRoute() {
  const studio = useMarketingStudio(true);
  const connections = usePublishingConnections(true);
  const snapshot = studio.query.data;
  const providerConfigured = connections.query.data?.provider.state === "CONFIGURED";

  const toolbar = (
    <button
      type="button"
      onClick={() => studio.generate.mutate({})}
      disabled={studio.generate.isPending}
      className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 type-nav font-semibold text-primary-foreground disabled:opacity-60"
    >
      {studio.generate.isPending ? "Generating…" : "Generate today's campaign"}
    </button>
  );

  return (
    <AdminShell
      title="Marketing studio"
      description="What the engine decided to say today, why it chose that, and what it is allowed to publish."
      toolbar={toolbar}
    >
      {studio.query.isLoading ? <LoadingState label="Loading the marketing studio…" /> : null}
      {studio.query.isError ? (
        <Alert tone="error" title="Could not load the studio">
          {(studio.query.error as Error).message}
        </Alert>
      ) : null}

      {snapshot ? (
        <div className="space-y-8">
          <AdminSectionBlock
            id="controls"
            title="Operating mode"
            note="Draft generates only. Approval required holds everything for you. Autonomous still cannot publish where a platform is not connected."
          >
            <div className="flex flex-wrap items-center gap-2">
              {(["DRAFT", "APPROVAL_REQUIRED", "AUTONOMOUS"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => studio.settings.mutate({ globalMode: mode })}
                  className={cn(
                    "min-h-11 rounded-lg border px-3 type-nav",
                    snapshot.settings.globalMode === mode
                      ? "border-primary bg-primary-soft text-primary-soft-foreground"
                      : "border-border text-muted-foreground hover:bg-secondary",
                  )}
                >
                  {mode.replace(/_/g, " ").toLowerCase()}
                </button>
              ))}
              <button
                type="button"
                onClick={() =>
                  studio.settings.mutate({
                    pauseAllPublishing: !snapshot.settings.pauseAllPublishing,
                  })
                }
                className="min-h-11 rounded-lg border border-border px-3 type-nav text-muted-foreground hover:bg-secondary"
              >
                {snapshot.settings.pauseAllPublishing
                  ? "Resume publishing"
                  : "Pause all publishing"}
              </button>
              <span className="type-body-xs text-muted-foreground">
                Limit {snapshot.settings.maxDailyPublications} publication(s) per day.
              </span>
            </div>
          </AdminSectionBlock>

          <AdminSectionBlock
            id="today"
            title="Today's campaign"
            note="Generated from real demand where it exists, and from search or awareness opportunities where it does not."
          >
            {!snapshot.today ? (
              <EmptyState
                title="No campaign generated today"
                description="Generate today's campaign to see the opportunity, the story and the platform assets."
              />
            ) : (
              <div className="space-y-4">
                <div className="rounded-xl border border-border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone="neutral">{snapshot.today.id}</Pill>
                    <Pill tone={snapshot.today.validation.passed ? "good" : "bad"}>
                      {snapshot.today.validation.passed ? "Validated" : "Validation failed"}
                    </Pill>
                    <Pill tone="neutral">
                      {snapshot.today.status.replace(/_/g, " ").toLowerCase()}
                    </Pill>
                    <Pill tone="neutral">
                      Priority {Math.round(snapshot.today.score.priority)}/100
                    </Pill>
                    <Pill
                      tone={
                        snapshot.today.opportunity.evidenceClass === "REAL_MARKET_DEMAND"
                          ? "good"
                          : "warn"
                      }
                    >
                      {snapshot.today.opportunity.evidenceClass.replace(/_/g, " ").toLowerCase()}
                    </Pill>
                  </div>
                  <h3 className="mt-3 type-h4">{snapshot.today.opportunity.title}</h3>
                  <p className="mt-1 type-body-sm text-muted-foreground">
                    {snapshot.today.opportunity.problem}
                  </p>
                  <p className="mt-2 type-body-sm">{snapshot.today.score.reason}</p>
                  <ul className="mt-3 space-y-1">
                    {snapshot.today.opportunity.evidence.map((item) => (
                      <li key={item.statement} className="type-body-xs text-muted-foreground">
                        • {item.statement} <span className="opacity-70">({item.source})</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-xl border border-border p-4">
                  <h4 className="type-h5">
                    Story — {snapshot.today.story.format.replace(/_/g, " ").toLowerCase()}
                  </h4>
                  <p className="mt-1 type-body-sm font-medium">{snapshot.today.story.hook}</p>
                  <ol className="mt-3 space-y-2">
                    {snapshot.today.story.scenes.map((scene) => (
                      <li key={scene.index} className="type-body-xs text-muted-foreground">
                        <span className="font-semibold text-foreground">{scene.seconds}s</span> —{" "}
                        {scene.visual}
                        <div className="italic">“{scene.voiceover}”</div>
                      </li>
                    ))}
                  </ol>
                </div>

                {!snapshot.today.validation.passed ? (
                  <Alert tone="error" title="Blocked before publication">
                    <ul className="space-y-1">
                      {snapshot.today.validation.failures.map((failure) => (
                        <li key={failure}>{failure}</li>
                      ))}
                    </ul>
                  </Alert>
                ) : null}

                <div className="grid gap-3 sm:grid-cols-2">
                  {snapshot.today.assets.map((asset) => (
                    <div key={asset.id} className="rounded-xl border border-border p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="type-body-sm font-semibold">
                          {definition(asset.platform).label}
                        </span>
                        <Pill
                          tone={
                            asset.state === "PUBLISHED"
                              ? "good"
                              : asset.state.includes("FAIL")
                                ? "bad"
                                : "warn"
                          }
                        >
                          {asset.state.replace(/_/g, " ").toLowerCase()}
                        </Pill>
                        <span className="type-body-xs text-muted-foreground">
                          {asset.aspect} · {asset.seconds}s
                        </span>
                      </div>
                      <p className="mt-2 type-body-sm font-medium">{asset.title}</p>
                      <p className="mt-1 type-body-xs text-muted-foreground">{asset.hook}</p>
                      <p className="mt-2 type-body-xs text-muted-foreground">{asset.description}</p>
                      <p className="mt-2 type-body-xs text-primary">{asset.hashtags.join(" ")}</p>
                      {asset.videoUrl === null ? (
                        <p className="mt-2 type-body-xs text-warning-soft-foreground">
                          No video rendered — a video provider is not configured.
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      studio.decide.mutate({ campaignId: snapshot.today!.id, decision: "APPROVE" })
                    }
                    disabled={!snapshot.today.validation.passed || studio.decide.isPending}
                    className="min-h-11 rounded-lg bg-primary px-4 type-nav font-semibold text-primary-foreground disabled:opacity-60"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      studio.decide.mutate({ campaignId: snapshot.today!.id, decision: "REJECT" })
                    }
                    disabled={studio.decide.isPending}
                    className="min-h-11 rounded-lg border border-border px-4 type-nav text-muted-foreground hover:bg-secondary"
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    onClick={() => studio.publish.mutate({ campaignId: snapshot.today!.id })}
                    disabled={studio.publish.isPending}
                    className="min-h-11 rounded-lg border border-border px-4 type-nav text-muted-foreground hover:bg-secondary"
                  >
                    Attempt publication
                  </button>
                </div>

                {studio.publish.data ? (
                  <Alert tone="info" title="Publication attempt">
                    <ul className="space-y-1">
                      {studio.publish.data.results.map((result) => (
                        <li key={result.platform}>
                          {definition(result.platform as never).label}:{" "}
                          {result.state.replace(/_/g, " ").toLowerCase()} — {result.detail}
                        </li>
                      ))}
                    </ul>
                  </Alert>
                ) : null}
              </div>
            )}
          </AdminSectionBlock>

          <AdminSectionBlock
            id="platforms"
            title="Platform capability"
            note="What each platform's official API can actually do, and whether EarnRoom is connected to it."
          >
            <ul className="grid gap-2 sm:grid-cols-2">
              {snapshot.capabilities.map((capability) => (
                <li key={capability.platform} className="rounded-xl border border-border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="type-body-sm font-semibold">{capability.label}</span>
                    <Pill tone={capability.connection === "CONNECTED" ? "good" : "warn"}>
                      {capability.statusLabel}
                    </Pill>
                  </div>
                  <p className="mt-1 type-body-xs text-muted-foreground">{capability.reason}</p>
                </li>
              ))}
            </ul>
          </AdminSectionBlock>

          <AdminSectionBlock
            id="demand"
            title="What the engine saw"
            note="Real location intent from the last 30 days. Nothing here is invented."
          >
            {snapshot.demandPlaces.length === 0 ? (
              <p className="type-body-sm text-muted-foreground">
                No location intent in the period — campaigns are coming from search and awareness
                opportunities instead.
              </p>
            ) : (
              <ul className="space-y-1">
                {snapshot.demandPlaces.map((place) => (
                  <li key={place.slug} className="type-body-sm">
                    <span className="font-medium">{place.name}</span>{" "}
                    <span className="text-muted-foreground">
                      {place.demandEvents} intent signal(s), {place.publishedSpaces} published
                      space(s) · {place.priority.toLowerCase()} priority
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </AdminSectionBlock>

          <AdminSectionBlock
            id="history"
            title="Recent campaigns"
            note="Coverage, so the same place and topic are not repeated."
          >
            {snapshot.recent.length === 0 ? (
              <p className="type-body-sm text-muted-foreground">No campaigns yet.</p>
            ) : (
              <ul className="space-y-1">
                {snapshot.recent.map((row) => (
                  <li key={row.id} className="type-body-sm">
                    <span className="text-muted-foreground">{row.planDate}</span> — {row.topic}{" "}
                    <Pill tone="neutral">{row.status.toLowerCase()}</Pill>{" "}
                    <span className="type-body-xs text-muted-foreground">
                      {row.source.toLowerCase()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </AdminSectionBlock>

          <AdminSectionBlock
            id="learning"
            title="Learning"
            note="Derived only from performance platforms actually reported. It changes what is recommended, never how the AI works."
          >
            {snapshot.insights.length === 0 ? (
              <p className="type-body-sm text-muted-foreground">
                No published performance yet, so there is nothing to learn from.
              </p>
            ) : (
              <ul className="space-y-1">
                {snapshot.insights.map((insight) => (
                  <li key={`${insight.dimension}:${insight.value}`} className="type-body-sm">
                    <span className="font-medium">{insight.value}</span>{" "}
                    <span className="text-muted-foreground">
                      ({insight.dimension}) index {insight.index} from {insight.samples}{" "}
                      observation(s)
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </AdminSectionBlock>
        </div>
      ) : null}
    </AdminShell>
  );
}
