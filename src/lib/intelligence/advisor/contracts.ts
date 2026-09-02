/**
 * Milestone 16 — Advisor API contracts.
 *
 * The advisor is the layer that turns intelligence output into advice. It owns
 * no measurements of its own: every figure it quotes comes from the packing
 * engine, the space engine or the listing record it was handed. That is why
 * every contract here carries reasons, evidence and a confidence — an opinion
 * with no traceable basis cannot be constructed.
 */
import type { InventoryLine, Recommendation, EarnRoomScore, StorageSpace } from "../contracts";
import type { SpaceAnalysis } from "../space/contracts";

export const ADVISOR_CONTRACT_VERSION = "advisor-1";
export const ADVISOR_ENGINE_ID = "earnroom-advisor-v1";

/* --------------------------------------------------------------- inputs */

/** A listing as the advisor sees it: a space plus its commercial facts. */
export interface AdvisorListing {
  id: string;
  title: string;
  space: StorageSpace;
  /** Asking price in pence per month — money never leaves the platform as a float. */
  monthlyPence: number;
  /** Straight-line distance from the renter, in kilometres. */
  distanceKm: number;
  /** 0–5 host rating. */
  hostRating: number;
  reviews: number;
  availableNow: boolean;
  /** Host-declared security features, e.g. `cctv`, `alarm`, `locked`. */
  security: string[];
  /** Host-declared features, e.g. `lighting`, `power`, `heated`. */
  features: string[];
  /** True when the host confirmed the measurements themselves. */
  hostConfirmed?: boolean;
  /** Volume already committed to live bookings, in m³. */
  occupiedVolumeM3?: number;
}

/** What the renter cares about most. Weights the ranking, never the facts. */
export type AdvisorPriority = "value" | "distance" | "space" | "security" | "access";

export interface RecommendationRequest {
  lines: InventoryLine[];
  listings: AdvisorListing[];
  priorities?: AdvisorPriority[];
  /** Monthly budget ceiling in pence, when the renter set one. */
  budgetPence?: number;
  /** Kilometres the renter is willing to travel. */
  maxDistanceKm?: number;
}

/* ---------------------------------------------------------- assessments */

/** One listing, fully assessed. The unit every other contract builds on. */
export interface ListingAssessment {
  listing: AdvisorListing;
  analysis: SpaceAnalysis;
  score: EarnRoomScore;
  /** Share of required volume the space covers, 0–100. */
  fitPercent: number;
  /** Floor left clear once the proposed pack is in, 0–100. */
  floorClearPercent: number;
  remainingVolumeM3: number;
  confidence: number;
}

/* -------------------------------------------------------- explainability */

/** Milestone 3: a recommendation nobody has to take on trust. */
export interface ExplainedRecommendation extends Recommendation {
  /** What to do instead, when the advice does not suit. */
  alternative: string;
  /** What the advice costs — there is always something. */
  tradeOff: string;
}

/* -------------------------------------------------------- decision cards */

export type DecisionRisk = "low" | "medium" | "high";

/** Milestone 8: one decision, everything needed to take it. */
export interface DecisionCard {
  id: string;
  title: string;
  recommendation: string;
  confidence: number;
  reason: string;
  evidence: string[];
  risk: DecisionRisk;
  /** The single next action, in plain English. */
  action: string;
  expectedBenefit: string;
}

/* -------------------------------------------------------------- ranking */

export type RankingFactorId =
  | "compatibility"
  | "distance"
  | "price"
  | "hostRating"
  | "availability"
  | "security"
  | "accessibility"
  | "efficiency"
  | "confidence";

export interface RankingFactor {
  id: RankingFactorId;
  label: string;
  /** 0–100 for this listing on this factor. */
  score: number;
  weight: number;
  detail: string;
}

export interface RankedListing {
  listingId: string;
  title: string;
  rank: number;
  /** 0–100 weighted total. */
  score: number;
  factors: RankingFactor[];
  reasons: string[];
  assessment: ListingAssessment;
}

export interface RankingResult {
  entries: RankedListing[];
  /** Why each listing ranks above the next, in order. */
  explanations: string[];
}

/* ----------------------------------------------------------- comparison */

export type ComparisonAward = "best_overall" | "best_value" | "best_premium" | "best_business";

export interface ComparisonRow {
  listingId: string;
  title: string;
  compatibility: number;
  monthlyPence: number;
  distanceKm: number;
  accessibility: string;
  walkwayM: number;
  remainingVolumeM3: number;
  overall: number;
}

export interface ComparisonVerdict {
  award: ComparisonAward;
  label: string;
  listingId: string | null;
  reason: string;
}

