/**
 * Founder console — data provenance and trust.
 *
 * A number the founder cannot trace is worse than no number. Every important
 * figure in the console carries a provenance record saying where it came from,
 * how it was calculated, what is excluded and how fresh it is.
 *
 * Rules enforced here:
 *  - MOCK/TEST/DEMO data is labelled as such and never mixed into a LIVE figure.
 *  - A figure that could not be loaded is UNAVAILABLE, never zero.
 *  - AI scores are labelled as scores, never as performance.
 *
 * Pure module.
 */

export type DataStatus =
  | "LIVE_PRODUCTION"
  | "DERIVED_FROM_PRODUCTION"
  | "ESTIMATED"
  | "MOCK"
  | "TEST"
  | "DEMO"
  | "UNAVAILABLE";

export type Freshness = "LIVE" | "RECENT" | "STALE" | "UNAVAILABLE";

export type Provenance = {
  /** Metric key it describes, matching the RPC field name. */
  key: string;
  label: string;
  status: DataStatus;
  /** Plain-language source, e.g. the table or rollup it is read from. */
  source: string;
  /** Exactly how the number is produced. */
  calculation: string;
  /** What is deliberately left out. */
  exclusions: readonly string[];
  /** Timezone the period is bucketed in, when relevant. */
  timezone?: string;
  /** Caveats a founder must know before acting on the figure. */
  caveats?: readonly string[];
};

export const DATA_STATUS_LABEL: Record<DataStatus, string> = {
  LIVE_PRODUCTION: "Live production",
  DERIVED_FROM_PRODUCTION: "Derived from production",
  ESTIMATED: "Estimated",
  MOCK: "Mock",
  TEST: "Test",
  DEMO: "Demo",
  UNAVAILABLE: "Unavailable",
};

export const DATA_STATUS_TONE: Record<DataStatus, "success" | "info" | "warning" | "neutral"> = {
  LIVE_PRODUCTION: "success",
  DERIVED_FROM_PRODUCTION: "info",
  ESTIMATED: "warning",
  MOCK: "warning",
  TEST: "warning",
  DEMO: "warning",
  UNAVAILABLE: "neutral",
};

const ANALYTICS_EXCLUSIONS = [
  "Preview and local development traffic (environment is not 'production').",
  "Requests classified as bots.",
  "Browsers sending Do Not Track or Global Privacy Control — they are never measured.",
  "Internal and authenticated app pages, for public-page figures.",
];

/**
 * The single most-questioned number in the console, documented in full.
 * Everything stated here is verifiable in `analytics_daily_rollups` and the
 * `admin_dashboard_kpis` function.
 */
export const UNIQUE_VISITORS_PROVENANCE: Provenance = {
  key: "unique_visitors",
  label: "Unique visitors",
  status: "DERIVED_FROM_PRODUCTION",
  source:
    "analytics_daily_rollups.public_unique_visitors, rolled up nightly (and on radar refresh) from analytics_events.",
  calculation:
    "For each day in the selected period, count the distinct rotating first-party visitor references seen on public pages, then sum those daily figures across the period.",
  exclusions: ANALYTICS_EXCLUSIONS,
  timezone: "Europe/London (days are bucketed on UK calendar dates)",
  caveats: [
    "'Unique' means a distinct browser reference, not a distinct person. The reference rotates every 30 days and is not shared across devices or browsers.",
    "Daily uniques are summed, so someone returning on two days counts twice in a multi-day period. It is a measure of reach, not of individuals.",
    "There is no IP geolocation and no cross-device identity matching anywhere in this pipeline.",
  ],
};

