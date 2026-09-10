/**
 * Marketing Studio — the whole founder marketing workflow on one page.
 *
 * Generate today's campaign, read the story, choose one video mode, generate
 * the video, watch it, connect the platforms, publish. Nothing else.
 *
 * Every control here is backed by a server function that re-checks
 * `is_platform_admin(auth.uid())`. The backend keeps its full safety, branding
 * and confirmation rules — this page simply stops showing them twice.
 */
import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";

import { AdminShell, AdminSectionBlock } from "@/components/admin/AdminShell";
import { MarketingVideoPanel } from "@/components/admin/MarketingVideoPanel";
import { PublishSection } from "@/components/admin/PublishSection";
import { EmptyState, LoadingState } from "@/components/common/States";
import { Alert } from "@/components/common/Alert";
import { useMarketingStudio } from "@/hooks/useMarketingStudio";
import { usePublishingConnections } from "@/hooks/useMarketingVideos";

export const Route = createFileRoute("/_authenticated/admin/marketing")({
  component: MarketingStudioRoute,
  head: () => ({
    meta: [
      { title: "Marketing Studio · EarnRoom" },
      {
        name: "description",
        content: "Internal EarnRoom marketing studio: today's campaign, video and publishing.",
      },
      { property: "og:title", content: "Marketing Studio · EarnRoom" },
      { property: "og:description", content: "Internal EarnRoom marketing studio." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function MarketingStudioRoute() {
  const studio = useMarketingStudio(true);
  const connections = usePublishingConnections(true);
  const snapshot = studio.query.data;
  const today = snapshot?.today ?? null;

  const video = connections.query.data?.video;
  const providerConfigured =
    video?.mode.provider === "PAID_HOSTED"
      ? video.paid.configured
      : Boolean(video?.selfHosted.configured);

  const approved = today
    ? today.status === "APPROVED" || today.status === "SCHEDULED" || today.status === "PUBLISHED"
    : false;
  const blockedBySafety = today ? !today.validation.passed : false;

  return (
    <AdminShell
      title="Marketing Studio"
      description="Generate today's campaign, make the video, and publish it."
    >
      {studio.query.isLoading ? <LoadingState label="Loading the Marketing Studio…" /> : null}
      {studio.query.isError ? (
        <Alert tone="error" title="Could not load the studio">
          Please refresh and try again.
        </Alert>
      ) : null}

      {snapshot ? (
        <div className="space-y-8">
          {/* 1 — Today's campaign */}
          <AdminSectionBlock id="today" title="Today's campaign">
            {!today ? (
              <div className="space-y-4">
                <button
                  type="button"
                  onClick={() => studio.generate.mutate({})}
                  disabled={studio.generate.isPending}
                  className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 type-nav font-semibold text-primary-foreground disabled:opacity-60"
                >
                  {studio.generate.isPending
                    ? "Generating today's campaign…"
                    : "Generate Today's Campaign"}
                </button>
                {!studio.generate.isPending ? (
                  <EmptyState
                    title="No campaign yet today"
                    description="Generate today's campaign to see the story and make the video."
                  />
                ) : null}
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <h3 className="type-h4">{today.story.hook}</h3>
                  <ul className="mt-3 space-y-1">
                    {today.story.scenes.map((scene) => (
                      <li key={scene.index} className="type-body-sm text-muted-foreground">
                        • {scene.visual}
                      </li>
                    ))}
                  </ul>
                </div>

                <dl className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <dt className="type-body-xs text-muted-foreground">Campaign title</dt>
                    <dd className="type-body-sm">{today.opportunity.title}</dd>
                  </div>
                  <div>
                    <dt className="type-body-xs text-muted-foreground">Campaign type</dt>
                    <dd className="type-body-sm">
                      {today.story.format.replace(/_/g, " ").toLowerCase()}
                    </dd>
                  </div>
                  <div>
                    <dt className="type-body-xs text-muted-foreground">Target audience</dt>
                    <dd className="type-body-sm">{today.opportunity.audience}</dd>
                  </div>
                  <div>
                    <dt className="type-body-xs text-muted-foreground">Core message</dt>
                    <dd className="type-body-sm">{today.opportunity.problem}</dd>
                  </div>
                </dl>

                {blockedBySafety ? (
                  <Alert tone="error" title="Publishing blocked">
                    This campaign did not pass EarnRoom's safety checks. Generate today's campaign
                    again.
                  </Alert>
                ) : !approved ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="type-body-sm text-muted-foreground">Approval required</span>
                    <button
                      type="button"
                      disabled={studio.decide.isPending}
                      onClick={() =>
                        studio.decide.mutate({ campaignId: today.id, decision: "APPROVE" })
                      }
                      className="min-h-11 rounded-lg bg-primary px-4 type-nav font-semibold text-primary-foreground disabled:opacity-60"
                    >
                      {studio.decide.isPending ? "Approving…" : "Approve"}
                    </button>
                  </div>
                ) : (
                  <p className="type-body-sm text-success-soft-foreground">Approved</p>
                )}

                <button
                  type="button"
                  onClick={() => studio.generate.mutate({})}
                  disabled={studio.generate.isPending}
                  className="min-h-11 rounded-lg border border-border px-3 type-nav text-muted-foreground hover:bg-secondary disabled:opacity-60"
                >
                  {studio.generate.isPending ? "Generating…" : "Generate a new campaign"}
                </button>
              </div>
            )}
          </AdminSectionBlock>

          {/* 2 and 3 — one mode choice, one Generate Video button, one player */}
          {today ? (
            <AdminSectionBlock id="video" title="Generate video">
              <MarketingVideoPanel
                campaignId={today.id}
                assets={today.assets}
                story={today.story}
                providerConfigured={providerConfigured}
                audience={today.opportunity.audience}
                topic={today.opportunity.topic}
              />
            </AdminSectionBlock>
          ) : null}

          {/* 4 — one card per platform: connect, publish, watch */}
          <AdminSectionBlock id="publish" title="Publish">
            <PublishSection
              campaignId={today?.id ?? null}
              campaignApproved={approved && !blockedBySafety}
            />
          </AdminSectionBlock>
        </div>
      ) : null}
    </AdminShell>
  );
}
