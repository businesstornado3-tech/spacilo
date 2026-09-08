/**
 * Real acquisition status — server side only.
 *
 * Everything returned here is read from production tables or from server-side
 * configuration. Nothing is estimated, nothing is simulated and a channel can
 * only read LIVE when a stored authorisation, a destination and a permission
 * genuinely exist. If there are no real users, the funnel shows zero.
 */
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ChannelDiagnostic, FunnelEvidence } from "@/lib/marketing/acquisition";

export type CampaignSendRow = {
  channel: string;
  campaignId: string;
  assetId: string | null;
  executionMode: "LIVE" | "MOCK";
  destination: string | null;
  attemptedAt: string | null;
  externalPlatform: string | null;
  externalId: string | null;
  externalUrl: string | null;
  status: string;
  error: string | null;
  retryCount: number;
};

export type AcquisitionSnapshot = {
  channels: ChannelDiagnostic[];
  evidence: FunnelEvidence;
  sends: CampaignSendRow[];
  /** Names of platforms whose application credentials are set up server-side. */
  configuredPlatforms: string[];
  tokenEncryptionConfigured: boolean;
};

async function assertAdmin(supabase: any): Promise<void> {
  const { data, error } = await supabase.rpc("is_platform_admin");
  if (error || data !== true) throw new Error("You don't have access to this area.");
}

