/**
 * Discovery intelligence (Phase 6B).
 *
 * Turning plain English into search filters, surfacing the storage themes that
 * matter this month, summarising verifiable trust facts, and matching help
 * questions to articles. All behind the orchestrator.
 */
import { explain, factor } from "../core/explain";
import { registerAiProvider } from "../core/provider-manager";
import type { AiProvider } from "../core/types";
import { cosine, embedText } from "./local";

const ENGINE_MODEL = "spacilo-reasoning-1";

/* ------------------------------------------- natural-language search */

export type SearchIntent =
  | "household"
  | "moving"
  | "student"
  | "business"
  | "vehicle"
  | "seasonal"
  | "general";

export interface SearchFilters {
  intent: SearchIntent;
  /** Free-text location the renter typed, e.g. "near Portsmouth". */
  locationText: string | null;
  /** Estimated volume needed, in cubic metres, where the query implies it. */
  estimatedVolumeM3: number | null;
  spaceTypes: string[];
  itemTypes: string[];
  needsClimateControl: boolean;
  needsAnytimeAccess: boolean;
  needsHighSecurity: boolean;
  needsGroundFloor: boolean;
  needsVehicleAccess: boolean;
  durationMonths: number | null;
  maxMonthlyPrice: number | null;
}

export interface NlSearchInput {
  query: string;
}

export interface NlSearchOutput {
  filters: SearchFilters;
  /** Cleaned keyword string for the existing text search. */
  keywords: string;
  /** Plain-English readback so the renter can see what was understood. */
  interpretation: string;
  matchedSignals: string[];
}

interface ItemRule {
  keys: string[];
  item: string;
  volumeM3: number;
  spaceTypes?: string[];
}

const ITEM_RULES: ItemRule[] = [
  { keys: ["sofa", "settee", "couch"], item: "sofa", volumeM3: 2.4, spaceTypes: ["garage", "spare_room"] },
  { keys: ["bike", "bicycle", "cycle"], item: "bicycle", volumeM3: 0.8, spaceTypes: ["garage", "shed"] },
  { keys: ["motorbike", "motorcycle", "scooter"], item: "motorbike", volumeM3: 2.2, spaceTypes: ["garage"] },
  { keys: ["car", "vehicle", "campervan", "caravan"], item: "vehicle", volumeM3: 12, spaceTypes: ["garage", "outbuilding"] },
  { keys: ["box", "boxes"], item: "boxes", volumeM3: 1.5 },
  { keys: ["furniture"], item: "furniture", volumeM3: 6 },
  { keys: ["mattress", "bed"], item: "bed", volumeM3: 1.8 },
  { keys: ["wardrobe"], item: "wardrobe", volumeM3: 1.6 },
  { keys: ["fridge", "freezer", "washing machine", "appliance"], item: "appliances", volumeM3: 1.2 },
  { keys: ["archive", "document", "paperwork", "files"], item: "documents", volumeM3: 2 },
  { keys: ["stock", "inventory", "pallet"], item: "business stock", volumeM3: 8 },
  { keys: ["garden", "mower", "tools"], item: "garden equipment", volumeM3: 1.5, spaceTypes: ["shed", "garage"] },
  { keys: ["christmas", "decorations"], item: "seasonal decorations", volumeM3: 0.6 },
  { keys: ["suitcase", "luggage"], item: "luggage", volumeM3: 0.5 },
];

const INTENT_RULES: Array<{ keys: string[]; intent: SearchIntent; volumeM3?: number }> = [
  { keys: ["moving house", "house move", "moving", "relocat", "between houses"], intent: "moving", volumeM3: 25 },
  { keys: ["student", "uni", "university", "term"], intent: "student", volumeM3: 4 },
  { keys: ["business", "stock", "office", "commercial", "archive"], intent: "business", volumeM3: 10 },
  { keys: ["car", "motorbike", "campervan", "caravan", "vehicle"], intent: "vehicle", volumeM3: 12 },
  { keys: ["christmas", "seasonal", "summer", "winter", "holiday"], intent: "seasonal", volumeM3: 1.5 },
];

