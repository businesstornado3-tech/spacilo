/**
 * Campaign → video generation prompt.
 *
 * The prompt is derived ENTIRELY from the campaign the marketing intelligence
 * already produced: its objective, audience, location, evidence class, story
 * and scene plan. Nothing here invents a new creative brief.
 *
 * Branding is instructed explicitly, but the approved EarnRoom lock-up is never
 * left to the model: the model is told to leave a clean end-card area, and the
 * real logo asset is composited over the rendered clip (see `branding.ts`).
 *
 * Pure module: no clock, no network, no vendor SDK.
 */
import { brandProfile, taglineFor } from "./brand";
import { CREATIVE_TREATMENTS, treatmentDirectives } from "./creative";
import { definition } from "./platforms";
import { PROHIBITION_LINE, sanitizeProviderText } from "./prompt-safety";
import type { AspectRatio, MarketingCampaign, PlatformAsset, PlatformId } from "./types";

/** How each platform wants the same story treated. */
const TREATMENT: Record<PlatformId, string> = {
  tiktok:
    "Fast, handheld, unpolished realism. The first second must land the hook. Burned-in captions throughout.",
  instagram:
    "Warm, considered, visually clean. Strong opening frame. Burned-in captions. Calm pacing.",
  youtube_shorts:
    "Vertical short with a direct opening line, captions throughout and a clear closing end card.",
  youtube:
    "Longer-form, structured and calm: set up the situation, explain it, resolve it, then the end card.",
  facebook: "Plain, everyday and local in feel. Captions throughout, since sound is often off.",
  linkedin:
    "Measured and professional. Treat unused domestic space as an underused asset and matching it to nearby demand as the opportunity. No slang, no hype.",
  pinterest:
    "Quiet, instructional and visual. Clear on-screen wording, minimal motion, strong final frame.",
};

export type VideoPromptSpec = {
  campaignId: string;
  assetId: string;
  platform: PlatformId;
  aspect: AspectRatio;
  seconds: number;
  /** The single prompt string sent to the video provider. */
  prompt: string;
  /** Exact wording the end card must carry, composited after generation. */
  endCard: { tagline: string; website: string; cta: string };
  /** Recorded so a founder can see what the model was actually asked for. */
  sceneCount: number;
};

function timedScenes(asset: PlatformAsset, campaign: MarketingCampaign): string[] {
  const total = campaign.story.scenes.reduce((sum, scene) => sum + scene.seconds, 0) || 1;
  const scale = asset.seconds / total;
  let cursor = 0;
  return campaign.story.scenes.map((scene) => {
    const length = Math.max(1, Math.round(scene.seconds * scale));
    const from = cursor;
    cursor += length;
    return `[${from}-${Math.min(asset.seconds, cursor)}s] ${scene.visual} Voiceover: ${scene.voiceover} On-screen caption: "${scene.caption}"`;
  });
}

/** Why this campaign exists, in words the model can film. */
function situation(campaign: MarketingCampaign): string {
  const place = campaign.opportunity.location?.name ?? "the UK";
  switch (campaign.opportunity.evidenceClass) {
    case "REAL_MARKET_DEMAND":
      return `People in ${place} are looking for storage and local options are limited.`;
    case "SEO_OPPORTUNITY":
      return `A common UK question about ${campaign.opportunity.topic.toLowerCase()}, answered plainly.`;
    case "DEMAND_CREATION_OPPORTUNITY":
      return `An ordinary UK storage pain point: ${campaign.opportunity.problem}`;
    case "STRATEGIC_COVERAGE":
      return `General awareness of how EarnRoom works in ${place}.`;
    default:
      return campaign.opportunity.problem;
  }
}

/**
 * The creative-treatment directives for this campaign, when the campaign
 * recorded one. Older campaigns simply have none and film as before.
 */
function creativeLines(campaign: MarketingCampaign): string[] {
  const id = campaign.story.creative?.treatmentId;
  const treatment = CREATIVE_TREATMENTS.find((entry) => entry.id === id);
  return treatment ? treatmentDirectives(treatment) : [];
}

export function buildVideoPrompt(
  campaign: MarketingCampaign,
  asset: PlatformAsset,
): VideoPromptSpec {
  const profile = brandProfile();
  const def = definition(asset.platform);
  const tagline = taglineFor(campaign.opportunity.key);
  const seconds = Math.min(asset.seconds, def.maxSeconds);

  const lines = [
    `A ${seconds}-second ${asset.aspect} cinematic film set in the UK.`,
    `Situation: ${situation(campaign)}`,
    `Audience: ${campaign.opportunity.audience.replace(/_/g, " ")}. Objective: ${campaign.opportunity.objective.replace(/_/g, " ").toLowerCase()}.`,
    `Platform treatment: ${TREATMENT[asset.platform]}`,
    ...creativeLines(campaign),
    `Visual style: ${profile.visualStyle} Real UK homes, garages, lofts and spare rooms. British people, British streets, British weather. No American signage, no dollar signs, no imperial units.`,
    "Scenes:",
    ...timedScenes(asset, campaign),
    PROHIBITION_LINE,
    "Photograph only real surroundings; keep shop fronts, packaging, screens and posters out of shot or out of focus so no writing is legible.",
    `Final 3 seconds: hold a still, clean, warm neutral frame with an empty centre and nothing drawn in it.`,
    "Every person shown is a general illustration, not a named or real person. No testimonials, no statistics, no prices, no money figures.",
    "Audio: quiet room tone and soft, unobtrusive music only. No speech, no narration, no spoken names.",
    "Consider micro-detail, expression and timing. Single continuous coherent look across scenes; no scene cuts to unrelated locations.",
  ];

  // The wording, the closing card and every brand element are added afterwards
  // by the deterministic production layer, so no identity reaches the model.
  const prompt = lines
    .map((line) => (line === PROHIBITION_LINE ? line : sanitizeProviderText(line)))
    .filter((line) => line.length > 0)
    .join("\n");

  return {
    campaignId: campaign.id,
    assetId: asset.id,
    platform: asset.platform,
    aspect: asset.aspect,
    seconds,
    prompt,
    endCard: { tagline, website: profile.website, cta: asset.cta },
    sceneCount: campaign.story.scenes.length,
  };
}

/** Provider-facing resolution for an aspect ratio. */
export function resolutionFor(aspect: AspectRatio, tier: "draft" | "final"): "360p" | "720p" {
  void aspect;
  return tier === "draft" ? "360p" : "720p";
}
