/* eslint-disable @typescript-eslint/no-explicit-any --
 * The marketing tables were added after the generated Supabase types were
 * last produced, so the query builder is untyped here. Every row read below is
 * narrowed explicitly into the typed shapes exported from `@/lib/marketing`.
 */
/**
 * Autonomous marketing & growth intelligence — server side only.
 *
 * SECURITY: `requireSupabaseAuth` establishes the caller, and every statement
 * runs through the caller's own Supabase client, so the marketing tables'
 * `is_platform_admin(auth.uid())` policies are the real boundary. The admin RPC
 * is re-checked explicitly before anything is generated or written.
 *
 * NOTHING IN THIS FILE CONTACTS A SOCIAL PLATFORM. Publishing is attempted
 * through the platform adapters, and with no platform connected they return an
 * honest "requires configuration" state rather than a pretend success.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildGeography, type GeographyRow } from "@/lib/admin/geography";
import type {
  MarketingCampaign,
  MarketingSettings,
  PlatformCapability,
  PublicationRecord,
} from "@/lib/marketing/types";
import type { ContentHistoryEntry } from "@/lib/marketing/coverage";
import type { PlatformConnectionRecord } from "@/lib/marketing/platforms";
import type { GrowthOpportunitySummary } from "@/lib/marketing/market-intelligence";

const DAY = 86_400_000;

/** A readable sentence for the audit trail and the console. */
function attemptDetail(attempt: {
  record: { state: string; error: string | null; platformUrl: string | null };
}): string {
  if (attempt.record.state === "PUBLISHED")
    return `Published${attempt.record.platformUrl ? ` at ${attempt.record.platformUrl}` : ""}.`;
  return attempt.record.error ?? `Publication stopped at state ${attempt.record.state}.`;
}

async function assertAdmin(supabase: {
  rpc: (name: string) => Promise<{ data: unknown; error: unknown }>;
}) {
  const { data, error } = await supabase.rpc("is_platform_admin");
  if (error || data !== true) throw new Error("You don't have access to this area.");
}

export interface MarketingStudioSnapshot {
  settings: MarketingSettings;
  capabilities: PlatformCapability[];
  today: MarketingCampaign | null;
  recent: {
    id: string;
    planDate: string;
    status: string;
    source: string;
    topic: string;
    priority: number;
  }[];
  publications: PublicationRecord[];
  coverage: {
    slug: string;
    name: string;
    campaigns: number;
    daysSinceLast: number | null;
    state: string;
  }[];
  insights: { dimension: string; value: string; index: number; samples: number; note: string }[];
  /** Places with real demand, so the console can show what the engine saw. */
  demandPlaces: {
    slug: string;
    name: string;
    demandEvents: number;
    publishedSpaces: number;
    priority: string;
  }[];
}

/** Reads settings, falling back to the safe defaults on first run. */
async function readSettings(supabase: any): Promise<MarketingSettings> {
  const { defaultMarketingSettings } = await import("@/lib/marketing");
  const { data } = await supabase
    .from("marketing_settings")
    .select("settings")
    .eq("id", true)
    .maybeSingle();
  const stored = (data?.settings ?? null) as Partial<MarketingSettings> | null;
  return { ...defaultMarketingSettings(), ...(stored ?? {}) };
}

async function readConnections(supabase: any): Promise<PlatformConnectionRecord[]> {
  const { data } = await supabase
    .from("marketing_platform_connections")
    .select("platform, connection, scopes, expires_at, last_error");
  return ((data ?? []) as any[]).map((row) => ({
    platform: row.platform,
    connection: row.connection,
    scopes: row.scopes ?? [],
    expiresAt: row.expires_at ? Date.parse(row.expires_at) : null,
    lastError: row.last_error ?? null,
  }));
}

async function readHistory(supabase: any, now: number): Promise<ContentHistoryEntry[]> {
  const { data } = await supabase
    .from("marketing_campaigns")
    .select(
      "id, plan_date, opportunity_key, topic, audience, location_slug, hook, published_at, campaign",
    )
    .gte("plan_date", new Date(now - 120 * DAY).toISOString().slice(0, 10))
    .order("plan_date", { ascending: false })
    .limit(200);
  return ((data ?? []) as any[]).map((row) => ({
    campaignId: row.id,
    planDate: row.plan_date,
    opportunityKey: row.opportunity_key,
    topic: row.topic,
    locationSlug: row.location_slug,
    audience: row.audience,
    trigger: row.campaign?.opportunity?.trigger ?? "COVERAGE_GAP",
    hook: row.hook,
    publishedAt: row.published_at ? Date.parse(row.published_at) : null,
  }));
}