const SPACE_TYPE_WORDS: Record<string, string> = {
  garage: "garage",
  "spare room": "spare_room",
  room: "spare_room",
  loft: "loft",
  attic: "loft",
  shed: "shed",
  basement: "basement",
  cellar: "basement",
  outbuilding: "outbuilding",
  barn: "outbuilding",
  unit: "commercial",
  warehouse: "commercial",
};

const STOP_WORDS = new Set([
  "i", "need", "a", "an", "the", "for", "my", "somewhere", "some", "to", "store", "storage",
  "looking", "want", "please", "with", "and", "in", "near", "of", "is", "it", "me", "have",
]);

export function parseSearchQuery(query: string): NlSearchOutput {
  const text = query.toLowerCase();
  const matchedSignals: string[] = [];

  // Items.
  const itemTypes: string[] = [];
  let volume = 0;
  const spaceTypes = new Set<string>();
  for (const rule of ITEM_RULES) {
    if (rule.keys.some((key) => text.includes(key))) {
      itemTypes.push(rule.item);
      volume += rule.volumeM3;
      matchedSignals.push(`item: ${rule.item}`);
      for (const type of rule.spaceTypes ?? []) spaceTypes.add(type);
    }
  }

  // Intent.
  let intent: SearchIntent = itemTypes.length ? "household" : "general";
  for (const rule of INTENT_RULES) {
    if (rule.keys.some((key) => text.includes(key))) {
      intent = rule.intent;
      if (!volume && rule.volumeM3) volume = rule.volumeM3;
      matchedSignals.push(`intent: ${rule.intent}`);
      break;
    }
  }

  // Explicit space types.
  for (const [word, type] of Object.entries(SPACE_TYPE_WORDS)) {
    if (text.includes(word)) {
      spaceTypes.add(type);
      matchedSignals.push(`space: ${type}`);
    }
  }

  // Location — "near X", "in X", "around X".
  const locationMatch = /\b(?:near|in|around|close to|by)\s+([a-z][a-z\s'-]{2,30})/i.exec(query);
  let locationText = locationMatch?.[1]?.trim() ?? null;
  if (locationText) {
    locationText = locationText.replace(/\s+(for|with|to|and)\b.*$/i, "").trim();
    matchedSignals.push(`location: ${locationText}`);
  }
  const postcodeMatch = /\b([A-Z]{1,2}\d{1,2}[A-Z]?)\b/i.exec(query);
  if (!locationText && postcodeMatch) {
    locationText = postcodeMatch[1]!.toUpperCase();
    matchedSignals.push(`location: ${locationText}`);
  }

  // Requirements.
  const needsClimateControl = /(climate|heated|temperature|damp|humid|dry)/.test(text);
  const needsAnytimeAccess = /(24|anytime|any time|whenever|out of hours|regular access)/.test(text);
  const needsHighSecurity = /(secure|security|cctv|alarm|locked|safe)/.test(text);
  const needsGroundFloor = /(ground floor|no steps|level access|wheelchair)/.test(text);
  const needsVehicleAccess = /(drive|driveway|van|lorry|parking|vehicle access)/.test(text);
  if (needsClimateControl) matchedSignals.push("climate control");
  if (needsAnytimeAccess) matchedSignals.push("anytime access");
  if (needsHighSecurity) matchedSignals.push("security");

  // Duration and budget.
  const durationMatch = /(\d+)\s*(month|months|week|weeks|year|years)/.exec(text);
  let durationMonths: number | null = null;
  if (durationMatch) {
    const amount = Number(durationMatch[1]);
    const unit = durationMatch[2]!;
    durationMonths = unit.startsWith("year") ? amount * 12 : unit.startsWith("week") ? Math.max(1, Math.round(amount / 4.3)) : amount;
    matchedSignals.push(`duration: ${durationMonths} month(s)`);
  }
  const priceMatch = /(?:under|below|less than|up to|max)\s*£?\s*(\d{2,4})/.exec(text);
  const maxMonthlyPrice = priceMatch ? Number(priceMatch[1]) : null;
  if (maxMonthlyPrice) matchedSignals.push(`budget: £${maxMonthlyPrice}`);

  const keywords = text
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word))
    .join(" ");

  const filters: SearchFilters = {
    intent,
    locationText,
    estimatedVolumeM3: volume ? Number(volume.toFixed(1)) : null,
    spaceTypes: [...spaceTypes],
    itemTypes,
    needsClimateControl,
    needsAnytimeAccess,
    needsHighSecurity,
    needsGroundFloor,
    needsVehicleAccess,
    durationMonths,
    maxMonthlyPrice,
  };

  const parts: string[] = [];
  parts.push(
    intent === "general" ? "Storage" : `${intent === "moving" ? "Storage while you move" : `${capitalise(intent)} storage`}`,
  );
  if (filters.estimatedVolumeM3) parts.push(`about ${filters.estimatedVolumeM3} m³`);
  if (locationText) parts.push(`near ${locationText}`);
  if (needsClimateControl) parts.push("dry or heated");
  if (needsAnytimeAccess) parts.push("with anytime access");
  if (needsHighSecurity) parts.push("with good security");

  return { filters, keywords, interpretation: parts.join(", "), matchedSignals };
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export const nlSearchProvider: AiProvider<NlSearchInput, NlSearchOutput> = {
  id: "spacilo-nl-search",
  kind: "llm",
  model: ENGINE_MODEL,
  remote: false,
  capabilities: ["nl-search"],
  async run(input) {
    const result = parseSearchQuery(input.query);
    const confidence = Math.min(0.92, 0.4 + result.matchedSignals.length * 0.12);
    return {
      result,
      confidence,
      explanation: explain({
        reason: `Understood this as: ${result.interpretation}.`,
        confidence,
        factors: result.matchedSignals.slice(0, 5).map((signal) => factor("Signal", signal, 0.4)),
      }),
    };
  },
};

/* ------------------------------------------------------------ seasonal */

export interface SeasonalInput {
  month?: number;
  audience?: "renter" | "host" | "visitor";
  region?: string;
}

export interface SeasonalTheme {
  id: string;
  title: string;
  detail: string;
  /** 0–1 relevance for the month in question. */
  relevance: number;
  audience: "renter" | "host" | "both";
}

export interface SeasonalOutput {
  month: number;
  themes: SeasonalTheme[];
}

const THEMES: Array<Omit<SeasonalTheme, "relevance"> & { months: number[] }> = [
  {
    id: "student",
    title: "Student storage",
    detail: "Term ends bring short summer bookings for boxes, bikes and small furniture.",
    audience: "both",
    months: [5, 6, 7, 8, 9],
  },
  {
    id: "moving",
    title: "Moving season",
    detail: "Most UK house moves complete between spring and early autumn, so whole-house storage is in demand.",
    audience: "both",
    months: [3, 4, 5, 6, 7, 8, 9],
  },
  {
    id: "christmas",
    title: "Christmas storage",
    detail: "Space for decorations, gifts and the furniture that makes room for guests.",
    audience: "renter",
    months: [11, 12, 1],
  },
  {
    id: "vehicle",
    title: "Winter vehicle storage",
    detail: "Classic cars, motorbikes and caravans go under cover for the winter months.",
    audience: "both",
    months: [10, 11, 12, 1, 2],
  },
  {
    id: "business-archive",
    title: "Business archive storage",
    detail: "Year-end paperwork and stock overflow drive business enquiries.",
    audience: "both",
    months: [1, 2, 3, 4],
  },
  {
    id: "holiday",
    title: "Holiday and garden storage",
    detail: "Garden furniture, camping kit and bikes move in and out with the seasons.",
    audience: "renter",
    months: [4, 5, 9, 10],
  },
];

export function seasonalThemes(input: SeasonalInput = {}): SeasonalOutput {
  const month = Math.min(12, Math.max(1, input.month ?? new Date().getMonth() + 1));
  const audience = input.audience ?? "renter";
  const themes = THEMES.filter((theme) => theme.months.includes(month))
    .filter((theme) => audience === "visitor" || theme.audience === "both" || theme.audience === audience)
    .map(({ months, ...theme }) => ({
      ...theme,
      relevance: Number((0.6 + (months.indexOf(month) === Math.floor(months.length / 2) ? 0.3 : 0.1)).toFixed(2)),
    }))
    .sort((a, b) => b.relevance - a.relevance);
  return { month, themes };
}

export const seasonalProvider: AiProvider<SeasonalInput, SeasonalOutput> = {
  id: "spacilo-seasonal",
  kind: "llm",
  model: ENGINE_MODEL,
  remote: false,
  capabilities: ["seasonal"],
  async run(input) {
    const result = seasonalThemes(input);
    return {
      result,
      confidence: 0.7,
      explanation: explain({
        reason: result.themes.length
          ? `${result.themes.length} storage theme${result.themes.length === 1 ? "" : "s"} matter this month.`
          : "Nothing seasonal stands out this month.",
        confidence: 0.7,
        factors: result.themes.map((theme) => factor(theme.title, theme.detail, theme.relevance)),
      }),
    };
  },
};

/* ------------------------------------------------------- trust summary */

export interface TrustSummaryInput {
  verifiedHost?: boolean;
  idChecked?: boolean;
  hostRating?: number;
  reviewCount?: number;
  medianResponseMinutes?: number;
  acceptanceRate?: number;
  securityFeatures?: string[];
  groundFloor?: boolean;
  accessHours?: "anytime" | "daytime" | "by_arrangement" | "unknown";
  heated?: boolean;
  dry?: boolean;
  suitableFor?: string[];
  bookingsCompleted?: number;
  memberSinceYear?: number;
}

export interface TrustPoint {
  id: string;
  label: string;
  detail: string;
  kind: "identity" | "reputation" | "responsiveness" | "security" | "access" | "conditions" | "suitability";
}

export interface TrustSummaryOutput {
  points: TrustPoint[];
  /** 0–100 from verifiable facts only. */
  strength: number;
}

export function buildTrustSummary(input: TrustSummaryInput): TrustSummaryOutput {
  const points: TrustPoint[] = [];
  let strength = 30;

  if (input.verifiedHost) {
    points.push({ id: "verified", label: "Verified host", detail: "Identity checks completed with Spacilo.", kind: "identity" });
    strength += 15;
  }
  if ((input.reviewCount ?? 0) >= 5 && (input.hostRating ?? 0) >= 4.5) {
    points.push({
      id: "rated",
      label: "Highly rated",
      detail: `${input.hostRating?.toFixed(1)} from ${input.reviewCount} reviews.`,
      kind: "reputation",
    });
    strength += 15;
  } else if ((input.reviewCount ?? 0) > 0) {
    points.push({
      id: "reviewed",
      label: `${input.reviewCount} review${input.reviewCount === 1 ? "" : "s"}`,
      detail: `Rated ${input.hostRating?.toFixed(1) ?? "—"} by previous renters.`,
      kind: "reputation",
    });
    strength += 6;
  }
  if (input.medianResponseMinutes !== undefined && input.medianResponseMinutes <= 120) {
    points.push({
      id: "responsive",
      label: "Fast response time",
      detail: `Usually replies within ${input.medianResponseMinutes < 60 ? "an hour" : "two hours"}.`,
      kind: "responsiveness",
    });
    strength += 10;
  }
  if ((input.securityFeatures?.length ?? 0) >= 2) {
    points.push({
      id: "secure",
      label: "Secure access",
      detail: `${input.securityFeatures!.slice(0, 3).join(", ")}.`,
      kind: "security",
    });
    strength += 10;
  }
  if (input.groundFloor) {
    points.push({ id: "ground", label: "Ground floor", detail: "No stairs on the route in.", kind: "access" });
    strength += 5;
  }
  if (input.accessHours === "anytime") {
    points.push({ id: "access", label: "24-hour access", detail: "Reach your belongings whenever you need to.", kind: "access" });
    strength += 8;
  }
  if (input.heated || input.dry) {
    points.push({
      id: "conditions",
      label: input.heated ? "Heated and dry" : "Reported dry",
      detail: "Conditions described by the host, not independently measured.",
      kind: "conditions",
    });
    strength += 5;
  }
  for (const use of input.suitableFor ?? []) {
    points.push({
      id: `suitable-${use.toLowerCase().replace(/\s+/g, "-")}`,
      label: `Suitable for ${use}`,
      detail: "Based on the size, access and conditions the host has described.",
      kind: "suitability",
    });
  }
  if ((input.bookingsCompleted ?? 0) >= 3) {
    points.push({
      id: "experienced",
      label: `${input.bookingsCompleted} bookings completed`,
      detail: "A track record of completed stays on Spacilo.",
      kind: "reputation",
    });
    strength += 7;
  }

  return { points, strength: Math.min(100, strength) };
}

export const trustSummaryProvider: AiProvider<TrustSummaryInput, TrustSummaryOutput> = {
  id: "spacilo-trust-summary",
  kind: "llm",
  model: ENGINE_MODEL,
  remote: false,
  capabilities: ["trust-summary"],
  async run(input) {
    const result = buildTrustSummary(input);
    return {
      result,
      confidence: 0.88,
      explanation: explain({
        reason: "Built from verified facts on this listing — nothing here is a guarantee.",
        confidence: 0.88,
        factors: result.points.map((point) => factor(point.label, point.detail, 0.4)),
      }),
    };
  },
};

/* --------------------------------------------------------- help search */

export interface HelpArticle {
  id: string;
  title: string;
  summary: string;
  /** Route the article lives on, e.g. /how-it-works. */
  path: string;
  keywords?: string[];
}

export interface HelpSearchInput {
  question: string;
  articles: HelpArticle[];
}

export interface HelpMatch {
  id: string;
  title: string;
  path: string;
  score: number;
  summary: string;
}

export interface HelpSearchOutput {
  matches: HelpMatch[];
  /** True when nothing clears the relevance floor. */
  noConfidentMatch: boolean;
}

export function matchHelpArticles(input: HelpSearchInput): HelpSearchOutput {
  const questionVector = embedText(input.question);
  const words = input.question.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 3);

  const matches = input.articles
    .map((article) => {
      const corpus = `${article.title} ${article.summary} ${(article.keywords ?? []).join(" ")}`;
      const semantic = cosine(questionVector, embedText(corpus));
      const keyword = words.filter((word) => corpus.toLowerCase().includes(word)).length / Math.max(1, words.length);
      return {
        id: article.id,
        title: article.title,
        path: article.path,
        summary: article.summary,
        score: Number((semantic * 0.6 + keyword * 0.4).toFixed(3)),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return { matches, noConfidentMatch: (matches[0]?.score ?? 0) < 0.2 };
}

export const helpSearchProvider: AiProvider<HelpSearchInput, HelpSearchOutput> = {
  id: "spacilo-help-search",
  kind: "embedding",
  model: "spacilo-embed-64",
  remote: false,
  capabilities: ["help-search"],
  async run(input) {
    const result = matchHelpArticles(input);
    const confidence = result.noConfidentMatch ? 0.35 : Math.min(0.9, 0.4 + (result.matches[0]?.score ?? 0));
    return {
      result,
      confidence,
      explanation: explain({
        reason: result.noConfidentMatch
          ? "Nothing in the help centre closely matches that question — support can pick it up."
          : `Closest article: ${result.matches[0]?.title}.`,
        confidence,
        factors: result.matches.slice(0, 3).map((match) => factor(match.title, match.score.toFixed(2), match.score)),
      }),
    };
  },
};

export function installDiscoveryProviders(): void {
  registerAiProvider(nlSearchProvider);
  registerAiProvider(seasonalProvider);
  registerAiProvider(trustSummaryProvider);
  registerAiProvider(helpSearchProvider);
}
