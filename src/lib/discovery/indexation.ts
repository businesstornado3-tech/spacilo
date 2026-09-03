/**
 * Indexation gates.
 *
 * A destination is only indexable when it is genuinely useful, factual,
 * canonical and not a duplicate. Everything else is served, but told not to be
 * indexed — the page still helps the person in front of it.
 */
import type { OpportunityScore } from "./scoring";

export type IndexationStatus =
  | "INDEX"
  | "NOINDEX"
  | "CANONICAL_TO_EXISTING_PAGE"
  | "NOT_PUBLISHED"
  | "OPPORTUNITY_ONLY";

export type IndexationInput = {
  /** A dedicated route exists and renders real content. */
  hasDedicatedPage: boolean;
  /** Editorially reviewed factual content, not generated filler. */
  hasReviewedContent: boolean;
  /** A different canonical page already answers this need. */
  duplicateOf?: string | null;
  /** True when the page states or implies marketplace availability. */
  claimsSupply: boolean;
  /** Real published spaces backing any supply claim. */
  publishedSpaces: number;
  /** True if any private/authenticated data would be rendered. */
  exposesPrivateData: boolean;
  score: OpportunityScore;
};

export type IndexationDecision = {
  status: IndexationStatus;
  /** Set when the status is CANONICAL_TO_EXISTING_PAGE. */
  canonicalPath?: string;
  reasons: readonly string[];
};

/** Minimum score for a dedicated indexable destination. */
export const INDEX_SCORE_THRESHOLD = 45;

export function decideIndexation(input: IndexationInput): IndexationDecision {
  const reasons: string[] = [];

  if (input.exposesPrivateData) {
    return { status: "NOINDEX", reasons: ["private_data"] };
  }
  if (input.claimsSupply && input.publishedSpaces < 1) {
    // Never index a page whose reason to exist is availability we do not have.
    return { status: "NOINDEX", reasons: ["supply_claim_without_supply"] };
  }
  if (input.duplicateOf) {
    return {
      status: "CANONICAL_TO_EXISTING_PAGE",
      canonicalPath: input.duplicateOf,
      reasons: ["duplicate_intent"],
    };
  }
  if (!input.hasDedicatedPage) {
    return { status: "OPPORTUNITY_ONLY", reasons: ["no_dedicated_page"] };
  }
  if (!input.hasReviewedContent) {
    return { status: "NOT_PUBLISHED", reasons: ["content_not_reviewed"] };
  }
  if (input.score.total < INDEX_SCORE_THRESHOLD) {
    reasons.push(`score_below_threshold:${input.score.total}`);
    return { status: "NOINDEX", reasons };
  }

  return { status: "INDEX", reasons: ["useful", "unique", "factual"] };
}

export function isIndexable(decision: IndexationDecision): boolean {
  return decision.status === "INDEX";
}