async function readDemand(supabase: any, now: number) {
  const { data } = await supabase.rpc("admin_demand_geography", {
    p_from: new Date(now - 30 * DAY).toISOString(),
    p_to: new Date(now).toISOString(),
  });
  const payload = (data ?? {}) as Record<string, unknown>;
  const rows = (Array.isArray(payload["places"]) ? payload["places"] : []) as GeographyRow[];
  return buildGeography(rows);
}

async function readGrowth(supabase: any): Promise<GrowthOpportunitySummary[]> {
  const { data } = await supabase
    .from("growth_opportunities")
    .select("key, situation, audience, scores, frequency")
    .order("frequency", { ascending: false })
    .limit(25);
  return ((data ?? []) as any[]).map((row) => ({
    key: row.key,
    problem: String(row.situation?.problem ?? row.situation?.summary ?? "storage need"),
    audience: String(row.audience?.primary ?? "RENTER"),
    locationSlug: row.situation?.location?.slug ?? null,
    locationName: row.situation?.location?.label ?? null,
    frequency: Number(row.frequency ?? 1),
    score: Number(row.scores?.opportunity ?? 0),
  }));
}

async function readPerformanceInsights(supabase: any, history: ContentHistoryEntry[]) {
  const { learningInsights } = await import("@/lib/marketing");
  const { data } = await supabase
    .from("marketing_performance")
    .select(
      "campaign_id, asset_id, platform, collected_at, metrics, conversions, platform_specific",
    )
    .limit(500);
  const records = ((data ?? []) as any[]).map((row) => ({
    campaignId: row.campaign_id,
    assetId: row.asset_id,
    platform: row.platform,
    collectedAt: Date.parse(row.collected_at),
    metrics: row.metrics ?? {},
    conversions: row.conversions ?? {},
    platformSpecific: row.platform_specific ?? {},
  }));
  return learningInsights({ records: records as any, history });
}

export const getMarketingStudio = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MarketingStudioSnapshot> => {
    const supabase = context.supabase as any;
    await assertAdmin(supabase);
    const now = Date.now();
    const { allCapabilities, coverageRows, londonDate } = await import("@/lib/marketing");

    const [settings, connections, history, places] = await Promise.all([
      readSettings(supabase),
      readConnections(supabase),
      readHistory(supabase, now),
      readDemand(supabase, now),
    ]);
    const insights = await readPerformanceInsights(supabase, history);

    const planDate = londonDate(now);
    const { data: todayRow } = await supabase
      .from("marketing_campaigns")
      .select("campaign, status, approved_at, decided_at, decision_note")
      .eq("plan_date", planDate)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: recentRows } = await supabase
      .from("marketing_campaigns")
      .select("id, plan_date, status, source, topic, priority")
      .order("plan_date", { ascending: false })
      .limit(20);

    const { data: pubRows } = await supabase
      .from("marketing_publications")
      .select(
        "campaign_id, asset_id, platform, state, platform_post_id, platform_url, error, retry_count, updated_at",
      )
      .order("updated_at", { ascending: false })
      .limit(60);

    return {
      settings,
      capabilities: allCapabilities(connections, settings, now),
      today: (todayRow?.campaign ?? null) as MarketingCampaign | null,
      recent: ((recentRows ?? []) as any[]).map((row) => ({
        id: row.id,
        planDate: row.plan_date,
        status: row.status,
        source: row.source,
        topic: row.topic,
        priority: row.priority,
      })),
      publications: ((pubRows ?? []) as any[]).map((row) => ({
        campaignId: row.campaign_id,
        assetId: row.asset_id,
        platform: row.platform,
        state: row.state,
        platformPostId: row.platform_post_id,
        platformUrl: row.platform_url,
        error: row.error,
        retryCount: row.retry_count ?? 0,
        updatedAt: Date.parse(row.updated_at),
      })),
      coverage: coverageRows(history, { now }).map((row) => ({
        slug: row.slug,
        name: row.name,
        campaigns: row.campaigns,
        daysSinceLast: row.daysSinceLast,
        state: row.state,
      })),
      insights: insights.map((insight) => ({
        dimension: insight.dimension,
        value: insight.value,
        index: insight.index,
        samples: insight.samples,
        note: insight.note,
      })),
      demandPlaces: places.slice(0, 12).map((place) => ({
        slug: place.slug,
        name: place.name,
        demandEvents: place.demandEvents,
        publishedSpaces: place.publishedSpaces,
        priority: place.priority,
      })),
    };
  });

