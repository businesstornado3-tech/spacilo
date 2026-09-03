/**
 * Phase 11 — Founder growth radar, server side only.
 *
 * SECURITY: `requireSupabaseAuth` establishes who is calling, and every read
 * and write below goes through the caller's own Supabase client, so the growth
 * tables' `is_platform_admin(auth.uid())` policies are the real boundary. A
 * renter or host invoking this function reads nothing and writes nothing.
 *
 * PRIVACY: only production, non-bot, taxonomy-approved first-party analytics
 * rows are read, and they are converted to non-identifying behavioural
 * observations before any analysis. No contact handle exists on this path, so
 * the radar can only observe and score — it never contacts anyone.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { rebuildChunks, refreshWindow } from "@/lib/analytics/rollups";
import type { GrowthLearningSignal } from "@/lib/growth/types";

const refreshInput = z.object({
  /** How far back to look, in days. Bounded so a run can never be unbounded. */
  days: z.number().int().min(1).max(90).default(30),
});

export interface GrowthRadarRefreshResult {
  scanned: number;
  opportunities: number;
  insights: number;
  campaigns: number;
  recommendations: number;
  audited: number;
  rollupsWritten: number;
}

export const refreshGrowthRadar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => refreshInput.parse(data ?? {}))
  .handler(async ({ data, context }): Promise<GrowthRadarRefreshResult> => {
    const { supabase } = context;

    // Keep the browser-session client for the admin check, then use the
    // server-only service client for analytics ingestion. `analytics_events`
    // intentionally has no browser read policy.
    const { data: isAdmin, error: adminError } = await supabase.rpc("is_platform_admin");
    if (adminError || isAdmin !== true) {
      throw new Error("You don't have access to this area.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const {
      analyticsRowToSignal,
      buildGrowthPipeline,
      mergeGrowthOpportunities,
      mergeGrowthInsights,
      buildInnovationRecommendations,
      totalsByOpportunity,
      growthConfig,
      isGrowthFlagEnabled,
      persistGrowthOpportunity,
      persistGrowthInsight,
      persistGrowthCampaign,
      persistInnovationRecommendation,
      persistGrowthAudit,
    } = await import("@/lib/growth");

    const rollupWindow = refreshWindow(data.days);
    let rollupsWritten = 0;
    for (const chunk of rebuildChunks(rollupWindow)) {
      const { data: written, error: rollupError } = await supabaseAdmin.rpc(
        "analytics_rebuild_daily_rollups",
        {
          p_from: chunk.from.toISOString(),
          p_to: chunk.to.toISOString(),
        },
      );
      if (rollupError) throw new Error(rollupError.message);
      rollupsWritten += written ?? 0;
    }

    if (!isGrowthFlagEnabled("AI_OPPORTUNITY_RADAR_ENABLED")) {
      return {
        scanned: 0,
        opportunities: 0,
        insights: 0,
        campaigns: 0,
        recommendations: 0,
        audited: 0,
        rollupsWritten,
      };
    }

    const { data: rows, error } = await supabaseAdmin
      .from("analytics_events")
      .select("id,event_name,path,props,occurred_at,environment,is_bot")
      .eq("environment", "production")
      .eq("is_bot", false)
      .gte("occurred_at", rollupWindow.from.toISOString())
      .lt("occurred_at", rollupWindow.to.toISOString())
      .order("occurred_at", { ascending: false })
      .limit(growthConfig().budgets.maxSignalsPerRun);
    if (error) throw new Error(error.message);

    const candidateSignals = (rows ?? []).flatMap((row) => {
      const signal = analyticsRowToSignal(row);
      return signal ? [signal] : [];
    });
    // The service client is necessary here: analytics_events is intentionally
    // not readable from a browser, even for a signed-in admin.
    const signalIds = candidateSignals.flatMap((signal) => [
      `${signal.id}:signal_ingested`,
      `${signal.id}:dropped`,
    ]);
    const { data: ingested, error: ingestedError } = signalIds.length
      ? await supabaseAdmin
          .from("growth_audit_events")
          .select("event_key")
          .in("event_key", signalIds)
      : { data: [], error: null };
    if (ingestedError) throw new Error(ingestedError.message);

    const alreadyIngested = new Set((ingested ?? []).map((event) => event.event_key));
    const results = candidateSignals
      .filter(
        (signal) =>
          !alreadyIngested.has(`${signal.id}:signal_ingested`) &&
          !alreadyIngested.has(`${signal.id}:dropped`),
      )
      .map((signal) => buildGrowthPipeline(signal));

    const opportunities = mergeGrowthOpportunities(results);
    const insights = mergeGrowthInsights(results);
    const campaigns = results.flatMap((result) =>
      result.campaign
        ? [{ campaign: result.campaign, sourceIdentity: result.signal.connectorId }]
        : [],
    );
    const { data: learningRows, error: learningError } = await supabaseAdmin
      .from("growth_learning_signals")
      .select("opportunity_key,channel,outcome,value_pence,occurred_at")
      .order("occurred_at", { ascending: false })
      .limit(5000);
    if (learningError) throw new Error(learningError.message);
    const learningSignals: GrowthLearningSignal[] = (learningRows ?? []).map((row) => ({
      opportunityKey: row.opportunity_key,
      channel: row.channel,
      outcome: row.outcome,
      ...(row.value_pence === null ? {} : { valuePence: row.value_pence }),
      at: Date.parse(row.occurred_at),
    }));
    const recommendations = buildInnovationRecommendations(
      opportunities,
      totalsByOpportunity(learningSignals),
      growthConfig().thresholds.insightValidationCount,
    );
    const auditEvents = results.flatMap((result) => result.audit);

    for (const opportunity of opportunities)
      await persistGrowthOpportunity(supabaseAdmin, opportunity);
    for (const insight of insights) await persistGrowthInsight(supabaseAdmin, insight);
    for (const { campaign, sourceIdentity } of campaigns) {
      await persistGrowthCampaign(supabaseAdmin, campaign, sourceIdentity);
    }
    for (const recommendation of recommendations)
      await persistInnovationRecommendation(supabaseAdmin, recommendation);
    for (const event of auditEvents) await persistGrowthAudit(supabaseAdmin, event);

    return {
      scanned: results.length,
      opportunities: opportunities.length,
      insights: insights.length,
      campaigns: campaigns.length,
      recommendations: recommendations.length,
      audited: auditEvents.length,
      rollupsWritten,
    };
  });
