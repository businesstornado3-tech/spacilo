/**
 * SEO / search intelligence — an INDEPENDENT marketing path.
 *
 * Deliberately does not read marketplace demand: it must be able to select a
 * useful campaign on a day when EarnRoom has no observed demand at all. What it
 * produces is honestly labelled `SEO_OPPORTUNITY` (or `SEASONAL`), never
 * presented as observed market demand.
 *
 * Pure module: deterministic in (topics, date, coverage) → out.
 */
import type { MarketingAudience, MarketingObjective, MarketingOpportunity } from "./types";

export type SeoTopic = {
  id: string;
  /** The searcher's words. */
  query: string;
  topic: string;
  problem: string;
  intent: "informational" | "commercial" | "local" | "question";
  audience: MarketingAudience;
  secondaryAudience: MarketingAudience | null;
  objective: MarketingObjective;
  /** Months (1-12) when this peaks; empty means all year. */
  seasonMonths: readonly number[];
  /** Relative long-tail opportunity, 0..1. Editorial, not a volume claim. */
  opportunity: number;
  /** True when the topic works without any local supply. */
  supplyIndependent: boolean;
};

/**
 * UK storage search-content catalogue. Extend freely — nothing downstream
 * depends on a fixed list, and each entry carries its own audience and intent.
 */
export const SEO_TOPICS: readonly SeoTopic[] = [
  {
    id: "moving-house-storage",
    query: "where do I store furniture when moving house",
    topic: "Moving-house storage",
    problem: "The new home is not ready but the old one is already packed",
    intent: "question",
    audience: "movers",
    secondaryAudience: "hosts",
    objective: "BOTH_SIDES",
    seasonMonths: [5, 6, 7, 8, 9],
    opportunity: 0.92,
    supplyIndependent: true,
  },
  {
    id: "student-storage",
    query: "student storage over summer",
    topic: "Student storage between terms",
    problem: "Halls close for the summer and belongings have nowhere to go",
    intent: "commercial",
    audience: "students",
    secondaryAudience: "hosts",
    objective: "RENTER_ACQUISITION",
    seasonMonths: [5, 6, 7, 8, 9],
    opportunity: 0.84,
    supplyIndependent: true,
  },
  {
    id: "small-flat-storage",
    query: "storage ideas for a small flat",
    topic: "Small-flat storage",
    problem: "There is simply not enough room for everything at home",
    intent: "informational",
    audience: "renters",
    secondaryAudience: null,
    objective: "DEMAND_CREATION",
    seasonMonths: [],
    opportunity: 0.71,
    supplyIndependent: true,
  },
  {
    id: "garage-earning",
    query: "rent out my garage for storage",
    topic: "Earning from a spare garage",
    problem: "A garage sits mostly empty while still costing money to keep",
    intent: "commercial",
    audience: "hosts",
    secondaryAudience: "renters",
    objective: "HOST_ACQUISITION",
    seasonMonths: [],
    opportunity: 0.88,
    supplyIndependent: true,
  },
  {
    id: "spare-room-storage",
    query: "rent spare room for storage",
    topic: "Spare-room storage income",
    problem: "A spare room is unused but could hold someone else's belongings",
    intent: "commercial",
    audience: "hosts",
    secondaryAudience: null,
    objective: "HOST_ACQUISITION",
    seasonMonths: [],
    opportunity: 0.79,
    supplyIndependent: true,
  },
  {
    id: "how-much-storage",
    query: "how much storage space do I need",
    topic: "Working out how much space you need",
    problem: "People over- or under-book storage because sizes are hard to picture",
    intent: "question",
    audience: "renters",
    secondaryAudience: null,
    objective: "SEO_GROWTH",
    seasonMonths: [],
    opportunity: 0.83,
    supplyIndependent: true,
  },
  {
    id: "storage-without-contract",
    query: "storage without a long contract",
    topic: "Flexible storage without long contracts",
    problem: "Traditional units expect a commitment that does not match a short need",
    intent: "commercial",
    audience: "renters",
    secondaryAudience: null,
    objective: "RENTER_ACQUISITION",
    seasonMonths: [],
    opportunity: 0.76,
    supplyIndependent: true,
  },
  {
    id: "renovation-storage",
    query: "where to put furniture during a renovation",
    topic: "Renovation storage",
    problem: "A room is being worked on and the contents need somewhere to live",
    intent: "question",
    audience: "renovators",
    secondaryAudience: "hosts",
    objective: "DEMAND_CREATION",
    seasonMonths: [1, 2, 3, 10, 11],
    opportunity: 0.68,
    supplyIndependent: true,
  },
  {
    id: "downsizing-storage",
    query: "downsizing what to do with furniture",
    topic: "Downsizing storage",
    problem: "Moving somewhere smaller leaves belongings without a home",
    intent: "informational",
    audience: "downsizers",
    secondaryAudience: null,
    objective: "DEMAND_CREATION",
    seasonMonths: [],
    opportunity: 0.63,
    supplyIndependent: true,
  },
  {
    id: "business-stock-storage",
    query: "small business stock storage",
    topic: "Business and stock storage",
    problem: "Stock outgrows the unit but a long commercial lease does not fit",
    intent: "commercial",
    audience: "businesses",
    secondaryAudience: "hosts",
    objective: "RENTER_ACQUISITION",
    seasonMonths: [9, 10, 11],
    opportunity: 0.66,
    supplyIndependent: true,
  },
  {
    id: "seasonal-christmas-storage",
    query: "where to store christmas decorations",
    topic: "Seasonal and Christmas storage",
    problem: "Seasonal boxes take up space for eleven months of the year",
    intent: "informational",
    audience: "families",
    secondaryAudience: null,
    objective: "BRAND_AWARENESS",
    seasonMonths: [11, 12, 1],
    opportunity: 0.58,
    supplyIndependent: true,
  },
  {
    id: "bike-storage",
    query: "secure bike storage for flats",
    topic: "Bicycle storage",
    problem: "There is nowhere secure to keep a bike at a flat",
    intent: "local",
    audience: "renters",
    secondaryAudience: "hosts",
    objective: "SEO_GROWTH",
    seasonMonths: [3, 4, 5, 6],
    opportunity: 0.61,
    supplyIndependent: true,
  },
  {
    id: "baby-equipment-storage",
    query: "where to store baby equipment",
    topic: "Baby and child equipment storage",
    problem: "Prams, cots and toys outgrow the house faster than the child",
    intent: "informational",
    audience: "families",
    secondaryAudience: null,
    objective: "DEMAND_CREATION",
    seasonMonths: [],
    opportunity: 0.52,
    supplyIndependent: true,
  },
  {
    id: "decluttering",
    query: "decluttering what to do with things you keep",
    topic: "Decluttering without throwing things away",
    problem: "People want the space back but are not ready to part with things",
    intent: "informational",
    audience: "renters",
    secondaryAudience: null,
    objective: "BRAND_AWARENESS",
    seasonMonths: [1, 2, 9],
    opportunity: 0.57,
    supplyIndependent: true,
  },
  {
    id: "storage-near-me",
    query: "storage near me",
    topic: "Local storage search",
    problem: "People want space close to home, not an out-of-town unit",
    intent: "local",
    audience: "renters",
    secondaryAudience: "hosts",
    objective: "MARKETPLACE_LIQUIDITY",
    seasonMonths: [],
    opportunity: 0.9,
    supplyIndependent: false,
  },
];

