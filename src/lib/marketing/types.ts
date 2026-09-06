/**
 * EarnRoom autonomous marketing & growth intelligence — contracts.
 *
 * This layer ORCHESTRATES existing EarnRoom intelligence (growth opportunities,
 * demand geography, discovery/SEO taxonomy). It deliberately owns no signal of
 * its own: every marketing opportunity must carry the evidence it came from and
 * an honest label saying whether that evidence is real marketplace demand, a
 * search/content opportunity, or a demand-creation hypothesis.
 *
 * Pure module: no database access, no clock, no vendor SDK.
 */

type Open<T extends string> = T | (string & {});

/* ------------------------------------------------------------- opportunity */

export type MarketingTrigger =
  | "MARKET_DEMAND"
  | "SUPPLY_GAP"
  | "SEO_OPPORTUNITY"
  | "LOCAL_OPPORTUNITY"
  | "SEASONAL"
  | "USER_PAIN_POINT"
  | "DEMAND_CREATION"
  | "PERFORMANCE_LEARNING"
  | "STRATEGIC_COVERAGE";

/**
 * How strong the underlying evidence actually is. This is the honesty label:
 * a demand-creation campaign is never presented as observed market demand.
 */
export type EvidenceClass =
  | "REAL_MARKET_DEMAND"
  | "SEO_OPPORTUNITY"
  | "MARKETING_OPPORTUNITY"
  | "DEMAND_CREATION_OPPORTUNITY"
  | "STRATEGIC_COVERAGE";

export type MarketingObjective =
  | "RENTER_ACQUISITION"
  | "HOST_ACQUISITION"
  | "BOTH_SIDES"
  | "BRAND_AWARENESS"
  | "SEO_GROWTH"
  | "DEMAND_CREATION"
  | "MARKETPLACE_LIQUIDITY";

export type MarketingAudience = Open<
  | "renters"
  | "hosts"
  | "movers"
  | "students"
  | "families"
  | "businesses"
  | "downsizers"
  | "renovators"
  | "both_sides"
>;

export type MarketingEvidence = {
  /** Human sentence a founder can read and check. */
  statement: string;
  /** Where it came from: geography rpc, growth opportunity, topic catalogue… */
  source: Open<"demand_geography" | "growth_opportunity" | "seo_catalogue" | "seasonal_calendar" | "coverage_gap" | "performance_history">;
  /** Raw supporting value where one exists (event counts, spaces…). */
  value?: number | null;
};

export type MarketingLocation = { slug: string; name: string } | null;

export type MarketingOpportunity = {
  /** Deterministic within a day: same inputs produce the same key. */
  key: string;
  trigger: MarketingTrigger;
  evidenceClass: EvidenceClass;
  /** Short internal title, e.g. "Portsmouth — moving-house storage". */
  title: string;
  /** The human problem, stated plainly. */
  problem: string;
  topic: string;
  audience: MarketingAudience;
  secondaryAudience: MarketingAudience | null;
  objective: MarketingObjective;
  location: MarketingLocation;
  /** Why the engine surfaced this today. */
  rationale: string;
  evidence: readonly MarketingEvidence[];
  /** 0..1 signal strength before scoring/blending. */
  strength: number;
  /**
   * True only where real published supply exists for this opportunity. Content
   * may not say a space is available unless this is true.
   */
  mayClaimAvailability?: boolean;
};

/* ----------------------------------------------------------------- scoring */

export type ScoreFactor = { name: string; value: number; weight: number; note: string };

export type CampaignScore = {
  /** 0..100 internal priority. Never a revenue forecast. */
  priority: number;
  factors: readonly ScoreFactor[];
  /** Present when duplication protection reduced the score. */
  duplicationPenalty: number;
  reason: string;
};

/* ------------------------------------------------------------------- story */

export type StoryFormat =
  | "PROBLEM_SOLUTION"
  | "BEFORE_AFTER"
  | "PERSON_PAIN_DISCOVERY_RESOLUTION"
  | "WHAT_WOULD_YOU_DO"
  | "LOCAL_STORY"
  | "SEASONAL_STORY"
  | "EDUCATIONAL"
  | "HOST_OPPORTUNITY"
  | "RENTER_STORY"
  | "TWO_SIDED";