const planSchema = z.object({ forceOpportunityKey: z.string().max(200).optional() });

export const planMarketingCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => planSchema.parse(data ?? {}))
  .handler(async ({ data, context }): Promise<{ campaign: MarketingCampaign; source: string }> => {
    const supabase = context.supabase as any;
    await assertAdmin(supabase);
    const now = Date.now();
    const { planDailyCampaign } = await import("@/lib/marketing");

    const [settings, history, places, growth] = await Promise.all([
      readSettings(supabase),
      readHistory(supabase, now),
      readDemand(supabase, now),
      readGrowth(supabase),
    ]);
    const insights = await readPerformanceInsights(supabase, history);

    const { data: idRows } = await supabase.from("marketing_campaigns").select("id").limit(1000);
    const existingIds = ((idRows ?? []) as any[]).map((row) => row.id as string);

    const plan = planDailyCampaign({
      now,
      settings,
      places,
      growth,
      history,
      insights,
      existingIds,
      publishedToday: history.filter(
        (entry) => entry.planDate === new Date(now).toISOString().slice(0, 10),
      ).length,
      ...(data.forceOpportunityKey ? { forceOpportunityKey: data.forceOpportunityKey } : {}),
    });

    const campaign = plan.campaign;
    const { error } = await supabase.from("marketing_campaigns").insert({
      id: campaign.id,
      plan_date: campaign.planDate,
      source: plan.source,
      status: campaign.status,
      priority: Math.round(campaign.score.priority),
      opportunity_key: campaign.opportunity.key,
      topic: campaign.opportunity.topic,
      audience: campaign.opportunity.audience,
      location_slug: campaign.opportunity.location?.slug ?? null,
      hook: campaign.story.hook,
      campaign,
    });
    if (error) throw new Error(error.message);

    await supabase.from("marketing_publications").insert(
      campaign.assets.map((asset) => ({
        campaign_id: campaign.id,
        asset_id: asset.id,
        platform: asset.platform,
        state: asset.state,
      })),
    );
    await supabase.from("marketing_audit").insert(
      campaign.audit.map((event) => ({
        campaign_id: campaign.id,
        action: event.action,
        detail: event.detail,
        actor: event.actor,
        actor_id: context.userId,
      })),
    );

    return { campaign, source: plan.source };
  });

const decisionSchema = z.object({
  campaignId: z.string().min(3).max(64),
  decision: z.enum(["APPROVE", "REJECT"]),
  note: z.string().max(500).optional(),
});

export const decideMarketingCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => decisionSchema.parse(data))
  .handler(async ({ data, context }): Promise<{ status: string }> => {
    const supabase = context.supabase as any;
    await assertAdmin(supabase);
    const approved = data.decision === "APPROVE";
    const status = approved ? "APPROVED" : "REJECTED";

    const { error } = await supabase
      .from("marketing_campaigns")
      .update({
        status,
        approved_by: approved ? context.userId : null,
        approved_at: approved ? new Date().toISOString() : null,
      })
      .eq("id", data.campaignId);
    if (error) throw new Error(error.message);

    await supabase
      .from("marketing_publications")
      .update({ state: approved ? "QUEUED" : "CANCELLED" })
      .eq("campaign_id", data.campaignId)
      .in("state", ["APPROVAL_REQUIRED", "VALIDATED", "QUEUED"]);

    await supabase.from("marketing_audit").insert({
      campaign_id: data.campaignId,
      action: approved ? "approved" : "rejected",
      detail: data.note ?? (approved ? "Approved by the founder." : "Rejected by the founder."),
      actor: "human",
      actor_id: context.userId,
    });

    return { status };
  });

/**
 * Attempts publication for each queued asset. With no platform connected this
 * records an honest AUTH_REQUIRED state — it never fabricates a published post.
 */
