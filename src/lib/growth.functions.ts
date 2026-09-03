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
import type { GrowthLearningSignal, Campaign } from "@/lib/growth/types";

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
      rankOpportunities,
      totalsByOpportunity,
      growthConfig,
      isGrowthFlagEnabled,
      persistGrowthOpportunity,
      persistGrowthInsight,
      persistGrowthCampaign,
      persistInnovationRecommendation,
      persistGrowthAudit,
      persistGrowthAttribution,
      persistGrowthLearningSignal,
      learningSignalFromAttribution,
      attributionRecord,
      landingAttribution,
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
      .select(
        "id,event_name,path,props,occurred_at,environment,is_bot,utm_source,utm_medium,utm_campaign",
      )
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

    // Attribution is a separate, repeat-safe stream: conversion events may not
    // be radar inputs, but they still belong in the internal learning ledger.
    for (const row of rows ?? []) {
      const props =
        row.props && typeof row.props === "object" && !Array.isArray(row.props)
          ? (row.props as Record<string, string | number | boolean | null>)
          : {};
      const record = attributionRecord({
        eventId: String(row.id),
        eventName: row.event_name,
        occurredAt: Date.parse(row.occurred_at),
        path: row.path,
        props,
        landing: landingAttribution({
          path: String(props["landing_path"] ?? row.path ?? "/"),
          now: Date.parse(row.occurred_at),
          params: {
            utm_source: row.utm_source,
            utm_medium: row.utm_medium,
            utm_campaign: row.utm_campaign,
          },
        }),
        opportunityKey:
          typeof props["opportunity_key"] === "string" ? props["opportunity_key"] : null,
        campaignId: typeof props["campaign_id"] === "string" ? props["campaign_id"] : null,
      });
      if (record) {
        const isNewTouch = await persistGrowthAttribution(supabaseAdmin, record);
        if (isNewTouch) {
          const learning = learningSignalFromAttribution(record);
          if (learning) {
            await persistGrowthLearningSignal(
              supabaseAdmin,
              learning,
              { source: "analytics_events", event_id: row.id },
              record.idempotencyKey,
            );
          }
        }
      }
    }

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
    const outcomeTotals = totalsByOpportunity(learningSignals);
    const rankedOpportunities = rankOpportunities(opportunities, outcomeTotals);
    const recommendations = buildInnovationRecommendations(
      rankedOpportunities,
      outcomeTotals,
      growthConfig().thresholds.insightValidationCount,
    );
    const auditEvents = results.flatMap((result) => result.audit);

    // Persist ranked scores as an additive `learnedScore` field inside the
    // existing score contract. The underlying policy score remains unchanged.
    await Promise.all(
      rankedOpportunities.map((opportunity) => persistGrowthOpportunity(supabaseAdmin, opportunity)),
    );
    await Promise.all(insights.map((insight) => persistGrowthInsight(supabaseAdmin, insight)));
    await Promise.all(
      campaigns.map(({ campaign, sourceIdentity }) =>
        persistGrowthCampaign(supabaseAdmin, campaign, sourceIdentity),
      ),
    );
    await Promise.all(
      recommendations.map((recommendation) =>
        persistInnovationRecommendation(supabaseAdmin, recommendation),
      ),
    );
    await Promise.all(auditEvents.map((event) => persistGrowthAudit(supabaseAdmin, event)));

    return {
      scanned: results.length,
      opportunities: rankedOpportunities.length,
      insights: insights.length,
      campaigns: campaigns.length,
      recommendations: recommendations.length,
      audited: auditEvents.length,
      rollupsWritten,
    };
  });

const campaignInput = z.object({
  campaignId: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(25).default(10),
});

type PersistedCampaignRow = {
  id: string;
  opportunity_key: string;
  channel: string | null;
  state: string;
  decision: unknown;
  policy: unknown;
  message: unknown;
  attempt_count: number;
  sent_at: string | null;
  expires_at: string | null;
  recipient_identity_hash: string | null;
  idempotency_key: string;
  created_at: string;
};

function campaignFromRow(row: PersistedCampaignRow): Campaign {
  return {
    id: row.id,
    opportunityKey: row.opportunity_key,
    idempotencyKey: row.idempotency_key,
    recipientIdentityHash: row.recipient_identity_hash,
    channel: row.channel,
    message: row.message,
    state: row.state,
    decision: row.decision,
    policy: row.policy,
    createdAt: Date.parse(row.created_at),
    sentAt: row.sent_at ? Date.parse(row.sent_at) : null,
    expiresAt: row.expires_at ? Date.parse(row.expires_at) : null,
  } as Campaign;
}

export type GrowthCampaignExecutionResult = {
  id: string;
  opportunityKey: string;
  channel: string | null;
  state: string;
  outcome: string;
  detail: string;
  attemptNumber: number;
};

