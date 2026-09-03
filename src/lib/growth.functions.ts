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

const refreshInput = z.object({
  /** How far back to look, in days. Bounded so a run can never be unbounded. */
  days: z.number().int().min(1).max(90).default(30),
});

export interface GrowthRadarRefreshResult {
  scanned: number;
  opportunities: number;
  insights: number;
  audited: number;
}

export const refreshGrowthRadar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => refreshInput.parse(data ?? {}))
  .handler(async ({ data, context }): Promise<GrowthRadarRefreshResult> => {
    const { supabase } = context;

    const { data: isAdmin, error: adminError } = await supabase.rpc("is_platform_admin");
    if (adminError || isAdmin !== true) {
      throw new Error("You don't have access to this area.");
    }

    const {
      analyticsRowToSignal,
      buildGrowthPipeline,
      mergeGrowthOpportunities,
      mergeGrowthInsights,
      growthConfig,
      isGrowthFlagEnabled,
      persistGrowthOpportunity,
      persistGrowthInsight,
      persistGrowthAudit,
    } = await import("@/lib/growth");

    if (!isGrowthFlagEnabled("AI_OPPORTUNITY_RADAR_ENABLED")) {
      return { scanned: 0, opportunities: 0, insights: 0, audited: 0 };
    }

    const since = new Date(Date.now() - data.days * 24 * 60 * 60 * 1000).toISOString();
    const { data: rows, error } = await supabase
      .from("analytics_events")
      .select("id,event_name,path,props,occurred_at,environment,is_bot")
      .eq("environment", "production")
      .eq("is_bot", false)
      .gte("occurred_at", since)
      .order("occurred_at", { ascending: false })
      .limit(growthConfig().budgets.maxSignalsPerRun);
    if (error) throw new Error(error.message);

    const candidateSignals = (rows ?? []).flatMap((row) => {
      const signal = analyticsRowToSignal(row);
      return signal ? [signal] : [];
    });
    const signalIds = candidateSignals.map((signal) => `${signal.id}:signal_ingested`);
    const { data: ingested, error: ingestedError } = signalIds.length
      ? await supabase
          .from("growth_audit_events")
          .select("event_key")
          .in("event_key", signalIds)
      : { data: [], error: null };
    if (ingestedError) throw new Error(ingestedError.message);

    const alreadyIngested = new Set((ingested ?? []).map((event) => event.event_key));
    const results = candidateSignals
      .filter((signal) => !alreadyIngested.has(`${signal.id}:signal_ingested`))
      .map((signal) => buildGrowthPipeline(signal));

    const opportunities = mergeGrowthOpportunities(results);
    const insights = mergeGrowthInsights(results);
    const auditEvents = results.flatMap((result) => result.audit);

    for (const opportunity of opportunities) await persistGrowthOpportunity(supabase, opportunity);
    for (const insight of insights) await persistGrowthInsight(supabase, insight);
    for (const event of auditEvents) await persistGrowthAudit(supabase, event);

    return {
      scanned: results.length,
      opportunities: opportunities.length,
      insights: insights.length,
      audited: auditEvents.length,
    };
  });
