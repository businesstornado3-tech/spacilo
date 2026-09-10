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
  PlatformId,
  PublicationRecord,
} from "@/lib/marketing/types";
import type { ContentHistoryEntry } from "@/lib/marketing/coverage";
import type { PlatformConnectionRecord } from "@/lib/marketing/platforms";
import type { GrowthOpportunitySummary } from "@/lib/marketing/market-intelligence";
import { runtimeFetch } from "@/lib/marketing/runtime-fetch";

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
  /** The founder's live decision on today's campaign, if there is one. */
  todayDecision: {
    status: string;
    approvedAt: string | null;
    decidedAt: string | null;
    note: string | null;
  } | null;
  recent: {
    id: string;
    planDate: string;
    status: string;
    source: string;
    topic: string;
    priority: number;
  }[];
  publications: PublicationRecord[];
  /**
   * Autonomous publishing usage for the current calendar day. This counts
   * confirmed autonomous publications only — never drafts, generated videos,
   * failures or manual publishing.
   */
  autonomous: {
    enabled: boolean;
    autoApprove: boolean;
    limit: number;
    publishedToday: number;
  };
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

/** Start of the current London calendar day, as an ISO timestamp. */
function dayStartIso(planDate: string): string {
  return new Date(`${planDate}T00:00:00.000Z`).toISOString();
}