export const getAcquisitionStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AcquisitionSnapshot> => {
    const supabase = context.supabase as any;
    await assertAdmin(supabase);
    const now = Date.now();

    const {
      socialChannelStatus,
      outreachChannelStatus,
      PLATFORMS,
      capabilityFor,
      defaultMarketingSettings,
      oauthDefinition,
    } = await import("@/lib/marketing");
    const { defaultChannels, growthConfig, getAdapter } = await import("@/lib/growth");
    const { tokenEncryptionConfigured } = await import("@/lib/marketing/token-crypto.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: settingsRow }, { data: connectionRows }, { data: publicationRows }] =
      await Promise.all([
        supabase.from("marketing_settings").select("settings").eq("id", true).maybeSingle(),
        supabase
          .from("marketing_platform_connections")
          .select("platform, connection, scopes, expires_at, last_error, account_id"),
        supabase
          .from("marketing_publications")
          .select(
            "campaign_id, asset_id, platform, state, platform_post_id, platform_url, error, retry_count, published_at, updated_at",
          )
          .order("updated_at", { ascending: false })
          .limit(100),
      ]);

    const settings = { ...defaultMarketingSettings(), ...((settingsRow?.settings ?? {}) as object) };
    const connections = ((connectionRows ?? []) as any[]).map((row) => ({
      platform: row.platform,
      connection: row.connection,
      scopes: row.scopes ?? [],
      expiresAt: row.expires_at ? Date.parse(row.expires_at) : null,
      lastError: row.last_error ?? null,
    }));

    // Token presence only — the ciphertext itself never leaves the server.
    const { data: tokenRows } = await supabaseAdmin
      .from("marketing_platform_tokens")
      .select("platform, expires_at");

    const configuredPlatforms: string[] = [];
    const channels: ChannelDiagnostic[] = PLATFORMS.map((def) => {
      const oauth = oauthDefinition(def.id);
      const credentialsConfigured = Boolean(
        process.env[oauth.clientIdSecret] && process.env[oauth.clientSecretSecret],
      );
      if (credentialsConfigured) configuredPlatforms.push(def.label);
      const capability = capabilityFor(def.id, connections as any, settings as any, now);
      const record = ((connectionRows ?? []) as any[]).find((row) => row.platform === def.id);
      const token = ((tokenRows ?? []) as any[]).find(
        (row) => row.platform === def.id || (def.id === "youtube_shorts" && row.platform === "youtube"),
      );
      const lastPublication = ((publicationRows ?? []) as any[]).find(
        (row) => row.platform === def.id,
      );
      return socialChannelStatus({
        platform: def.id,
        label: def.label,
        credentialsConfigured,
        connection: capability.connection,
        hasStoredToken: Boolean(token && (!token.expires_at || Date.parse(token.expires_at) > now)),
        hasDestinationAccount: Boolean(record?.account_id),
        paused: capability.paused,
        publicPublishingApproved: def.apiAutonomousSupported,
        approvalNote: oauth.approvalNote,
        lastError: record?.last_error ?? lastPublication?.error ?? null,
        lastPublicationState: lastPublication?.state ?? null,
      });
    });

    const config = growthConfig();
    for (const channel of defaultChannels()) {
      channels.push(
        outreachChannelStatus({
          channel: channel.id,
          label: channel.label,
          enabled: channel.enabled,
          paused: config.pausedChannels.includes(channel.id),
          emergencyStop: config.emergencyStop,
          deliveryMode: channel.deliveryMode as "live" | "mock" | "none",
          credentialState: channel.credentialState,
          termsStatus: channel.termsStatus,
          adapterTransmits: Boolean(getAdapter(channel.id)?.transmits),
        }),
      );
    }

    const count = async (
      table: string,
      build: (query: any) => any = (query) => query,
    ): Promise<number> => {
      const { count: value } = await build(
        supabaseAdmin.from(table).select("*", { count: "exact", head: true }),
      );
      return value ?? 0;
    };

    const publications = (publicationRows ?? []) as any[];
    const confirmed = publications.filter(
      (row) => row.state === "PUBLISHED" && Boolean(row.platform_post_id),
    );

    const [
      opportunities,
      interpreted,
      marketingCampaigns,
      growthCampaigns,
      generatedVideos,
      attributedTouches,
      registrations,
      bookings,
      completedBookings,
      liveAttempts,
    ] = await Promise.all([
      count("growth_opportunities"),
      count("growth_opportunities", (query) => query.not("intelligence", "is", null)),
      count("marketing_campaigns"),
      count("growth_campaigns"),
      count("marketing_videos", (query) => query.eq("status", "GENERATED")),
      count("growth_attributions", (query) => query.not("campaign_id", "is", null)),
      count("growth_attributions", (query) => query.eq("event_name", "signup_completed")),
      count("growth_attributions", (query) => query.eq("event_name", "booking_created")),
      count("growth_attributions", (query) => query.eq("event_name", "booking_completed")),
      count("growth_campaign_attempts", (query) => query.not("provider_reference", "is", null)),
    ]);

    const evidence: FunnelEvidence = {
      opportunities,
      interpreted,
      campaigns: marketingCampaigns + growthCampaigns,
      contentGenerated: generatedVideos,
      validated: publications.filter(
        (row) => !["GENERATED", "VALIDATING", "VALIDATION_FAILED"].includes(row.state),
      ).length,
      eligibleForDelivery: publications.filter((row) =>
        ["QUEUED", "APPROVED", "UPLOADING", "PUBLISHED"].includes(row.state),
      ).length,
      realDeliveries: confirmed.length + liveAttempts,
      referredVisits: attributedTouches,
      registrations,
      bookings,
      completedBookings,
    };

    const { data: attemptRows } = await supabaseAdmin
      .from("growth_campaign_attempts")
      .select("campaign_id, attempt_number, status, provider_reference, error_code, attempted_at, metadata")
      .order("attempted_at", { ascending: false })
      .limit(30);

    const sends: CampaignSendRow[] = [
      ...publications.slice(0, 30).map((row) => ({
        channel: row.platform,
        campaignId: row.campaign_id,
        assetId: row.asset_id,
        executionMode: (row.platform_post_id ? "LIVE" : "MOCK") as "LIVE" | "MOCK",
        destination: row.platform_url ?? null,
        attemptedAt: row.published_at ?? row.updated_at ?? null,
        externalPlatform: row.platform,
        externalId: row.platform_post_id ?? null,
        externalUrl: row.platform_url ?? null,
        status: row.state,
        error: row.error ?? null,
        retryCount: row.retry_count ?? 0,
      })),
      ...((attemptRows ?? []) as any[]).map((row) => ({
        channel: String(row.metadata?.channel ?? "outreach"),
        campaignId: row.campaign_id,
        assetId: null,
        executionMode: (row.provider_reference ? "LIVE" : "MOCK") as "LIVE" | "MOCK",
        destination: null,
        attemptedAt: row.attempted_at ?? null,
        externalPlatform: row.provider_reference ? String(row.metadata?.channel ?? "") : null,
        externalId: row.provider_reference ?? null,
        externalUrl: null,
        status: row.status,
        error: row.error_code ?? null,
        retryCount: Math.max(0, (row.attempt_number ?? 1) - 1),
      })),
    ];

    return {
      channels,
      evidence,
      sends,
      configuredPlatforms,
      tokenEncryptionConfigured: tokenEncryptionConfigured(),
    };
  });