export type StoryScene = {
  index: number;
  /** What is on screen. Illustrative, never a claimed real customer. */
  visual: string;
  /** Spoken/voiceover line. */
  voiceover: string;
  /** On-screen caption. */
  caption: string;
  seconds: number;
};

export type CampaignStory = {
  format: StoryFormat;
  hook: string;
  scenes: readonly StoryScene[];
  renterCta: string;
  hostCta: string | null;
  /** True when the person in the story is illustrative, not a real customer. */
  illustrative: boolean;
  /** Total planned runtime in seconds. */
  seconds: number;
};

/* ------------------------------------------------------------------ assets */

export type PlatformId =
  | "youtube"
  | "youtube_shorts"
  | "instagram"
  | "tiktok"
  | "facebook"
  | "linkedin"
  | "pinterest";

export type AspectRatio = "9:16" | "16:9" | "1:1";

export type PlatformAsset = {
  id: string;
  platform: PlatformId;
  aspect: AspectRatio;
  /** Platform-native hook — not a copy/paste of the same line everywhere. */
  hook: string;
  title: string;
  description: string;
  caption: string;
  hashtags: readonly string[];
  cta: string;
  seconds: number;
  state: PublicationState;
  /** Populated only when a provider actually produced a file. */
  videoUrl: string | null;
  thumbnailUrl: string | null;
  /** Why no video exists yet, when that is the case. */
  videoStatus: VideoStatus;
};

/* ------------------------------------------------------------- video layer */

export type ProviderState = "NOT_CONFIGURED" | "CONFIGURED" | "CONNECTED" | "ERROR" | "UNAVAILABLE";

export type VideoStatus =
  | "NOT_REQUESTED"
  | "PROVIDER_NOT_CONFIGURED"
  | "GENERATING"
  | "GENERATED"
  | "FAILED";

export type VideoRequest = {
  campaignId: string;
  assetId: string;
  aspect: AspectRatio;
  seconds: number;
  scenes: readonly StoryScene[];
  /** Brand lock-up, colours and end card the provider must respect. */
  brandProfileId: string;
};

export type VideoResult =
  | { ok: true; videoUrl: string; thumbnailUrl: string | null; providerId: string; seconds: number }
  | { ok: false; status: VideoStatus; providerId: string | null; reason: string };

export interface VideoGenerationProvider {
  id: string;
  name: string;
  state: ProviderState;
  capabilities: {
    video: boolean;
    voiceover: boolean;
    captions: boolean;
    thumbnail: boolean;
  };
  generate(request: VideoRequest): Promise<VideoResult>;
}

/* -------------------------------------------------------------- publishing */

export type PublishingMode = "DRAFT" | "APPROVAL_REQUIRED" | "AUTONOMOUS";

export type PublicationState =
  | "GENERATED"
  | "VALIDATING"
  | "VALIDATED"
  | "APPROVAL_REQUIRED"
  | "APPROVED"
  | "QUEUED"
  | "UPLOADING"
  | "PUBLISHED"
  | "VALIDATION_FAILED"
  | "AUTH_REQUIRED"
  | "UPLOAD_FAILED"
  | "PLATFORM_REJECTED"
  | "PAUSED"
  | "CANCELLED";

export type ConnectionState =
  | "NOT_CONNECTED"
  | "CONNECTED"
  | "AUTH_EXPIRED"
  | "INSUFFICIENT_PERMISSIONS"
  | "REQUIRES_CONFIGURATION";

export type PlatformCapability = {
  platform: PlatformId;
  label: string;
  connection: ConnectionState;
  /** Whether the official API supports programmatic publishing for us today. */
  publishingSupported: boolean;
  /** Whether unattended publishing is possible right now. */
  autonomousAvailable: boolean;
  mode: PublishingMode;
  paused: boolean;
  /** Plain-language status shown in the founder console. */
  statusLabel: string;
  reason: string;
  aspects: readonly AspectRatio[];
  maxSeconds: number;
};

export type PublishResult =
  | { ok: true; platformPostId: string; platformUrl: string | null; publishedAt: number }
  | { ok: false; state: PublicationState; error: string; retryable: boolean };

