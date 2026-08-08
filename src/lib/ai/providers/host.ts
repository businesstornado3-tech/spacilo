/**
 * Host intelligence (Phase 6B).
 *
 * Pricing guidance, listing quality review, description drafting and dashboard
 * insights. All four are reasoning capabilities behind the orchestrator, so the
 * host experience keeps its existing components and simply receives better
 * answers.
 */
import { explain, factor, alternative } from "../core/explain";
import { registerAiProvider } from "../core/provider-manager";
import type { AiProvider } from "../core/types";

const ENGINE_MODEL = "spacilo-reasoning-1";

/* ------------------------------------------------------- host pricing */

export interface HostPricingSpace {
  spaceType: string;
  volumeM3: number;
  postcode?: string;
  /** Outward code only — never a full postcode in an AI input. */
  outwardCode?: string;
  heated?: boolean;
  dry?: boolean;
  groundFloor?: boolean;
  hasShelving?: boolean;
  securityFeatures?: string[];
  accessHours?: "anytime" | "daytime" | "by_arrangement" | "unknown";
  hostRating?: number;
  verifiedHost?: boolean;
}

export interface HostPricingMarket {
  /** Monthly prices of comparable nearby listings, in GBP. */
  nearbyMonthlyPrices?: number[];
  /** 0–1. Share of nearby listings currently booked. */
  localOccupancy?: number;
  /** 1–12. Defaults to the current month. */
  month?: number;
  /** Searches in the area over the last 30 days, where known. */
  recentSearches?: number;
}

export interface HostPricingInput {
  space: HostPricingSpace;
  market?: HostPricingMarket;
}

export interface HostPricingGuidance {
  dailyPence: number;
  weeklyPence: number;
  monthlyPence: number;
  rangeMonthlyPence: { low: number; high: number };
  /** 0–1 expected share of the year the space is let. */
  estimatedOccupancy: number;
  estimatedAnnualEarningsPence: number;
  basis: string[];
  seasonalNote: string;
}

/** Baseline monthly rate per cubic metre, in pence, by space type. */
const BASE_PENCE_PER_M3: Record<string, number> = {
  garage: 950,
  spare_room: 1100,
  loft: 800,
  shed: 700,
  basement: 850,
  storage_room: 1000,
  outbuilding: 780,
  commercial: 1250,
  other: 900,
};

/** Demand index by calendar month, 1 = average UK demand. */
const SEASONAL_INDEX = [0.92, 0.94, 1.0, 1.04, 1.08, 1.12, 1.18, 1.22, 1.16, 1.02, 0.96, 0.98];

const SEASONAL_NOTE = [
  "January is quiet — a keen rate fills the space faster.",
  "February is quiet — a keen rate fills the space faster.",
  "Demand picks up as the moving season starts.",
  "Spring moves begin, so enquiries usually rise.",
  "Moving season is building.",
  "Summer moves keep demand high.",
  "Peak summer moving demand.",
  "Student and summer demand peaks this month.",
  "Student arrivals keep demand strong.",
  "Demand settles back to the yearly average.",
  "Quieter month — expect fewer enquiries.",
  "Festive storage brings short bookings.",
];

function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