export interface ComparisonResult {
  rows: ComparisonRow[];
  verdicts: ComparisonVerdict[];
  notes: string[];
}

/* ---------------------------------------------------------- suggestions */

export type SuggestionKind =
  | "technique"
  | "sequencing"
  | "protection"
  | "capacity"
  | "split"
  | "equipment";

/** Milestone 6: proactive, and always tied to something observed. */
export interface SmartSuggestion {
  id: string;
  kind: SuggestionKind;
  title: string;
  detail: string;
  evidence: string[];
  /** Volume the suggestion is expected to free, in m³. Zero when not a space move. */
  volumeSavedM3: number;
  confidence: number;
  impact: "high" | "medium" | "low";
}

/* --------------------------------------------------------- host insights */

export type HostInsightKind =
  | "shelving"
  | "access"
  | "lighting"
  | "zoning"
  | "pricing_up"
  | "pricing_down"
  | "business"
  | "loading";

export interface HostInsight {
  id: string;
  kind: HostInsightKind;
  title: string;
  detail: string;
  evidence: string[];
  /** Estimated monthly uplift in pence, or null when it is not a money move. */
  upliftPence: number | null;
  effort: "low" | "medium" | "high";
  confidence: number;
  priority: "high" | "medium" | "low";
}

/* -------------------------------------------------------------- what-if */

export type WhatIfChange =
  | { kind: "remove_item"; itemId: string; quantity?: number }
  | { kind: "add_item"; itemId: string; quantity?: number }
  | { kind: "add_shelving" }
  | { kind: "raise_ceiling"; byM: number }
  | { kind: "clear_obstacle" };

export interface WhatIfResult {
  change: WhatIfChange;
  label: string;
  before: { score: number; fitPercent: number; remainingVolumeM3: number };
  after: { score: number; fitPercent: number; remainingVolumeM3: number };
  deltaScore: number;
  deltaVolumeM3: number;
  verdict: "better" | "worse" | "no_change";
  explanation: string;
}

/* ------------------------------------------------------------- timeline */

export type TimelineStage =
  | "images"
  | "inventory"
  | "dimensions"
  | "space"
  | "placement"
  | "compatibility"
  | "recommendation";

export interface TimelineEvent {
  stage: TimelineStage;
  label: string;
  detail: string;
  confidence: number;
  /** Milliseconds this stage is expected to take, for progress UI only. */
  durationMs: number;
}

/* -------------------------------------------------------------- copilot */

export type CopilotTopic =
  | "inventory"
  | "storage"
  | "suitability"
  | "pricing"
  | "compatibility"
  | "packing"
  | "host"
  | "listings"
  | "recommendations"
  | "unknown";

/** Milestone 1: the copilot answers only from facts it can cite. */
export interface CopilotAnswer {
  topic: CopilotTopic;
  question: string;
  answer: string;
  /** The intelligence facts the answer rests on. */
  evidence: string[];
  confidence: number;
  /** Follow-up questions the copilot can also answer right now. */
  followUps: string[];
  /** True when the platform has no fact to answer with — it says so. */
  unanswered: boolean;
}

/* ------------------------------------------------------------- booking */

export type BookingVerdict =
  | "book_with_confidence"
  | "book_with_care"
  | "review_first"
  | "look_elsewhere";

export interface BookingIntelligence {
  listingId: string;
  verdict: BookingVerdict;
  headline: string;
  /** 0–100 overall booking confidence. */
  score: number;
  confidence: number;
  factors: RankingFactor[];
  cards: DecisionCard[];
  recommendations: ExplainedRecommendation[];
  suggestions: SmartSuggestion[];
  risks: string[];
  futureCapacityM3: number;
}

export interface HostAcceptance {
  verdict: "accept" | "accept_with_changes" | "decline";
  headline: string;
  confidence: number;
  everythingFits: boolean;
  accessStaysSafe: boolean;
  remainingVolumeM3: number;
  /** Share of the space still lettable afterwards, 0–100. */
  remainingPercent: number;
  reasons: string[];
  changes: string[];
  cards: DecisionCard[];
}

/* -------------------------------------------------------------- outputs */

export interface AdvisorMeta {
  engine: string;
  contractVersion: string;
  producedAt: number;
  latencyMs: number;
}

export interface RecommendationResponse {
  ranking: RankingResult;
  comparison: ComparisonResult;
  best: ListingAssessment | null;
  recommendations: ExplainedRecommendation[];
  suggestions: SmartSuggestion[];
  cards: DecisionCard[];
  timeline: TimelineEvent[];
  booking: BookingIntelligence | null;
  meta: AdvisorMeta;
}
