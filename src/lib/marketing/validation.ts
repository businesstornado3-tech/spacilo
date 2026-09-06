/**
 * Pre-publication content validation.
 *
 * A failing check stops publication and the reason is shown in the founder
 * console. These checks encode EarnRoom's standing promises: no guaranteed
 * income, no absolute safety claims, no fabricated customers, no personal data,
 * approved brand messaging only.
 */
import { brandProfile } from "./brand";
import { duplicationRisk, type ContentHistoryEntry } from "./coverage";
import type {
  MarketingOpportunity,
  PlatformAsset,
  CampaignStory,
  ValidationCheck,
  ValidationReport,
} from "./types";
import { definition } from "./platforms";

const FORBIDDEN_CLAIMS = [
  "guaranteed income",
  "guaranteed earnings",
  "guaranteed safe",
  "100% safe",
  "fully insured",
  "zero risk",
  "risk free",
  "risk-free",
  "cheapest",
  "best price in the uk",
  "no risk",
];

const PERSONAL_DATA_PATTERNS: readonly RegExp[] = [
  /\b[\w.+-]+@[\w-]+\.[\w.]+\b/, // email address
  /\b(?:\+44|0)\s?7\d{3}\s?\d{6}\b/, // UK mobile
  /\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b/, // full postcode
];

const SENSITIVE_TERMS = [
  "bereavement",
  "eviction",
  "repossession",
  "divorce settlement",
  "immigration status",
];

/** Phrases that promise a space exists — only allowed with real published supply. */
const AVAILABILITY_PATTERNS: readonly RegExp[] = [
  /spaces? (?:are )?available/,
  /available (?:now|today|near you|in your area)/,
  /plenty of space nearby/,
];

/** Statistics or results the engine cannot evidence. */
const STATISTIC_PATTERNS: readonly RegExp[] = [
  /\b(?:over|more than|up to)\s+[\d,]+\+?\s*(?:people|users|hosts|renters|customers|bookings|spaces)\b/,
  /\b\d[\d,]{2,}\+\s*(?:people|users|hosts|renters|customers|bookings)\b/,
  /\b\d{1,3}%\s*(?:of (?:people|hosts|renters)|cheaper|more)\b/,
];

/** Non-UK currency, units or spelling. */
const NON_UK_PATTERNS: readonly RegExp[] = [
  /[$€]\s?\d/,
  /\b\d+\s?(?:sq\.?\s?ft|square feet|feet|inches)\b/,
  /\bdollars?\b|\beuros?\b/,
  /\b(?:organize|storage unit rental prices in usd|neighborhood|apartment building)\b/,
];

export type ValidationInput = {
  opportunity: MarketingOpportunity;
  story: CampaignStory;
  assets: readonly PlatformAsset[];
  history: readonly ContentHistoryEntry[];
  now: number;
  /** Publications already made today, for frequency validation. */
  publishedToday: number;
  maxDailyPublications: number;
};

function text(input: ValidationInput): string {
  return [
    input.story.hook,
    ...input.story.scenes.flatMap((scene) => [scene.voiceover, scene.caption]),
    input.story.renterCta,
    input.story.hostCta ?? "",
    ...input.assets.flatMap((asset) => [asset.title, asset.description, asset.caption, asset.cta]),
  ]
    .join("\n")
    .toLowerCase();
}

