/**
 * One campaign concept → native platform assets.
 *
 * Not cross-posting: each platform gets its own hook, title, description,
 * caption, hashtags and length, within that platform's real format limits.
 */
import { brandProfile, taglineFor } from "./brand";
import { definition } from "./platforms";
import type { AspectRatio, CampaignStory, MarketingOpportunity, PlatformAsset, PlatformId } from "./types";

const BASE_TAGS = ["earnroom", "storage", "uk"] as const;

const AUDIENCE_TAGS: Record<string, readonly string[]> = {
  hosts: ["sparespace", "extraincome", "garage"],
  renters: ["selfstorage", "declutter", "smallspace"],
  movers: ["movinghouse", "movingday", "homemove"],
  students: ["studentlife", "studentstorage", "uni"],
  families: ["familyhome", "declutter", "seasonalstorage"],
  businesses: ["smallbusiness", "stockstorage", "ukbusiness"],
  downsizers: ["downsizing", "declutter"],
  renovators: ["renovation", "homeimprovement"],
  both_sides: ["sharingeconomy", "community"],
};

function hashtags(opportunity: MarketingOpportunity, platform: PlatformId): string[] {
  const audience = AUDIENCE_TAGS[opportunity.audience] ?? [];
  const place = opportunity.location ? [opportunity.location.slug.replace(/-/g, "")] : [];
  const all = [...BASE_TAGS, ...audience, ...place].map((tag) => `#${tag}`);
  const limit = platform === "instagram" ? 8 : platform === "tiktok" ? 6 : platform === "pinterest" ? 5 : 4;
  return all.slice(0, limit);
}

function platformHook(platform: PlatformId, story: CampaignStory, opportunity: MarketingOpportunity): string {
  const place = opportunity.location?.name;
  switch (platform) {
    case "tiktok":
      return `Nobody tells you this bit: ${story.hook.toLowerCase()}`;
    case "instagram":
      return story.hook;
    case "youtube_shorts":
      return place ? `${story.hook} (${place})` : story.hook;
    case "youtube":
      return `${opportunity.topic}: ${story.hook}`;
    case "facebook":
      return place ? `${place} — ${story.hook}` : story.hook;
    case "linkedin":
      return `${opportunity.topic}: what people actually do with the space problem`;
    case "pinterest":
      return `${opportunity.topic} — a simple guide`;
    default:
      return story.hook;
  }
}

function seconds(platform: PlatformId, story: CampaignStory): number {
  const def = definition(platform);
  if (platform === "youtube") return Math.min(def.maxSeconds, Math.max(120, story.seconds * 4));
  return Math.min(def.maxSeconds, story.seconds);
}

function aspect(platform: PlatformId): AspectRatio {
  return definition(platform).aspects[0]!;
}

function title(platform: PlatformId, opportunity: MarketingOpportunity, story: CampaignStory): string {
  const place = opportunity.location?.name;
  if (platform === "youtube") {
    return `${opportunity.topic}${place ? ` in ${place}` : " in the UK"} — what are the options?`;
  }
  if (platform === "pinterest") return `${opportunity.topic}${place ? ` in ${place}` : ""}`;
  return story.hook.length <= 90 ? story.hook : `${story.hook.slice(0, 87)}...`;
}

function description(platform: PlatformId, opportunity: MarketingOpportunity, story: CampaignStory): string {
  const profile = brandProfile();
  const lines = [
    story.hook,
    opportunity.problem,
    "EarnRoom connects people who need storage with people who have space to spare.",
    story.hostCta ? `${story.renterCta} ${story.hostCta}` : story.renterCta,
    profile.url,
  ];
  if (platform === "linkedin") {
    lines.splice(2, 0, "Unused domestic space is an underused asset; matching it to nearby demand is the opportunity.");
  }
  return lines.join("\n\n");
}

export function buildAssets(
  campaignId: string,
  opportunity: MarketingOpportunity,
  story: CampaignStory,
  platforms: readonly PlatformId[],
): PlatformAsset[] {
  return platforms.map((platform, index) => ({
    id: `${campaignId}-A${String(index + 1).padStart(2, "0")}-${platform}`,
    platform,
    aspect: aspect(platform),
    hook: platformHook(platform, story, opportunity),
    title: title(platform, opportunity, story),
    description: description(platform, opportunity, story),
    caption: `${platformHook(platform, story, opportunity)} — ${taglineFor(opportunity.key)}`,
    hashtags: hashtags(opportunity, platform),
    cta: opportunity.audience === "hosts" ? (story.hostCta ?? story.renterCta) : story.renterCta,
    seconds: seconds(platform, story),
    state: "GENERATED" as const,
    videoUrl: null,
    thumbnailUrl: null,
    videoStatus: "NOT_REQUESTED" as const,
  }));
}

/** Platforms suited to a campaign, given its story format and audience. */
export function suggestedPlatforms(opportunity: MarketingOpportunity): PlatformId[] {
  const base: PlatformId[] = ["youtube_shorts", "instagram", "tiktok", "facebook"];
  if (opportunity.audience === "businesses" || opportunity.objective === "HOST_ACQUISITION") base.push("linkedin");
  if (opportunity.evidenceClass === "SEO_OPPORTUNITY") base.push("pinterest", "youtube");
  return [...new Set(base)];
}