async function executePersistedCampaign(
  row: PersistedCampaignRow,
  client: import("@supabase/supabase-js").SupabaseClient<import("@/integrations/supabase/types").Database>,
): Promise<GrowthCampaignExecutionResult> {
  const {
    claimGrowthCampaignLock,
    executeCampaign,
    persistGrowthAudit,
    persistGrowthCampaignAttempt,
    persistGrowthCampaignResult,
    persistGrowthLearningSignal,
  } = await import("@/lib/growth");
  const lock = `${row.id}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  const now = Date.now();
  const claimed = await claimGrowthCampaignLock(client, row.id, lock, now);
  if (!claimed) {
    return {
      id: row.id,
      opportunityKey: row.opportunity_key,
      channel: row.channel,
      state: row.state,
      outcome: "skipped",
      detail: "Another worker owns the campaign send lock.",
      attemptNumber: row.attempt_count,
    };
  }

  const result = await executeCampaign(campaignFromRow(row), {
    attempts: row.attempt_count,
    recipient: row.recipient_identity_hash,
    holdsLock: true,
    now,
  });
  try {
    await persistGrowthCampaignAttempt(client, {
      campaignId: row.id,
      attemptNumber: result.attemptNumber,
      status: result.outcome.status,
      providerReference: result.outcome.providerReference,
      attemptedAt: now,
      metadata: { adapter_detail: result.outcome.detail, transmitted: false },
    });
    await persistGrowthCampaignResult(client, row.id, lock, {
      state: result.state,
      attemptNumber: result.attemptNumber,
      sentAt: result.executed ? now : null,
      lastError: result.outcome.status === "failed" ? result.outcome.detail : null,
    });
    await Promise.all(
      result.audit.map((event) => persistGrowthAudit(client, event)),
    );
    await Promise.all(
      result.learning.map((signal) =>
        persistGrowthLearningSignal(
          client,
          signal,
          { source: "growth.delivery", campaign_id: row.id, attempt: result.attemptNumber },
          `${row.id}:${result.attemptNumber}:${signal.outcome}`,
        ),
      ),
    );
  } catch (error) {
    // Always release the lock if ledger persistence fails, without masking the
    // original queue entry behind a permanently locked row.
    await persistGrowthCampaignResult(client, row.id, lock, {
      state: "QUEUED",
      attemptNumber: row.attempt_count,
      sentAt: null,
      lastError: error instanceof Error ? error.message : "Campaign ledger write failed.",
    });
    throw error;
  }

  return {
    id: row.id,
    opportunityKey: row.opportunity_key,
    channel: row.channel,
    state: result.state,
    outcome: result.outcome.status,
    detail: result.outcome.detail,
    attemptNumber: result.attemptNumber,
  };
}

/** Admin-only, durable execution path. Default adapters are mock-only and never transmit. */
export const dispatchGrowthCampaigns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => campaignInput.parse(data ?? {}))
  .handler(async ({ data, context }): Promise<GrowthCampaignExecutionResult[]> => {
    const { data: isAdmin, error: adminError } = await context.supabase.rpc("is_platform_admin");
    if (adminError || isAdmin !== true) throw new Error("You don't have access to this area.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();

    await supabaseAdmin
      .from("growth_campaigns")
      .update({ state: "EXPIRED", send_lock: null, locked_at: null, last_error: "Campaign expired before dispatch." })
      .eq("state", "QUEUED")
      .lt("expires_at", now)
      .not("expires_at", "is", null);

    let query = supabaseAdmin
      .from("growth_campaigns")
      .select(
        "id,opportunity_key,channel,state,decision,policy,message,attempt_count,sent_at,expires_at,recipient_identity_hash,idempotency_key,created_at",
      )
      .eq("state", "QUEUED")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.campaignId) query = query.eq("id", data.campaignId);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const results: GrowthCampaignExecutionResult[] = [];
    for (const row of (rows ?? []) as PersistedCampaignRow[]) {
      try {
        results.push(await executePersistedCampaign(row, supabaseAdmin));
      } catch (error) {
        results.push({
          id: row.id,
          opportunityKey: row.opportunity_key,
          channel: row.channel,
          state: "QUEUED",
          outcome: "failed",
          detail: error instanceof Error ? error.message : "Campaign execution failed.",
          attemptNumber: row.attempt_count,
        });
      }
    }
    return results;
  });

/** Admin-only, non-persisting preview retained for inspection without consuming a queue item. */
export const dryRunGrowthCampaigns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => campaignInput.parse(data ?? {}))
  .handler(async ({ data, context }): Promise<GrowthCampaignExecutionResult[]> => {
    const { data: isAdmin, error: adminError } = await context.supabase.rpc("is_platform_admin");
    if (adminError || isAdmin !== true) throw new Error("You don't have access to this area.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let query = supabaseAdmin
      .from("growth_campaigns")
      .select(
        "id,opportunity_key,channel,state,decision,policy,message,attempt_count,sent_at,expires_at,recipient_identity_hash,idempotency_key,created_at",
      )
      .eq("state", "QUEUED")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.campaignId) query = query.eq("id", data.campaignId);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    const { executeCampaign } = await import("@/lib/growth");
    return Promise.all(
      ((rows ?? []) as PersistedCampaignRow[]).map(async (row) => {
        const result = await executeCampaign(campaignFromRow(row), {
          attempts: row.attempt_count,
          recipient: row.recipient_identity_hash,
          holdsLock: true,
          now: Date.now(),
        });
        return {
          id: row.id,
          opportunityKey: row.opportunity_key,
          channel: row.channel,
          state: row.state,
          outcome: result.outcome.status,
          detail: `Mock adapter preview: ${result.outcome.detail}`,
          attemptNumber: result.attemptNumber,
        };
      }),
    );
  });
