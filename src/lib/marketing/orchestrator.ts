/**
 * Marketing orchestrator — the daily decision.
 *
 * This is the only new "brain" in the marketing layer, and it deliberately has
 * no signals of its own: it reads existing EarnRoom intelligence (demand
 * geography, growth opportunities), the independent SEO catalogue and the
 * demand-creation seeds, then ranks, de-duplicates, tells the story, builds the
 * platform assets and validates them.
 *
 * It always produces a campaign. On a day with no marketplace demand at all it
 * falls back to SEO or demand creation — and labels it as such.
 */
import { buildAssets, suggestedPlatforms } from "./assets";
import { coverageRows, type ContentHistoryEntry } from "./coverage";
import { selectCreativeTreatment, type CreativeHistoryEntry } from "./creative";
import { demandCreationOpportunities } from "./demand-creation";
import {
  geographyOpportunities,
  growthOpportunityMarketing,
  type GrowthOpportunitySummary,
} from "./market-intelligence";
import { londonDate, londonMonth, nextSequence, registryId } from "./registry";
import { rankOpportunities } from "./scoring";
import { seoOpportunities } from "./seo-intelligence";
import { buildStory } from "./story";
import { validateContent } from "./validation";
import { stateAfterValidation } from "./publishing";
import type { GeographyPlace } from "@/lib/admin/geography";
import type {
  AuditEvent,
  CampaignScore,
  LearningInsight,
  MarketingCampaign,
  MarketingOpportunity,
  MarketingSettings,
  PlatformId,
} from "./types";

export type PlanInput = {
  now: number;
  settings: MarketingSettings;
  /** Existing demand geography rows, already computed by the founder console. */
  places: readonly GeographyPlace[];
  /** Existing growth engine opportunities. */
  growth: readonly GrowthOpportunitySummary[];
  history: readonly ContentHistoryEntry[];
  insights: readonly LearningInsight[];
  /** Registry ids already issued, so the sequence keeps counting. */
  existingIds: readonly string[];
  /** Force a specific opportunity (founder override). */
  forceOpportunityKey?: string;
  platforms?: readonly PlatformId[];
  /**
   * Creative treatments used by recent campaigns, most recent first. Used only
   * to avoid filming the same story twice; it never blocks a campaign.
   */
  recentCreative?: readonly CreativeHistoryEntry[];
};

export type DailyPlan = {
  planDate: string;
  campaign: MarketingCampaign;
  /** Every candidate considered, ranked — shown in the console. */
  considered: { opportunity: MarketingOpportunity; score: CampaignScore }[];
  /** Which intelligence path won today. */
  source: "MARKET" | "SEO" | "DEMAND_CREATION";
};

/** Gathers candidates from all three intelligence paths. */
export function candidateOpportunities(input: PlanInput): MarketingOpportunity[] {
  const month = londonMonth(input.now);
  const recentTopics = input.history.map((entry) => entry.opportunityKey.split(":")[1] ?? "");
  const market = [
    ...geographyOpportunities(input.places),
    ...growthOpportunityMarketing(input.growth),
  ];

  // Localise a share of the search/creation candidates to places with real
  // signal, and keep UK-wide variants so coverage is never demand-locked.
  const localiseTo = market
    .map((opportunity) => opportunity.location)
    .filter((location): location is { slug: string; name: string } => Boolean(location))
    .slice(0, 3);

  const seo = [
    ...seoOpportunities({ month, recentTopicIds: recentTopics }),
    ...localiseTo.flatMap((location) =>
      seoOpportunities({ month, location, recentTopicIds: recentTopics }).slice(0, 3),
    ),
  ];

  const creation = [
    ...demandCreationOpportunities({ recentSeedIds: recentTopics }),
    ...localiseTo.flatMap((location) =>
      demandCreationOpportunities({ location, recentSeedIds: recentTopics }).slice(0, 2),
    ),
  ];

  const seen = new Set<string>();
  return [...market, ...seo, ...creation].filter((opportunity) => {
    if (seen.has(opportunity.key)) return false;
    seen.add(opportunity.key);
    return true;
  });
}

