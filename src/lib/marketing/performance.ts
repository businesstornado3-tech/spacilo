/**
 * Marketing performance ingestion and the learning loop.
 *
 * Learning here changes which campaigns are RECOMMENDED. It never retrains or
 * modifies any underlying AI model, and it never invents a metric a platform
 * did not report — an unreported metric stays null and is excluded.
 */
import type { LearningInsight, PerformanceRecord, PlatformMetrics } from "./types";
import type { ContentHistoryEntry } from "./coverage";

export function emptyMetrics(): PlatformMetrics {
  return {
    impressions: null,
    views: null,
    watchSeconds: null,
    completionRate: null,
    likes: null,
    comments: null,
    shares: null,
    saves: null,
    clicks: null,
  };
}

/**
 * Normalises a platform payload into the internal model while preserving the
 * platform's own keys untouched in `platformSpecific`.
 */
export function normalisePerformance(input: {
  campaignId: string;
  assetId: string;
  platform: PerformanceRecord["platform"];
  collectedAt: number;
  raw: Readonly<Record<string, unknown>>;
  conversions?: Partial<PerformanceRecord["conversions"]>;
}): PerformanceRecord {
  const num = (...keys: string[]): number | null => {
    for (const key of keys) {
      const value = input.raw[key];
      if (typeof value === "number" && Number.isFinite(value)) return value;
    }
    return null;
  };

  const views = num("views", "video_views", "plays", "impressions_video");
  const watchSeconds = num(
    "watch_seconds",
    "estimatedMinutesWatched_seconds",
    "total_time_watched",
  );
  const completion = num("completion_rate", "average_view_percentage");

  const platformSpecific: Record<string, number> = {};
  for (const [key, value] of Object.entries(input.raw)) {
    if (typeof value === "number" && Number.isFinite(value)) platformSpecific[key] = value;
  }

  return {
    campaignId: input.campaignId,
    assetId: input.assetId,
    platform: input.platform,
    collectedAt: input.collectedAt,
    metrics: {
      impressions: num("impressions", "reach"),
      views,
      watchSeconds,
      completionRate: completion === null ? null : completion > 1 ? completion / 100 : completion,
      likes: num("likes", "reactions", "favorites"),
      comments: num("comments", "comment_count"),
      shares: num("shares", "share_count"),
      saves: num("saves", "saved"),
      clicks: num("clicks", "link_clicks", "outbound_clicks"),
    },
    conversions: {
      siteVisits: input.conversions?.siteVisits ?? null,
      registrations: input.conversions?.registrations ?? null,
      hostRegistrations: input.conversions?.hostRegistrations ?? null,
      renterRegistrations: input.conversions?.renterRegistrations ?? null,
      enquiries: input.conversions?.enquiries ?? null,
      listings: input.conversions?.listings ?? null,
      bookings: input.conversions?.bookings ?? null,
    },
    platformSpecific,
  };
}

/** 0..1 index blending engagement and, where known, real conversions. */
export function performanceIndex(record: PerformanceRecord): number | null {
  const { metrics, conversions } = record;
  const views = metrics.views ?? metrics.impressions;
  if (!views || views <= 0) return null;
  const engagement =
    ((metrics.likes ?? 0) +
      (metrics.comments ?? 0) * 2 +
      (metrics.shares ?? 0) * 3 +
      (metrics.saves ?? 0) * 2) /
    views;
  const clickRate = (metrics.clicks ?? 0) / views;
  const conversionCount =
    (conversions.registrations ?? 0) +
    (conversions.listings ?? 0) * 2 +
    (conversions.bookings ?? 0) * 3;
  const conversionRate = conversionCount / views;
  const completion = metrics.completionRate ?? 0;
  const raw = engagement * 4 + clickRate * 10 + conversionRate * 40 + completion * 0.5;
  return Math.max(0, Math.min(1, Number(raw.toFixed(4))));
}

export type LearningInput = {
  records: readonly PerformanceRecord[];
  history: readonly ContentHistoryEntry[];
  /** Minimum observations before a dimension is reported as an insight. */
  minSamples?: number;
};

/**
 * Turns published performance into insights about hooks, topics, locations,
 * audiences, formats and platforms.
 */
export function learningInsights(input: LearningInput): LearningInsight[] {
  const minSamples = input.minSamples ?? 2;
  const byCampaign = new Map<string, ContentHistoryEntry>();
  for (const entry of input.history) byCampaign.set(entry.campaignId, entry);

  const buckets = new Map<
    string,
    { dimension: LearningInsight["dimension"]; value: string; total: number; samples: number }
  >();
  const push = (dimension: LearningInsight["dimension"], value: string, index: number) => {
    if (!value) return;
    const key = `${dimension}:${value}`;
    const bucket = buckets.get(key) ?? { dimension, value, total: 0, samples: 0 };
    bucket.total += index;
    bucket.samples += 1;
    buckets.set(key, bucket);
  };

  for (const record of input.records) {
    const index = performanceIndex(record);
    if (index === null) continue;
    const entry = byCampaign.get(record.campaignId);
    push("platform", record.platform, index);
    if (!entry) continue;
    push("topic", entry.topic, index);
    push("audience", entry.audience, index);
    push("hook", entry.hook, index);
    if (entry.locationSlug) push("location", entry.locationSlug, index);
  }

  return [...buckets.values()]
    .filter((bucket) => bucket.samples >= minSamples)
    .map((bucket) => ({
      dimension: bucket.dimension,
      value: bucket.value,
      samples: bucket.samples,
      index: Number((bucket.total / bucket.samples).toFixed(4)),
      note: `${bucket.samples} published observation(s); this influences future recommendations only.`,
    }))
    .sort((a, b) => b.index - a.index);
}

/** Did a campaign create measurable new marketplace activity? */
export function demandCreationOutcome(records: readonly PerformanceRecord[]): {
  siteVisits: number | null;
  hostRegistrations: number | null;
  listings: number | null;
  renterRegistrations: number | null;
  bookings: number | null;
  measured: boolean;
} {
  const sum = (pick: (record: PerformanceRecord) => number | null): number | null => {
    const values = records.map(pick).filter((value): value is number => typeof value === "number");
    return values.length ? values.reduce((total, value) => total + value, 0) : null;
  };
  const result = {
    siteVisits: sum((record) => record.conversions.siteVisits),
    hostRegistrations: sum((record) => record.conversions.hostRegistrations),
    listings: sum((record) => record.conversions.listings),
    renterRegistrations: sum((record) => record.conversions.renterRegistrations),
    bookings: sum((record) => record.conversions.bookings),
  };
  return { ...result, measured: Object.values(result).some((value) => value !== null) };
}