export const PROVENANCE: readonly Provenance[] = [
  UNIQUE_VISITORS_PROVENANCE,
  {
    key: "sessions",
    label: "Sessions",
    status: "DERIVED_FROM_PRODUCTION",
    source: "analytics_daily_rollups.public_sessions.",
    calculation:
      "Distinct session references per UK calendar day on public pages, summed across the period.",
    exclusions: ANALYTICS_EXCLUSIONS,
    timezone: "Europe/London",
  },
  {
    key: "new_accounts",
    label: "New accounts",
    status: "LIVE_PRODUCTION",
    source: "profiles.created_at.",
    calculation: "Count of profile rows created inside the selected period.",
    exclusions: ["Nothing — every real account in the period is counted."],
  },
  {
    key: "spaces_published",
    label: "Spaces published",
    status: "LIVE_PRODUCTION",
    source: "spaces.published_at.",
    calculation: "Count of spaces whose published_at falls inside the period.",
    exclusions: ["Drafts, paused and archived listings."],
  },
  {
    key: "bookings",
    label: "Bookings",
    status: "LIVE_PRODUCTION",
    source: "bookings.created_at.",
    calculation: "Count of booking rows created inside the period, all statuses.",
    exclusions: ["Storage requests that never became a booking."],
    caveats: ["A booking is not revenue until the payment succeeds."],
  },
  {
    key: "completed_bookings",
    label: "Completed bookings",
    status: "LIVE_PRODUCTION",
    source: "bookings.status = 'completed'.",
    calculation: "Count of bookings that reached completion in the period.",
    exclusions: ["Cancelled and in-progress bookings."],
  },
  {
    key: "gbv_booked_pence",
    label: "Gross booking value — booked",
    status: "LIVE_PRODUCTION",
    source: "bookings.renter_total_amount_pence.",
    calculation: "Sum of renter totals for non-cancelled bookings created in the period.",
    exclusions: ["Cancelled bookings."],
    caveats: ["Booked value is committed value, not money received. Paid figures are separate."],
  },
  {
    key: "net_fees_pence",
    label: "Net EarnRoom fees",
    status: "LIVE_PRODUCTION",
    source: "payments (succeeded) less refunded service fees.",
    calculation: "Succeeded service fees in the period minus service fees refunded.",
    exclusions: ["Failed and cancelled payments."],
    caveats: ["Actual received value, not a forecast."],
  },
  {
    key: "growth_opportunity_score",
    label: "Growth radar opportunity score",
    status: "DERIVED_FROM_PRODUCTION",
    source: "growth_opportunities.scores, computed from first-party analytics events.",
    calculation:
      "A 0–100 relevance score combining evidence confidence, capability fit and observed frequency.",
    exclusions: ["Non-production and bot events; events with no usable intent evidence."],
    caveats: [
      "This is a prioritisation score, not performance. It does not mean revenue, conversions or sends.",
    ],
  },
  {
    key: "demand_geography",
    label: "Demand geography",
    status: "DERIVED_FROM_PRODUCTION",
    source: "analytics_events location intent (paths and props) joined to spaces and bookings.",
    calculation:
      "Counts of location-intent events and distinct visitor references per named UK place, against real published supply.",
    exclusions: ["Non-production and bot events. No IP geolocation exists to exclude."],
    caveats: ["Declared location intent, not visitor location."],
  },
  {
    key: "campaign_sends",
    label: "Campaign sends",
    status: "MOCK",
    source: "growth_campaign_attempts, produced by the mock delivery adapters.",
    calculation:
      "Attempts recorded by the execution path. Mock adapters prove the path and contact nobody.",
    exclusions: ["Nothing is transmitted, so no real delivery exists to count."],
    caveats: [
      "Never read a mock attempt as a delivery. Delivery is only claimed when a channel confirms it.",
    ],
  },
];

export function provenanceFor(key: string): Provenance | null {
  return PROVENANCE.find((entry) => entry.key === key) ?? null;
}

/** Freshness of a figure, from the timestamp of the newest row behind it. */
export function freshness(
  lastUpdatedAt: number | null,
  now: number,
  recentHours = 6,
  staleHours = 48,
): Freshness {
  if (lastUpdatedAt === null || !Number.isFinite(lastUpdatedAt)) return "UNAVAILABLE";
  const hours = (now - lastUpdatedAt) / 3_600_000;
  if (hours < 0) return "LIVE";
  if (hours <= 1) return "LIVE";
  if (hours <= recentHours) return "RECENT";
  if (hours <= staleHours) return "STALE";
  return "STALE";
}

export const FRESHNESS_LABEL: Record<Freshness, string> = {
  LIVE: "Live",
  RECENT: "Recent",
  STALE: "Stale",
  UNAVAILABLE: "Unavailable",
};

/* -------------------------------------------------------------- health */