function sourceOf(opportunity: MarketingOpportunity): DailyPlan["source"] {
  if (opportunity.key.startsWith("market:")) return "MARKET";
  if (opportunity.key.startsWith("seo:")) return "SEO";
  return "DEMAND_CREATION";
}

/**
 * Plans the day. Never returns "no opportunity today": if nothing scores, the
 * strongest demand-creation seed is used and labelled honestly.
 */
export function planDailyCampaign(input: PlanInput): DailyPlan {
  const planDate = londonDate(input.now);
  const candidates = candidateOpportunities(input);
  const coverage = coverageRows(input.history, { now: input.now });
  const ranked = rankOpportunities(candidates, {
    history: input.history,
    coverage,
    insights: input.insights,
    settings: input.settings,
    now: input.now,
  });

  const forced = input.forceOpportunityKey
    ? ranked.find((entry) => entry.opportunity.key === input.forceOpportunityKey)
    : undefined;

  const chosen = forced ??
    ranked.find((entry) => entry.score.priority > 0) ??
    ranked[0] ?? {
      opportunity: demandCreationOpportunities()[0]!,
      score: {
        priority: 40,
        factors: [],
        duplicationPenalty: 0,
        reason:
          "No ranked candidate today, so the strongest recognised UK storage problem was used for awareness.",
      } satisfies CampaignScore,
    };

  const year = Number(planDate.slice(0, 4));
  const campaignId = registryId("CAMP", year, nextSequence("CAMP", year, input.existingIds));
  // Creative variety is decided here, before anything is written or rendered,
  // so a different film costs nothing extra.
  const creative = selectCreativeTreatment({
    seed: `${chosen.opportunity.key}|${planDate}`,
    audience: chosen.opportunity.audience,
    history: input.recentCreative ?? [],
  });
  const plannedStory = buildStory(chosen.opportunity, { creative: creative.treatment });
  const story = {
    ...plannedStory,
    ...(plannedStory.creative
      ? { creative: { ...plannedStory.creative, avoided: creative.summary.avoided } }
      : {}),
  };
  const platforms = input.platforms ?? suggestedPlatforms(chosen.opportunity);
  const assets = buildAssets(campaignId, chosen.opportunity, story, platforms);

  const validation = validateContent({
    opportunity: chosen.opportunity,
    story,
    assets,
    history: input.history,
    now: input.now,
  });

  const statedAssets = assets.map((asset) => ({
    ...asset,
    state: stateAfterValidation(validation.passed, asset.platform, input.settings),
  }));

  const audit: AuditEvent[] = [
    { at: input.now, action: "campaign_created", detail: chosen.score.reason, actor: "engine" },
    {
      at: input.now,
      action: "content_generated",
      detail: `${statedAssets.length} platform asset(s) generated from a ${story.format.replace(/_/g, " ").toLowerCase()} story.`,
      actor: "engine",
    },
    {
      at: input.now,
      action: "content_generated",
      detail:
        `Creative treatment: ${creative.summary.name} — ${creative.summary.setting}` +
        (creative.summary.avoided.length > 0
          ? ` Skipped ${creative.summary.avoided.length} recently used treatment(s) to avoid a near-duplicate video.`
          : ""),
      actor: "engine",
    },
    {
      at: input.now,
      action: validation.passed ? "validated" : "validation_failed",
      detail: validation.passed ? "All content checks passed." : validation.failures.join(" "),
      actor: "engine",
    },
  ];

  const campaign: MarketingCampaign = {
    id: campaignId,
    createdAt: input.now,
    planDate,
    opportunity: chosen.opportunity,
    score: chosen.score,
    story,
    assets: statedAssets,
    validation,
    mode: input.settings.globalMode,
    status: !validation.passed
      ? "FAILED"
      : input.settings.globalMode === "DRAFT"
        ? "DRAFT"
        : input.settings.globalMode === "AUTONOMOUS" && input.settings.autoApprove
          ? "APPROVED"
          : "AWAITING_APPROVAL",
    scheduledFor: null,
    audit,
  };

  return {
    planDate,
    campaign,
    considered: ranked.slice(0, 12),
    source: sourceOf(chosen.opportunity),
  };
}