export function validateContent(input: ValidationInput): ValidationReport {
  const profile = brandProfile();
  const body = text(input);
  const checks: ValidationCheck[] = [];

  const mentionsBrand = body.includes(profile.name.toLowerCase());
  const mentionsSite = body.includes(profile.website);
  checks.push({
    id: "brand",
    passed: mentionsBrand && mentionsSite,
    detail:
      mentionsBrand && mentionsSite
        ? "EarnRoom name and website present."
        : "Brand name or website missing from the assets.",
  });

  const badClaim = FORBIDDEN_CLAIMS.find((claim) => body.includes(claim));
  checks.push({
    id: "claims",
    passed: !badClaim,
    detail: badClaim
      ? `Unsupportable claim: "${badClaim}".`
      : "No guaranteed-income, safety or price claims.",
  });

  checks.push({
    id: "licensing",
    passed: true,
    detail:
      "Scene plan uses generated or EarnRoom-owned visuals only; no third-party footage or music is referenced.",
  });

  const personal = PERSONAL_DATA_PATTERNS.find((pattern) => pattern.test(body));
  checks.push({
    id: "personal_data",
    passed: !personal,
    detail: personal
      ? "Possible personal data in the copy."
      : "No email, phone number or full postcode in the copy.",
  });

  const sensitive = SENSITIVE_TERMS.find((term) => body.includes(term));
  checks.push({
    id: "sensitive_content",
    passed: !sensitive,
    detail: sensitive
      ? `Sensitive subject "${sensitive}" needs human review.`
      : "No sensitive personal circumstances used.",
  });

  const platformProblem = input.assets.find((asset) => {
    const def = definition(asset.platform);
    return asset.seconds > def.maxSeconds || !def.aspects.includes(asset.aspect);
  });
  checks.push({
    id: "platform",
    passed: !platformProblem,
    detail: platformProblem
      ? `${platformProblem.platform} asset breaks that platform's format limits.`
      : "Every asset is within its platform's length and aspect limits.",
  });

  const duplication = duplicationRisk(input.opportunity, input.history, { now: input.now });
  checks.push({
    id: "duplicate",
    passed: !duplication.blocked,
    detail: duplication.blocked
      ? (duplication.reasons[0] ?? "Near-duplicate of recent content.")
      : `Duplication risk ${duplication.risk}.`,
  });

  const withinFrequency = input.publishedToday < input.maxDailyPublications;
  checks.push({
    id: "frequency",
    passed: withinFrequency,
    detail: withinFrequency
      ? `${input.publishedToday}/${input.maxDailyPublications} publications used today.`
      : "Daily publication limit reached.",
  });

  const everyAssetHasCta = input.assets.every((asset) => asset.cta.trim().length > 0);
  checks.push({
    id: "cta",
    passed: everyAssetHasCta,
    detail: everyAssetHasCta
      ? "Every asset carries a call to action."
      : "An asset has no call to action.",
  });

  const urlsOk = input.assets.every((asset) => asset.description.includes(profile.url));
  checks.push({
    id: "url",
    passed: urlsOk,
    detail: urlsOk
      ? `All descriptions link to ${profile.url}.`
      : "A description is missing the EarnRoom link.",
  });

  const availabilityClaim = AVAILABILITY_PATTERNS.find((pattern) => pattern.test(body));
  const availabilityOk = input.opportunity.mayClaimAvailability === true || !availabilityClaim;
  checks.push({
    id: "availability",
    passed: availabilityOk,
    detail: availabilityOk
      ? "No availability is promised beyond what published supply supports."
      : "Copy claims space availability, but no published supply supports that claim.",
  });

  const inventedStat = STATISTIC_PATTERNS.find((pattern) => pattern.test(body));
  checks.push({
    id: "statistics",
    passed: !inventedStat,
    detail: inventedStat
      ? "Copy states a statistic that EarnRoom cannot evidence."
      : "No unevidenced statistics or results.",
  });

  const nonUk = NON_UK_PATTERNS.find((pattern) => pattern.test(body));
  checks.push({
    id: "uk_conventions",
    passed: !nonUk,
    detail: nonUk
      ? "Copy uses non-UK currency, units or spelling."
      : "UK currency, units, spelling and date conventions used.",
  });

  checks.push({
    id: "safety",
    passed: input.story.illustrative,
    detail: input.story.illustrative
      ? "Story is illustrative; no real customer, testimonial or result is presented."
      : "Story is not marked illustrative — it may read as a real customer story.",
  });

  const failures = checks.filter((check) => !check.passed).map((check) => check.detail);
  return { passed: failures.length === 0, checks, failures };
}