export const publishMarketingCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ campaignId: z.string().min(3).max(64) }).parse(data),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ results: { platform: string; state: string; detail: string }[] }> => {
      const supabase = context.supabase as any;
      await assertAdmin(supabase);
      const now = Date.now();
      const { attemptPublish, unconfiguredAdapter } = await import("@/lib/marketing");

      const [settings, connections] = await Promise.all([
        readSettings(supabase),
        readConnections(supabase),
      ]);
      const { data: row } = await supabase
        .from("marketing_campaigns")
        .select("campaign, status")
        .eq("id", data.campaignId)
        .maybeSingle();
      if (!row?.campaign) throw new Error("That campaign no longer exists.");
      const campaign = row.campaign as MarketingCampaign;
      if (row.status !== "APPROVED") throw new Error("Approve the campaign before publishing it.");

      const { data: pubRows } = await supabase
        .from("marketing_publications")
        .select(
          "campaign_id, asset_id, platform, state, platform_post_id, platform_url, error, retry_count, updated_at",
        )
        .eq("campaign_id", data.campaignId);

      const results: { platform: string; state: string; detail: string }[] = [];
      for (const asset of campaign.assets) {
        const existing = ((pubRows ?? []) as any[]).find((entry) => entry.asset_id === asset.id);
        const record: PublicationRecord = {
          campaignId: campaign.id,
          assetId: asset.id,
          platform: asset.platform,
          state: existing?.state ?? "QUEUED",
          platformPostId: existing?.platform_post_id ?? null,
          platformUrl: existing?.platform_url ?? null,
          error: existing?.error ?? null,
          retryCount: existing?.retry_count ?? 0,
          updatedAt: now,
        };
        if (record.state === "PUBLISHED") continue;

        const attempt = await attemptPublish({
          adapter: unconfiguredAdapter(asset.platform, settings),
          asset,
          campaign,
          connections,
          settings,
          record,
          now,
        });

        await supabase
          .from("marketing_publications")
          .update({
            state: attempt.record.state,
            platform_post_id: attempt.record.platformPostId,
            platform_url: attempt.record.platformUrl,
            error: attempt.record.error,
            retry_count: attempt.record.retryCount,
            published_at: attempt.record.state === "PUBLISHED" ? new Date(now).toISOString() : null,
          })
          .eq("campaign_id", campaign.id)
          .eq("asset_id", asset.id);

        await supabase.from("marketing_audit").insert({
          campaign_id: campaign.id,
          action: attempt.record.state === "PUBLISHED" ? "published" : "publication_blocked",
          detail: attemptDetail(attempt),
          actor: "engine",
          actor_id: context.userId,
        });

        results.push({
          platform: asset.platform,
          state: attempt.record.state,
          detail: attemptDetail(attempt),
        });
      }

      const published =
        results.every((result) => result.state === "PUBLISHED") && results.length > 0;
      if (published) {
        await supabase
          .from("marketing_campaigns")
          .update({ status: "PUBLISHED", published_at: new Date(now).toISOString() })
          .eq("id", campaign.id);
      }

      return { results };
    },
  );

const settingsSchema = z.object({
  globalMode: z.enum(["DRAFT", "APPROVAL_REQUIRED", "AUTONOMOUS"]).optional(),
  pauseAllPublishing: z.boolean().optional(),
  maxDailyPublications: z.number().int().min(0).max(20).optional(),
  pausedPlatforms: z.array(z.string().max(40)).max(20).optional(),
});

export const updateMarketingSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => settingsSchema.parse(data))
  .handler(async ({ data, context }): Promise<MarketingSettings> => {
    const supabase = context.supabase as any;
    await assertAdmin(supabase);
    const current = await readSettings(supabase);
    const next = { ...current, ...data } as MarketingSettings;

    const { error } = await supabase
      .from("marketing_settings")
      .upsert({ id: true, settings: next, updated_by: context.userId }, { onConflict: "id" });
    if (error) throw new Error(error.message);

    await supabase.from("marketing_audit").insert({
      action: "settings_updated",
      detail: `Mode ${next.globalMode}; publishing ${next.pauseAllPublishing ? "paused" : "active"}; max ${next.maxDailyPublications}/day.`,
      actor: "human",
      actor_id: context.userId,
    });

    return next;
  });