export function priceSpace(input: HostPricingInput): {
  guidance: HostPricingGuidance;
  confidence: number;
} {
  const { space } = input;
  const market = input.market ?? {};
  const month = Math.min(12, Math.max(1, market.month ?? new Date().getMonth() + 1));
  const basis: string[] = [];

  const base = BASE_PENCE_PER_M3[space.spaceType] ?? BASE_PENCE_PER_M3["other"]!;
  let monthly = base * Math.max(1, space.volumeM3);
  basis.push(`${space.spaceType.replace(/_/g, " ")} at about £${(base / 100).toFixed(2)} per m³ a month`);

  // Amenities and quality.
  let multiplier = 1;
  if (space.heated) multiplier += 0.1;
  if (space.dry) multiplier += 0.05;
  if (space.groundFloor) multiplier += 0.05;
  if (space.hasShelving) multiplier += 0.04;
  if (space.accessHours === "anytime") multiplier += 0.08;
  if ((space.securityFeatures?.length ?? 0) >= 2) multiplier += 0.07;
  if (space.verifiedHost) multiplier += 0.03;
  if ((space.hostRating ?? 0) >= 4.7) multiplier += 0.04;
  if (multiplier > 1) basis.push("Amenities, access and host standing lift the guide rate");
  monthly *= multiplier;

  // Local comparables anchor the estimate.
  const comparable = median((market.nearbyMonthlyPrices ?? []).map((price) => price * 100));
  if (comparable) {
    monthly = monthly * 0.55 + comparable * 0.45;
    basis.push(`Blended with ${market.nearbyMonthlyPrices!.length} nearby listing(s)`);
  }

  // Demand.
  const seasonal = SEASONAL_INDEX[month - 1]!;
  monthly *= seasonal;
  if (seasonal > 1.05) basis.push("Seasonal demand is above average this month");
  if (market.localOccupancy !== undefined) {
    monthly *= 0.9 + market.localOccupancy * 0.2;
    basis.push(`Local occupancy around ${Math.round(market.localOccupancy * 100)}%`);
  }

  const monthlyPence = Math.round(monthly / 50) * 50;
  const weeklyPence = Math.round((monthlyPence / 4.3) / 25) * 25;
  const dailyPence = Math.round((monthlyPence / 30) / 5) * 5;

  const occupancyBase = market.localOccupancy ?? 0.6;
  const estimatedOccupancy = Math.min(
    0.95,
    Math.max(0.25, occupancyBase + (space.accessHours === "anytime" ? 0.05 : 0) + (space.verifiedHost ? 0.03 : 0)),
  );

  const signals = [
    market.nearbyMonthlyPrices?.length,
    market.localOccupancy,
    market.recentSearches,
    space.outwardCode,
  ].filter((value) => value !== undefined && value !== null).length;

  return {
    guidance: {
      dailyPence,
      weeklyPence,
      monthlyPence,
      rangeMonthlyPence: {
        low: Math.round((monthlyPence * 0.85) / 50) * 50,
        high: Math.round((monthlyPence * 1.15) / 50) * 50,
      },
      estimatedOccupancy: Number(estimatedOccupancy.toFixed(2)),
      estimatedAnnualEarningsPence: Math.round(monthlyPence * 12 * estimatedOccupancy),
      basis,
      seasonalNote: SEASONAL_NOTE[month - 1]!,
    },
    confidence: Math.min(0.9, 0.55 + signals * 0.08),
  };
}

export const hostPricingProvider: AiProvider<HostPricingInput, HostPricingGuidance> = {
  id: "spacilo-host-pricing",
  kind: "llm",
  model: ENGINE_MODEL,
  remote: false,
  capabilities: ["host-pricing"],
  async run(input) {
    const { guidance, confidence } = priceSpace(input);
    return {
      result: guidance,
      confidence,
      explanation: explain({
        reason: `A guide of about £${(guidance.monthlyPence / 100).toFixed(0)} a month — a starting point, not a valuation.`,
        confidence,
        factors: guidance.basis.map((entry) => factor("Basis", entry, 0.4)),
        alternatives: [
          alternative(
            `£${(guidance.rangeMonthlyPence.low / 100).toFixed(0)} a month`,
            "Fills faster in a quiet month.",
            0.6,
          ),
          alternative(
            `£${(guidance.rangeMonthlyPence.high / 100).toFixed(0)} a month`,
            "Worth trying while local demand is strong.",
            0.5,
          ),
        ],
      }),
    };
  },
};

/* ------------------------------------------------------ listing quality */

export interface ListingQualityInput {
  title?: string;
  description?: string;
  photoCount?: number;
  hasDimensions?: boolean;
  widthM?: number;
  depthM?: number;
  heightM?: number;
  amenities?: string[];
  accessDescribed?: boolean;
  securityFeatures?: string[];
  monthlyPricePence?: number;
  /** Guide rate from the pricing engine, for a like-for-like comparison. */
  guideMonthlyPence?: number;
  verifiedHost?: boolean;
  spaceType?: string;
  outwardCode?: string;
}

export interface ListingQualityIssue {
  area: "title" | "description" | "photos" | "dimensions" | "amenities" | "access" | "pricing" | "trust" | "seo";
  severity: "high" | "medium" | "low";
  message: string;
  suggestion: string;
}