export interface PublishingAdapter {
  platform: PlatformId;
  capability(): PlatformCapability;
  publish(asset: PlatformAsset, campaign: MarketingCampaign): Promise<PublishResult>;
}

export type PublicationRecord = {
  campaignId: string;
  assetId: string;
  platform: PlatformId;
  state: PublicationState;
  platformPostId: string | null;
  platformUrl: string | null;
  updatedAt: number;
  error: string | null;
  retryCount: number;
};

/* ------------------------------------------------------------- validation */

export type ValidationCheckId =
  | "brand"
  | "claims"
  | "licensing"
  | "personal_data"
  | "sensitive_content"
  | "platform"
  | "duplicate"
  | "frequency"
  | "cta"
  | "url"
  | "availability"
  | "statistics"
  | "uk_conventions"
  | "safety";

export type ValidationCheck = {
  id: ValidationCheckId;
  passed: boolean;
  detail: string;
};

export type ValidationReport = {
  passed: boolean;
  checks: readonly ValidationCheck[];
  failures: readonly string[];
};

/* --------------------------------------------------------------- campaign */

export type MarketingCampaign = {
  /** Registry id, e.g. ER-CAMP-2026-000001. */
  id: string;
  createdAt: number;
  /** Local date (Europe/London) the campaign was planned for. */
  planDate: string;
  opportunity: MarketingOpportunity;
  score: CampaignScore;
  story: CampaignStory;
  assets: readonly PlatformAsset[];
  validation: ValidationReport;
  /** Effective publishing mode for the campaign as a whole. */
  mode: PublishingMode;
  status: Open<"DRAFT" | "AWAITING_APPROVAL" | "APPROVED" | "REJECTED" | "SCHEDULED" | "PUBLISHED" | "FAILED">;
  scheduledFor: number | null;
  audit: readonly AuditEvent[];
};

export type AuditEvent = {
  at: number;
  action: Open<
    | "campaign_created"
    | "content_generated"
    | "validated"
    | "validation_failed"
    | "approved"
    | "rejected"
    | "edited"
    | "regenerated"
    | "scheduled"
    | "publish_attempted"
    | "published"
    | "publish_failed"
    | "paused"
    | "performance_recorded"
  >;
  detail: string;
  actor: Open<"engine" | "founder" | "platform">;
};

/* ------------------------------------------------- performance & learning */

export type PlatformMetrics = {
  impressions: number | null;
  views: number | null;
  watchSeconds: number | null;
  completionRate: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  clicks: number | null;
};

export type ConversionMetrics = {
  siteVisits: number | null;
  registrations: number | null;
  hostRegistrations: number | null;
  renterRegistrations: number | null;
  enquiries: number | null;
  listings: number | null;
  bookings: number | null;
};

export type PerformanceRecord = {
  campaignId: string;
  assetId: string;
  platform: PlatformId;
  collectedAt: number;
  metrics: PlatformMetrics;
  conversions: ConversionMetrics;
  /** Raw platform payload keys we preserved but do not normalise. */
  platformSpecific: Readonly<Record<string, number>>;
};

export type LearningInsight = {
  dimension: Open<"hook" | "topic" | "location" | "audience" | "format" | "length" | "cta" | "platform" | "objective">;
  value: string;
  /** Observations behind the insight — never a single data point. */
  samples: number;
  /** Normalised 0..1 performance index across samples. */
  index: number;
  note: string;
};

/* --------------------------------------------------------------- settings */

export type ContentMixKey = Open<
  "market_intelligence" | "seo" | "demand_creation" | "host_acquisition" | "renter_acquisition" | "brand_awareness"
>;

export type MarketingSettings = {
  /** Meaningful primary campaigns per day. */
  dailyCampaignTarget: number;
  maxDailyPublications: number;
  globalMode: PublishingMode;
  platformModes: Partial<Record<PlatformId, PublishingMode>>;
  /** Emergency control — generation continues, publishing stops. */
  pauseAllPublishing: boolean;
  pausedPlatforms: readonly PlatformId[];
  /** Relative weights, not hard-coded percentages. */
  contentMix: Record<ContentMixKey, number>;
  /** Places recently covered are deprioritised for this many days. */
  geographicCooldownDays: number;
};