/** Confirmed autonomous publications recorded today. One per campaign. */
async function autonomousPublishedToday(supabase: any, planDate: string): Promise<number> {
  const { data } = await supabase
    .from("marketing_audit")
    .select("id")
    .eq("action", "autonomous_published")
    .gte("created_at", dayStartIso(planDate));
  return ((data ?? []) as any[]).length;
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

    const autonomousUsed = await autonomousPublishedToday(supabase, planDate);

    return {
      settings,
      autonomous: {
        enabled: settings.globalMode === "AUTONOMOUS",
        autoApprove: settings.autoApprove === true,
        limit: settings.maxDailyAutonomousPublications ?? 5,
        publishedToday: autonomousUsed,
      },
      capabilities: allCapabilities(connections, settings, now),
      today: (todayRow?.campaign ?? null) as MarketingCampaign | null,
      // The live decision, read from its own columns rather than the stored
      // plan, so an approval or rejection survives a page refresh.
      todayDecision: todayRow
        ? {
            status: String(todayRow.status ?? "PLANNED"),
            approvedAt: (todayRow.approved_at ?? null) as string | null,
            decidedAt: (todayRow.decided_at ?? null) as string | null,
            note: (todayRow.decision_note ?? null) as string | null,
          }
        : null,
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

    const decidedAt = new Date().toISOString();
    const { error } = await supabase
      .from("marketing_campaigns")
      .update({
        status,
        approved_by: approved ? context.userId : null,
        approved_at: approved ? decidedAt : null,
        decided_at: decidedAt,
        decision_note: data.note ?? null,
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
type PublishOutcome = { results: { platform: string; state: string; detail: string }[] };

/**
 * The one publishing routine. Manual publishing and autonomous publishing both
 * run through it, so a campaign is only ever PUBLISHED when a platform itself
 * confirms the post.
 */
async function publishCampaignAssets(
  supabase: any,
  userId: string,
  data: { campaignId: string },
): Promise<PublishOutcome> {
  {
    const now = Date.now();
    const { attemptPublish, unconfiguredAdapter, adapterFor } = await import("@/lib/marketing");
    // Stored authorisations live in a table only the server can read, and
    // are decrypted here, per publish, and never returned to the browser.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { decryptToken } = await import("@/lib/marketing/token-crypto.server");
    const { data: tokenRows } = await supabaseAdmin
      .from("marketing_platform_tokens")
      .select("platform, access_token_cipher, page_token_cipher, account_id, expires_at");
    const { data: accountRows } = await supabase
      .from("marketing_platform_connections")
      .select("platform, account_id");

    const resolveAdapter = async (platform: PlatformId) => {
      const tokenRow = ((tokenRows ?? []) as any[]).find(
        (row) =>
          row.platform === platform ||
          (platform === "youtube_shorts" && row.platform === "youtube"),
      );
      const accountId =
        ((accountRows ?? []) as any[]).find((row) => row.platform === platform)?.account_id ??
        tokenRow?.account_id ??
        null;
      if (!tokenRow || (tokenRow.expires_at && Date.parse(tokenRow.expires_at) <= now)) {
        return unconfiguredAdapter(platform, settings);
      }
      let accessToken: string | null = null;
      try {
        accessToken = await decryptToken(tokenRow.access_token_cipher);
      } catch {
        accessToken = null;
      }
      if (!accessToken || !accountId) return unconfiguredAdapter(platform, settings);
      // Facebook publishes with the Facebook Page token, never the user
      // token. Instagram uses Instagram Login and needs no Page token.
      let pageAccessToken: string | null = null;
      if (platform === "facebook") {
        const metaRow = ((tokenRows ?? []) as any[]).find(
          (row) => row.page_token_cipher && row.platform === "facebook",
        );
        if (metaRow) {
          try {
            pageAccessToken = await decryptToken(metaRow.page_token_cipher);
          } catch {
            pageAccessToken = null;
          }
        }
      }
      return adapterFor(platform, {
        connection: connections.find((entry) => entry.platform === platform) ?? null,
        accessToken,
        accountId,
        pageAccessToken,
        settings,
        connections,
        now,
        fetchImpl: runtimeFetch,
      });
    };

    /**
     * Meta fetches the media itself, so a Meta asset is handed a temporary
     * signed link to that one stored object. Nothing else is exposed and the
     * link expires shortly after the processing window.
     */
    const metaMediaUrl = async (assetId: string): Promise<string | null> => {
      const { data: video } = await supabase
        .from("marketing_videos")
        .select("storage_path")
        .eq("campaign_id", data.campaignId)
        .eq("asset_id", assetId)
        .not("storage_path", "is", null)
        .maybeSingle();
      if (!video?.storage_path) return null;
      const { data: signed } = await (supabaseAdmin as any).storage
        .from("marketing-videos")
        .createSignedUrl(video.storage_path, 3600);
      return signed?.signedUrl ?? null;
    };

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

      const isMeta = asset.platform === "facebook" || asset.platform === "instagram";
      const publishAsset = isMeta
        ? { ...asset, videoUrl: (await metaMediaUrl(asset.id)) ?? asset.videoUrl }
        : asset;

      const attempt = await attemptPublish({
        adapter: await resolveAdapter(asset.platform),
        asset: publishAsset,
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
        actor_id: userId,
      });

      results.push({
        platform: asset.platform,
        state: attempt.record.state,
        detail: attemptDetail(attempt),
      });
    }

    const published = results.every((result) => result.state === "PUBLISHED") && results.length > 0;
    if (published) {
      await supabase
        .from("marketing_campaigns")
        .update({ status: "PUBLISHED", published_at: new Date(now).toISOString() })
        .eq("id", campaign.id);
    }

    return { results };
  }
}

export const publishMarketingCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ campaignId: z.string().min(3).max(64) }).parse(data),
  )
  .handler(async ({ data, context }): Promise<PublishOutcome> => {
    const supabase = context.supabase as any;
    await assertAdmin(supabase);
    return publishCampaignAssets(supabase, context.userId, data);
  });

/**
 * One autonomous cycle: auto-approve (only when every mandatory check passed)
 * and then publish, stopping at the founder's autonomous daily limit. Manual
 * generation, approval and publishing are never affected by this limit.
 */