export interface ListingQualityReview {
  score: number;
  band: "needs_work" | "fair" | "good" | "excellent";
  missing: string[];
  issues: ListingQualityIssue[];
  strengths: string[];
}

export function reviewListing(input: ListingQualityInput): {
  review: ListingQualityReview;
  confidence: number;
} {
  const issues: ListingQualityIssue[] = [];
  const missing: string[] = [];
  const strengths: string[] = [];
  let score = 100;

  const title = (input.title ?? "").trim();
  if (title.length < 15) {
    score -= 12;
    missing.push("A descriptive title");
    issues.push({
      area: "title",
      severity: "high",
      message: "The title is too short to tell renters what they are getting.",
      suggestion: "Name the space type, a size cue and the area, for example “Dry single garage near Fratton”.",
    });
  } else {
    strengths.push("Clear, descriptive title");
  }

  const description = (input.description ?? "").trim();
  if (description.length < 120) {
    score -= 15;
    missing.push("A fuller description");
    issues.push({
      area: "description",
      severity: "high",
      message: "The description is shorter than renters expect before enquiring.",
      suggestion: "Describe the floor, the door, what fits, and how collection works — around 80 words.",
    });
  } else if (description.length > 1400) {
    score -= 4;
    issues.push({
      area: "description",
      severity: "low",
      message: "The description is long enough that key details get lost.",
      suggestion: "Lead with size, access and security in the first two sentences.",
    });
  } else {
    strengths.push("Description covers the essentials");
  }

  const photos = input.photoCount ?? 0;
  if (photos < 3) {
    score -= 18;
    missing.push("At least three photos");
    issues.push({
      area: "photos",
      severity: "high",
      message: `Only ${photos} photo${photos === 1 ? "" : "s"} — listings with three or more get far more enquiries.`,
      suggestion: "Add a wide shot from the doorway, one of the empty floor, and one of the access route.",
    });
  } else if (photos < 5) {
    score -= 6;
    issues.push({
      area: "photos",
      severity: "medium",
      message: "A couple more photos would answer the questions renters usually ask.",
      suggestion: "Add the door open, and anything already stored in the space.",
    });
  } else {
    strengths.push(`${photos} photos`);
  }

  if (!input.hasDimensions || !input.widthM || !input.depthM) {
    score -= 14;
    missing.push("Measurements");
    issues.push({
      area: "dimensions",
      severity: "high",
      message: "Without measurements Spacilo cannot tell renters whether their belongings fit.",
      suggestion: "Add width, depth and ceiling height — a rough tape measurement is fine.",
    });
  } else {
    strengths.push("Measurements provided");
  }

  if ((input.amenities?.length ?? 0) === 0) {
    score -= 6;
    missing.push("Amenities");
    issues.push({
      area: "amenities",
      severity: "medium",
      message: "No amenities are listed, so the space looks bare next to similar listings.",
      suggestion: "Tick anything that applies: lighting, power, shelving, dry, heated.",
    });
  }

  if (!input.accessDescribed) {
    score -= 8;
    missing.push("Access details");
    issues.push({
      area: "access",
      severity: "medium",
      message: "Renters need to know when and how they can reach their belongings.",
      suggestion: "Say whether access is by arrangement or anytime, and describe parking.",
    });
  }

  if ((input.securityFeatures?.length ?? 0) === 0) {
    score -= 6;
    issues.push({
      area: "trust",
      severity: "medium",
      message: "No security features are described.",
      suggestion: "Mention locks, lighting, gates or cameras — describe only what exists.",
    });
  } else {
    strengths.push("Security described");
  }

  if (input.monthlyPricePence && input.guideMonthlyPence) {
    const drift = input.monthlyPricePence / input.guideMonthlyPence;
    if (drift > 1.25) {
      score -= 10;
      issues.push({
        area: "pricing",
        severity: "medium",
        message: "The price is well above the local guide, which usually slows enquiries.",
        suggestion: `Spacilo's guide for this space is about £${(input.guideMonthlyPence / 100).toFixed(0)} a month.`,
      });
    } else if (drift < 0.75) {
      score -= 5;
      issues.push({
        area: "pricing",
        severity: "low",
        message: "The price is below the local guide, so you may be leaving income on the table.",
        suggestion: `Similar spaces nearby go for about £${(input.guideMonthlyPence / 100).toFixed(0)} a month.`,
      });
    } else {
      strengths.push("Priced in line with the area");
    }
  }

  if (!input.verifiedHost) {
    score -= 5;
    issues.push({
      area: "trust",
      severity: "medium",
      message: "Verified hosts receive noticeably more booking requests.",
      suggestion: "Complete verification from your profile.",
    });
  }

  if (title && input.outwardCode && !title.toLowerCase().includes(input.outwardCode.toLowerCase())) {
    issues.push({
      area: "seo",
      severity: "low",
      message: "The title does not mention the area, which is what people search for.",
      suggestion: `Include the area or district near ${input.outwardCode} in the title.`,
    });
    score -= 3;
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const band: ListingQualityReview["band"] =
    score >= 85 ? "excellent" : score >= 70 ? "good" : score >= 50 ? "fair" : "needs_work";

  return {
    review: { score, band, missing, issues, strengths },
    confidence: 0.82,
  };
}

export const listingQualityProvider: AiProvider<ListingQualityInput, ListingQualityReview> = {
  id: "spacilo-listing-quality",
  kind: "llm",
  model: ENGINE_MODEL,
  remote: false,
  capabilities: ["listing-quality"],
  async run(input) {
    const { review, confidence } = reviewListing(input);
    return {
      result: review,
      confidence,
      explanation: explain({
        reason: `This listing scores ${review.score} out of 100 (${review.band.replace(/_/g, " ")}).`,
        confidence,
        factors: [
          ...review.strengths.slice(0, 3).map((entry) => factor("Strength", entry, 0.5)),
          ...review.issues.slice(0, 4).map((issue) => factor(issue.area, issue.message, -0.5)),
        ],
      }),
    };
  },
};

/* --------------------------------------------------- description writer */

export type DescriptionTone = "professional" | "friendly" | "premium" | "short" | "detailed";

export interface DescriptionInput {
  spaceType: string;
  widthM?: number;
  depthM?: number;
  heightM?: number;
  amenities?: string[];
  accessSummary?: string;
  securityFeatures?: string[];
  landmarks?: string[];
  areaName?: string;
}

export interface DescriptionDraft {
  tone: DescriptionTone;
  text: string;
  wordCount: number;
}

export interface DescriptionOutput {
  drafts: DescriptionDraft[];
}

const TONES: DescriptionTone[] = ["professional", "friendly", "premium", "short", "detailed"];

function facts(input: DescriptionInput) {
  const type = input.spaceType.replace(/_/g, " ");
  const size =
    input.widthM && input.depthM
      ? `${input.widthM.toFixed(1)} m by ${input.depthM.toFixed(1)} m${input.heightM ? `, ${input.heightM.toFixed(1)} m to the ceiling` : ""}`
      : "";
  const area = input.areaName ? ` in ${input.areaName}` : "";
  const amenities = input.amenities?.length ? input.amenities.join(", ") : "";
  const security = input.securityFeatures?.length ? input.securityFeatures.join(", ") : "";
  const access = input.accessSummary ?? "";
  const landmarks = input.landmarks?.length ? input.landmarks.join(" and ") : "";
  return { type, size, area, amenities, security, access, landmarks };
}

export function writeDescriptions(input: DescriptionInput): DescriptionOutput {
  const f = facts(input);
  const sizeClause = f.size ? ` measuring ${f.size}` : "";

  const build: Record<DescriptionTone, string> = {
    professional: [
      `A ${f.type}${f.area} available for storage${sizeClause}.`,
      f.amenities ? `The space offers ${f.amenities}.` : "",
      f.access ? `Access: ${f.access}.` : "",
      f.security ? `Security features include ${f.security}.` : "",
      "Please message before booking if you need to check anything specific.",
    ]
      .filter(Boolean)
      .join(" "),

    friendly: [
      `Looking for somewhere to keep your things? This ${f.type}${f.area} could be just the spot${sizeClause}.`,
      f.amenities ? `You will find ${f.amenities}.` : "",
      f.access ? `${capitalise(f.access)}.` : "",
      f.landmarks ? `It is handy for ${f.landmarks}.` : "",
      "Do get in touch if you have any questions.",
    ]
      .filter(Boolean)
      .join(" "),

    premium: [
      `A well-kept ${f.type}${f.area}${sizeClause}, looked after and ready for your belongings.`,
      f.amenities ? `Fitted with ${f.amenities}.` : "",
      f.security ? `${capitalise(f.security)} help keep the space secure.` : "",
      f.access ? `Access is ${f.access}.` : "",
    ]
      .filter(Boolean)
      .join(" "),

    short: [`${capitalise(f.type)}${f.area}${sizeClause}.`, f.amenities ? `${capitalise(f.amenities)}.` : ""]
      .filter(Boolean)
      .join(" "),

    detailed: [
      `This ${f.type}${f.area} is available for household or business storage${sizeClause}.`,
      f.amenities ? `The space includes ${f.amenities}, which makes it straightforward to stack boxes and keep things tidy.` : "",
      f.access ? `Access works as follows: ${f.access}.` : "",
      f.security ? `On security, the space has ${f.security}.` : "",
      f.landmarks ? `It sits close to ${f.landmarks}, so it is easy to find.` : "",
      "Message before booking if you would like measurements checked or extra photos.",
    ]
      .filter(Boolean)
      .join(" "),
  };

  return {
    drafts: TONES.map((tone) => ({
      tone,
      text: build[tone],
      wordCount: build[tone].split(/\s+/).filter(Boolean).length,
    })),
  };
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export const descriptionProvider: AiProvider<DescriptionInput, DescriptionOutput> = {
  id: "spacilo-description",
  kind: "llm",
  model: ENGINE_MODEL,
  remote: false,
  capabilities: ["description"],
  async run(input) {
    const result = writeDescriptions(input);
    return {
      result,
      confidence: 0.75,
      explanation: explain({
        reason: "Five drafts written from the facts you supplied — edit any of them before saving.",
        confidence: 0.75,
        factors: [factor("Facts used", Object.values(facts(input)).filter(Boolean).length.toString(), 0.5)],
      }),
    };
  },
};

/* ---------------------------------------------------------- host insights */

export interface HostInsightsInput {
  listings: Array<{
    id: string;
    title?: string;
    qualityScore?: number;
    monthlyPricePence?: number;
    guideMonthlyPence?: number;
    views30d?: number;
    enquiries30d?: number;
    bookings30d?: number;
    occupancy?: number;
    published?: boolean;
  }>;
  /** Features renters searched for in this host's area. */
  searchedFeatures?: string[];
  month?: number;
}

export interface HostInsight {
  id: string;
  kind:
    | "pricing"
    | "demand"
    | "occupancy"
    | "listing_health"
    | "conversion"
    | "search_features"
    | "improvement"
    | "forecast";
  title: string;
  detail: string;
  severity: "info" | "opportunity" | "attention";
  /** Optional listing the insight is about. */
  listingId?: string;
  /** Estimated monthly upside, in pence. */
  valuePence?: number;
}

export interface HostInsightsOutput {
  insights: HostInsight[];
  forecastMonthlyPence: number;
}

export function buildHostInsights(input: HostInsightsInput): HostInsightsOutput {
  const insights: HostInsight[] = [];
  const month = Math.min(12, Math.max(1, input.month ?? new Date().getMonth() + 1));
  const seasonal = SEASONAL_INDEX[month - 1]!;
  let forecast = 0;

  for (const listing of input.listings) {
    const label = listing.title ?? "your space";

    if (listing.monthlyPricePence && listing.guideMonthlyPence) {
      const gap = listing.guideMonthlyPence - listing.monthlyPricePence;
      if (gap > listing.guideMonthlyPence * 0.12) {
        insights.push({
          id: `pricing-${listing.id}`,
          kind: "pricing",
          title: "Room to raise your rate",
          detail: `${label} is priced about £${(gap / 100).toFixed(0)} a month below the local guide.`,
          severity: "opportunity",
          listingId: listing.id,
          valuePence: gap,
        });
      } else if (gap < -listing.guideMonthlyPence * 0.2) {
        insights.push({
          id: `pricing-high-${listing.id}`,
          kind: "pricing",
          title: "Priced above the area",
          detail: `${label} is above the local guide, which usually means fewer enquiries.`,
          severity: "attention",
          listingId: listing.id,
        });
      }
    }

    if ((listing.qualityScore ?? 100) < 70) {
      insights.push({
        id: `health-${listing.id}`,
        kind: "listing_health",
        title: "Listing needs attention",
        detail: `${label} scores ${listing.qualityScore} out of 100 — photos and measurements make the biggest difference.`,
        severity: "attention",
        listingId: listing.id,
      });
    }

    const views = listing.views30d ?? 0;
    const enquiries = listing.enquiries30d ?? 0;
    const bookings = listing.bookings30d ?? 0;
    if (views >= 25 && enquiries / Math.max(1, views) < 0.04) {
      insights.push({
        id: `conversion-${listing.id}`,
        kind: "conversion",
        title: "Views are not turning into enquiries",
        detail: `${label} was seen ${views} times but received ${enquiries} enquir${enquiries === 1 ? "y" : "ies"}.`,
        severity: "attention",
        listingId: listing.id,
      });
    }
    if (enquiries >= 3 && bookings === 0) {
      insights.push({
        id: `reply-${listing.id}`,
        kind: "conversion",
        title: "Enquiries are going cold",
        detail: "Replying within a few hours is the single biggest factor in winning a booking.",
        severity: "attention",
        listingId: listing.id,
      });
    }

    if (listing.occupancy !== undefined) {
      insights.push({
        id: `occupancy-${listing.id}`,
        kind: "occupancy",
        title: `Occupancy around ${Math.round(listing.occupancy * 100)}%`,
        detail:
          listing.occupancy > 0.8
            ? "Nearly always let — worth reviewing your rate at the next renewal."
            : "There is room in the calendar for another booking.",
        severity: listing.occupancy > 0.8 ? "opportunity" : "info",
        listingId: listing.id,
      });
    }

    forecast += (listing.monthlyPricePence ?? 0) * (listing.occupancy ?? 0.6) * seasonal;
  }

  insights.push({
    id: "demand",
    kind: "demand",
    title: seasonal > 1.05 ? "Demand is above average" : "Demand is steady",
    detail: SEASONAL_NOTE[month - 1]!,
    severity: seasonal > 1.05 ? "opportunity" : "info",
  });

  if (input.searchedFeatures?.length) {
    insights.push({
      id: "searched-features",
      kind: "search_features",
      title: "What renters are searching for nearby",
      detail: `${input.searchedFeatures.slice(0, 4).join(", ")} come up most often in this area.`,
      severity: "info",
    });
  }

  insights.push({
    id: "forecast",
    kind: "forecast",
    title: "Income forecast",
    detail: `Around £${(forecast / 100).toFixed(0)} next month on current rates and occupancy.`,
    severity: "info",
  });

  return { insights, forecastMonthlyPence: Math.round(forecast) };
}

export const hostInsightsProvider: AiProvider<HostInsightsInput, HostInsightsOutput> = {
  id: "spacilo-host-insights",
  kind: "llm",
  model: ENGINE_MODEL,
  remote: false,
  capabilities: ["host-insights"],
  async run(input) {
    const result = buildHostInsights(input);
    const confidence = Math.min(0.85, 0.5 + input.listings.length * 0.1);
    return {
      result,
      confidence,
      explanation: explain({
        reason: `${result.insights.length} insight${result.insights.length === 1 ? "" : "s"} from your listings and local demand.`,
        confidence,
        factors: result.insights
          .filter((insight) => insight.severity !== "info")
          .slice(0, 4)
          .map((insight) => factor(insight.title, insight.detail, insight.severity === "opportunity" ? 0.6 : -0.4)),
      }),
    };
  },
};

export function installHostProviders(): void {
  registerAiProvider(hostPricingProvider);
  registerAiProvider(listingQualityProvider);
  registerAiProvider(descriptionProvider);
  registerAiProvider(hostInsightsProvider);
}