/** Month is 1-12. Seasonal weight lifts topics that peak now. */
export function seasonalWeight(topic: SeoTopic, month: number): number {
  if (topic.seasonMonths.length === 0) return 1;
  return topic.seasonMonths.includes(month) ? 1.35 : 0.8;
}

export type SeoIntelligenceInput = {
  /** 1-12, the month the plan is for. */
  month: number;
  /** Optional place to localise a topic to. */
  location?: { slug: string; name: string } | null;
  /** Topic ids covered recently, so the catalogue rotates. */
  recentTopicIds?: readonly string[];
};

/**
 * Builds search-led opportunities. Works with zero marketplace demand: nothing
 * in here reads bookings, spaces or analytics.
 */
export function seoOpportunities(input: SeoIntelligenceInput): MarketingOpportunity[] {
  const recent = new Set(input.recentTopicIds ?? []);
  return SEO_TOPICS.map((topic) => {
    const seasonal = seasonalWeight(topic, input.month);
    const fatigue = recent.has(topic.id) ? 0.45 : 1;
    const strength = Math.min(1, topic.opportunity * seasonal * fatigue);
    const place = input.location ?? null;
    const seasonalNow = topic.seasonMonths.includes(input.month);
    return {
      key: `seo:${topic.id}${place ? `:${place.slug}` : ""}`,
      trigger: seasonalNow ? ("SEASONAL" as const) : ("SEO_OPPORTUNITY" as const),
      evidenceClass: "SEO_OPPORTUNITY" as const,
      title: place ? `${place.name} — ${topic.topic}` : topic.topic,
      problem: topic.problem,
      topic: topic.topic,
      audience: topic.audience,
      secondaryAudience: topic.secondaryAudience,
      objective: topic.objective,
      location: place,
      rationale: `Search-content opportunity for "${topic.query}"${seasonalNow ? ", peaking this month" : ""}. This is a content opportunity, not observed EarnRoom demand.`,
      evidence: [
        {
          statement: `Catalogued UK storage search intent: "${topic.query}" (${topic.intent}).`,
          source: "seo_catalogue" as const,
          value: Math.round(topic.opportunity * 100),
        },
        ...(seasonalNow
          ? [
              {
                statement: `Topic is in season for month ${input.month}.`,
                source: "seasonal_calendar" as const,
                value: input.month,
              },
            ]
          : []),
      ],
      strength,
    };
  }).sort((a, b) => b.strength - a.strength);
}