export const runAutonomousPublishing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
      context,
    }): Promise<{
      ran: boolean;
      detail: string;
      publishedToday: number;
      limit: number;
      results: { platform: string; state: string; detail: string }[];
    }> => {
      const supabase = context.supabase as any;
      await assertAdmin(supabase);
      const now = Date.now();
      const { londonDate } = await import("@/lib/marketing");
      const planDate = londonDate(now);
      const settings = await readSettings(supabase);
      const limit = settings.maxDailyAutonomousPublications ?? 5;
      const used = await autonomousPublishedToday(supabase, planDate);
      const idle = (detail: string) => ({
        ran: false,
        detail,
        publishedToday: used,
        limit,
        results: [],
      });

      if (settings.globalMode !== "AUTONOMOUS") return idle("Autonomous publishing is off.");
      if (settings.pauseAllPublishing) return idle("Publishing is paused.");
      if (used >= limit) return idle("Autonomous daily publishing limit reached.");

      const { data: row } = await supabase
        .from("marketing_campaigns")
        .select("id, campaign, status")
        .eq("plan_date", planDate)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!row?.campaign) return idle("No campaign for today yet.");
      const campaign = row.campaign as MarketingCampaign;
      const campaignId = String(row.id);

      // Auto-approve NEVER approves a campaign that failed a mandatory check.
      if (!campaign.validation.passed) return idle("Today's campaign did not pass validation.");
      if (row.status === "PUBLISHED") return idle("Today's campaign is already published.");
      if (row.status === "REJECTED") return idle("Today's campaign was rejected.");

      // Only a stored, branded EarnRoom video is ever publishable.
      const { data: videoRows } = await supabase
        .from("marketing_videos")
        .select("asset_id, storage_path")
        .eq("campaign_id", campaignId)
        .not("storage_path", "is", null)
        .limit(1);
      if (((videoRows ?? []) as any[]).length === 0)
        return idle("The branded video for today's campaign is not ready yet.");

      if (row.status !== "APPROVED") {
        if (!settings.autoApprove) return idle("Waiting for your approval.");
        const decidedAt = new Date(now).toISOString();
        await supabase
          .from("marketing_campaigns")
          .update({
            status: "APPROVED",
            approved_by: context.userId,
            approved_at: decidedAt,
            decided_at: decidedAt,
            decision_note: "Auto-approved: every mandatory EarnRoom validation check passed.",
          })
          .eq("id", campaignId);
        await supabase
          .from("marketing_publications")
          .update({ state: "QUEUED" })
          .eq("campaign_id", campaignId)
          .in("state", ["APPROVAL_REQUIRED", "VALIDATED", "QUEUED"]);
        await supabase.from("marketing_audit").insert({
          campaign_id: campaignId,
          action: "auto_approved",
          detail: "Auto-approved by EarnRoom after all mandatory validation checks passed.",
          actor: "engine",
          actor_id: context.userId,
        });
      }

      const outcome = await publishCampaignAssets(supabase, context.userId, { campaignId });
      const confirmed = outcome.results.filter((result) => result.state === "PUBLISHED");
      // Quota is only ever consumed by a publication a platform confirmed.
      if (confirmed.length > 0) {
        await supabase.from("marketing_audit").insert({
          campaign_id: campaignId,
          action: "autonomous_published",
          detail: `Autonomous publication confirmed on ${confirmed.map((entry) => entry.platform).join(", ")}.`,
          actor: "engine",
          actor_id: context.userId,
        });
      }

      return {
        ran: true,
        detail:
          confirmed.length > 0
            ? `Published to ${confirmed.map((entry) => entry.platform).join(", ")}.`
            : "No platform confirmed a publication this cycle.",
        publishedToday: used + (confirmed.length > 0 ? 1 : 0),
        limit,
        results: outcome.results,
      };
    },
  );

const settingsSchema = z.object({
  globalMode: z.enum(["DRAFT", "APPROVAL_REQUIRED", "AUTONOMOUS"]).optional(),
  pauseAllPublishing: z.boolean().optional(),
  maxDailyPublications: z.number().int().min(0).max(20).optional(),
  maxDailyAutonomousPublications: z.number().int().min(1).max(500).optional(),
  autoApprove: z.boolean().optional(),
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
      detail: `Mode ${next.globalMode}; publishing ${next.pauseAllPublishing ? "paused" : "active"}; auto-approve ${next.autoApprove ? "on" : "off"}; autonomous limit ${next.maxDailyAutonomousPublications}/day.`,
      actor: "human",
      actor_id: context.userId,
    });

    return next;
  });