export type HealthCheckId =
  | "event_ingestion"
  | "rollups"
  | "opportunities"
  | "conversions"
  | "geography"
  | "mock_isolation"
  | "campaign_jobs";

export type HealthInput = {
  lastEventAt: number | null;
  lastRollupAt: number | null;
  lastOpportunityAt: number | null;
  conversionEvents: number;
  geographyPlaces: number;
  /** Attempts recorded by mock adapters. Must never be counted as delivery. */
  mockCampaignAttempts: number;
  /** Attempts that genuinely transmitted. Zero until a live channel exists. */
  liveCampaignAttempts: number;
  failedCampaignAttempts: number;
  now: number;
};

export type HealthCheck = {
  id: HealthCheckId;
  label: string;
  state: "OK" | "ATTENTION" | "UNAVAILABLE";
  detail: string;
  freshness: Freshness;
};

export function buildDataHealth(input: HealthInput): HealthCheck[] {
  const eventFresh = freshness(input.lastEventAt, input.now);
  const rollupFresh = freshness(input.lastRollupAt, input.now, 24, 72);
  const opportunityFresh = freshness(input.lastOpportunityAt, input.now, 24, 168);

  return [
    {
      id: "event_ingestion",
      label: "Analytics ingestion",
      state: eventFresh === "UNAVAILABLE" ? "UNAVAILABLE" : eventFresh === "STALE" ? "ATTENTION" : "OK",
      detail:
        input.lastEventAt === null
          ? "No production event has been recorded."
          : "Production, non-bot events are arriving.",
      freshness: eventFresh,
    },
    {
      id: "rollups",
      label: "Daily rollups",
      state: rollupFresh === "UNAVAILABLE" ? "UNAVAILABLE" : rollupFresh === "STALE" ? "ATTENTION" : "OK",
      detail:
        input.lastRollupAt === null
          ? "No rollup row exists; period traffic figures cannot be trusted."
          : "Rollups back the traffic and trend figures.",
      freshness: rollupFresh,
    },
    {
      id: "opportunities",
      label: "Opportunity radar",
      state:
        opportunityFresh === "UNAVAILABLE"
          ? "UNAVAILABLE"
          : opportunityFresh === "STALE"
            ? "ATTENTION"
            : "OK",
      detail:
        input.lastOpportunityAt === null
          ? "No opportunity has been derived yet. Refresh the radar."
          : "Opportunities are being derived from production signals.",
      freshness: opportunityFresh,
    },
    {
      id: "conversions",
      label: "Conversion tracking",
      state: input.conversionEvents > 0 ? "OK" : "ATTENTION",
      detail:
        input.conversionEvents > 0
          ? `${input.conversionEvents} real booking_completed events recorded.`
          : "No real booking_completed event yet, so no conversion is claimed anywhere.",
      freshness: input.conversionEvents > 0 ? "LIVE" : "UNAVAILABLE",
    },
    {
      id: "geography",
      label: "Demand geography",
      state: input.geographyPlaces > 0 ? "OK" : "ATTENTION",
      detail:
        input.geographyPlaces > 0
          ? `${input.geographyPlaces} UK places carry declared demand intent.`
          : "No location intent recorded in this period.",
      freshness: input.geographyPlaces > 0 ? "LIVE" : "UNAVAILABLE",
    },
    {
      id: "mock_isolation",
      label: "Mock isolation",
      state: input.liveCampaignAttempts === 0 ? "OK" : "ATTENTION",
      detail:
        input.liveCampaignAttempts === 0
          ? `${input.mockCampaignAttempts} mock attempts recorded and labelled MOCK. Nothing was transmitted, and no mock value reaches a production figure.`
          : `${input.liveCampaignAttempts} live transmissions recorded via an authorised channel.`,
      freshness: "LIVE",
    },
    {
      id: "campaign_jobs",
      label: "Campaign jobs",
      state: input.failedCampaignAttempts === 0 ? "OK" : "ATTENTION",
      detail:
        input.failedCampaignAttempts === 0
          ? "No failed campaign attempt."
          : `${input.failedCampaignAttempts} attempts failed and were retained for inspection.`,
      freshness: "LIVE",
    },
  ];
}
