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

  // The live decision lives in its own columns, not inside the stored plan, so
  // an approval taken a moment ago is visible on the very next read.
  const decision = snapshot?.todayDecision?.status ?? null;
  const approved = decision === "APPROVED" || decision === "SCHEDULED" || decision === "PUBLISHED";
  const rejected = decision === "REJECTED";
  // Safety failure is a real validation result — never the same thing as
  // "the founder has not decided yet".
  const safetyFailed = today ? !today.validation.passed : false;
  const safetyReasons = today?.validation.failures ?? [];
  // Only a genuine emergency stop blocks the whole studio.
  const globallyPaused = snapshot?.settings.pauseAllPublishing ?? false;
  const autonomous = snapshot?.settings.globalMode === "AUTONOMOUS";

  // Exactly one campaign-generation action exists on this page.
  const generateButton = (
    <button
      type="button"
      onClick={() => studio.generate.mutate({})}
      disabled={studio.generate.isPending}
      className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 type-nav font-semibold text-primary-foreground disabled:opacity-60"
    >
      {studio.generate.isPending ? "Generating today's campaign…" : "Generate Today's Campaign"}
    </button>
  );

  return (
    <AdminShell
      title="Marketing Studio"
      description="Generate today's campaign, make the video, approve it, and publish it."
    >
      {studio.query.isLoading ? <LoadingState label="Loading the Marketing Studio…" /> : null}
      {studio.query.isError ? (
        <Alert tone="error" title="Could not load the studio">
          Please refresh and try again.
        </Alert>
      ) : null}

      {snapshot ? (
        <div className="space-y-8">
          {globallyPaused ? (
            <Alert tone="error" title="Publishing paused">
              All publishing is paused for EarnRoom. Turn publishing back on to publish anything.
            </Alert>
          ) : null}

          {/* 1 — Today's campaign */}
          <AdminSectionBlock id="today" title="Today's campaign">
            {!today ? (
              <div className="space-y-4">
                {generateButton}
                {!studio.generate.isPending ? (
                  <EmptyState
                    title="Ready to create today's campaign"
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
                    <dt className="type-body-xs text-muted-foreground">Why this story</dt>
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
                  <div>
                    <dt className="type-body-xs text-muted-foreground">Call to action</dt>
                    <dd className="type-body-sm">{today.story.renterCta}</dd>
                  </div>
                </dl>

                {generateButton}
              </div>
            )}
          </AdminSectionBlock>

          {/* 2 — one mode choice, one Generate Video button, one player */}
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

          {/* 3 — approval: a founder decision, told apart from a safety result */}
          {today ? (
            <AdminSectionBlock id="approval" title="Campaign approval">
              {safetyFailed ? (
                <div className="space-y-3">
                  <p className="type-body-sm font-semibold">Status: Safety validation failed</p>
                  {safetyReasons.length > 0 ? (
                    <ul className="space-y-1">
                      {safetyReasons.map((reason) => (
                        <li key={reason} className="type-body-sm text-muted-foreground">
                          • {reason}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="type-body-sm text-muted-foreground">
                      This campaign did not pass EarnRoom's safety and accuracy checks.
                    </p>
                  )}
                  <p className="type-body-xs text-muted-foreground">
                    Approval is unavailable until a campaign passes these checks.
                  </p>
                </div>
              ) : approved ? (
                <p className="type-body-sm text-success-soft-foreground">
                  Status: Approved ✓ — publishing is unlocked.
                </p>
              ) : rejected ? (
                <div className="space-y-2">
                  <p className="type-body-sm font-semibold">Status: Rejected</p>
                  <p className="type-body-sm text-muted-foreground">
                    Publishing stays off for this campaign. Generate today's campaign again above
                    when you want a new version.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="type-body-sm font-semibold">Status: Awaiting approval</p>
                  <p className="type-body-sm text-muted-foreground">
                    This campaign passed EarnRoom's safety and accuracy checks. It is your decision.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={studio.decide.isPending}
                      onClick={() =>
                        studio.decide.mutate({ campaignId: today.id, decision: "APPROVE" })
                      }
                      className="min-h-11 rounded-lg bg-primary px-4 type-nav font-semibold text-primary-foreground disabled:opacity-60"
                    >
                      {studio.decide.isPending ? "Saving…" : "Approve Campaign"}
                    </button>
                    <button
                      type="button"
                      disabled={studio.decide.isPending}
                      onClick={() =>
                        studio.decide.mutate({ campaignId: today.id, decision: "REJECT" })
                      }
                      className="min-h-11 rounded-lg border border-border px-4 type-nav font-semibold text-destructive hover:bg-secondary disabled:opacity-60"
                    >
                      Reject Campaign
                    </button>
                  </div>
                  {studio.decide.isError ? (
                    <Alert tone="error" title="That didn't save">
                      Please try again.
                    </Alert>
                  ) : null}
                </div>
              )}
            </AdminSectionBlock>
          ) : null}

          {/* 4 — publishing mode, a real stored setting */}
          <AdminSectionBlock id="publishing-mode" title="Publishing mode">
            <div className="space-y-3">
              <p className="type-body-sm">
                Autonomous publishing: <strong>{autonomous ? "ON" : "OFF"}</strong>
              </p>
              <p className="type-body-sm text-muted-foreground">
                When ON, an approved campaign with a finished video can be published automatically
                to your connected platforms, following EarnRoom's usual safety and publishing rules.
                When OFF, you publish each platform yourself below.
              </p>
              <button
                type="button"
                disabled={studio.settings.isPending}
                onClick={() =>
                  studio.settings.mutate({
                    globalMode: autonomous ? "APPROVAL_REQUIRED" : "AUTONOMOUS",
                  })
                }
                className="min-h-11 rounded-lg border border-border px-4 type-nav font-semibold hover:bg-secondary disabled:opacity-60"
              >
                {studio.settings.isPending
                  ? "Saving…"
                  : autonomous
                    ? "Turn autonomous publishing off"
                    : "Turn autonomous publishing on"}
              </button>
            </div>
          </AdminSectionBlock>

          {/* 5 — one card per platform: connect, publish, watch */}
          <AdminSectionBlock id="publish" title="Publish">
            <PublishSection
              campaignId={today?.id ?? null}
              campaignApproved={approved && !safetyFailed}
            />
          </AdminSectionBlock>
        </div>
      ) : null}
    </AdminShell>
  );
}
