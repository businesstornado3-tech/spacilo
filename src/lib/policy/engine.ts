/**
 * The deterministic safety engine.
 *
 * Pure functions only — no network, no AI, no randomness. Given a screening
 * result (produced by the same rules on the server) plus a host's declared
 * suitability, it reports what the policy says. Identical inputs always give
 * an identical answer, and the server re-runs the same logic before a request
 * is stored, so the UI can never talk the server into anything.
 */
import type {
  CompatibilityDimension,
  CompatibilityReport,
  CompatibilityStatus,
  PolicyDecision,
  PolicyRule,
  RenterDeclaration,
  ScreenedItem,
  ScreeningResult,
  SuitabilityAttributes,
} from "@/lib/policy/types";
import { suitabilityQuestionLabel } from "@/lib/policy/suitability";

export const DECISION_LABEL: Record<PolicyDecision, string> = {
  allowed: "Fine to store",
  allowed_with_confirmation: "Fine to store",
  restricted: "Needs care",
  prohibited: "Can't be stored",
  needs_identification: "Needs identifying",
  needs_review: "Needs a closer look",
};

export const DECISION_TONE: Record<PolicyDecision, "success" | "neutral" | "warning" | "danger"> = {
  allowed: "success",
  allowed_with_confirmation: "neutral",
  restricted: "warning",
  prohibited: "danger",
  needs_identification: "warning",
  needs_review: "warning",
};

/** True when the renter must act on this item before sending a request. */
export function itemNeedsAction(item: ScreenedItem): boolean {
  if (item.decision === "prohibited") return true;
  if (item.confirmed) return false;
  return (
    item.requires_confirmation ||
    item.decision === "needs_identification" ||
    item.decision === "needs_review"
  );
}

export interface ScreeningSummary {
  available: boolean;
  policyVersion: string | null;
  items: ScreenedItem[];
  prohibited: ScreenedItem[];
  needsAction: ScreenedItem[];
  restricted: ScreenedItem[];
  blocked: boolean;
  actionRequired: boolean;
  clear: boolean;
  headline: string;
}

export function summariseScreening(result: ScreeningResult | null | undefined): ScreeningSummary {
  const items = result?.items ?? [];
  const available = Boolean(result?.ok);
  const prohibited = items.filter((item) => item.decision === "prohibited");
  const needsAction = items.filter((item) => item.decision !== "prohibited" && itemNeedsAction(item));
  const restricted = items.filter((item) => item.decision === "restricted");
  const blocked = prohibited.length > 0;
  const actionRequired = needsAction.length > 0;
  const clear = available && !blocked && !actionRequired;

  let headline: string;
  if (!available) headline = "We can't check your items right now.";
  else if (blocked)
    headline = `${prohibited.length} ${prohibited.length === 1 ? "item can't" : "items can't"} be stored`;
  else if (actionRequired)
    headline = `${needsAction.length} ${needsAction.length === 1 ? "item needs" : "items need"} checking`;
  else if (items.length === 0) headline = "Nothing to check yet";
  else headline = `All ${items.length} checked — nothing to do`;

  return {
    available,
    policyVersion: result?.policy_version ?? null,
    items,
    prohibited,
    needsAction,
    restricted,
    blocked,
    actionRequired,
    clear,
    headline,
  };
}

export function declarationComplete(
  declaration: RenterDeclaration | null | undefined,
  policyVersion: string | null | undefined,
): boolean {
  if (!declaration || !policyVersion) return false;
  return (
    declaration.policy_version === policyVersion &&
    declaration.accurate &&
    declaration.no_prohibited_items &&
    declaration.accepts_policy
  );
}

/** Physical fit comes from SpaceFit, which estimates — it never guarantees. */
function physicalDimension(spaceFit: {
  score?: number | null;
  compatible?: boolean | null;
  label?: string | null;
} | null): CompatibilityDimension {
  if (!spaceFit || typeof spaceFit.score !== "number") {
    return {
      status: "compatible_with_care",
      headline: "Fit not estimated yet",
      detail: "Add your belongings and the space's measurements for a EarnRoom AI estimate.",
      reasons: [],
    };
  }
  if (spaceFit.compatible === false || spaceFit.score < 50) {
    return {
      status: "not_compatible",
      headline: "Unlikely to fit",
      detail: `EarnRoom AI estimates ${spaceFit.score}% — your belongings probably need more room than this space offers.`,
      reasons: ["spacefit_low"],
    };
  }
  if (spaceFit.score < 75) {
    return {
      status: "compatible_with_care",
      headline: "Tight but possible",
      detail: `EarnRoom AI estimates ${spaceFit.score}%. It's an estimate, not a measurement.`,
      reasons: ["spacefit_tight"],
    };
  }
  return {
    status: "compatible",
    headline: spaceFit.label ?? "Good fit",
    detail: `EarnRoom AI estimates ${spaceFit.score}% based on what you've told us.`,
    reasons: [],
  };
}

function policyDimension(summary: ScreeningSummary): CompatibilityDimension {
  if (!summary.available) {
    return {
      status: "compatible_with_care",
      headline: "Not checked yet",
      detail: "We'll check your items against the storage policy before you send a request.",
      reasons: [],
    };
  }
  if (summary.blocked) {
    return {
      status: "not_compatible",
      headline: "Some items can't be stored",
      detail: summary.prohibited.map((item) => item.label).join(", "),
      reasons: summary.prohibited.map((item) => item.reason_code),
    };
  }
  if (summary.actionRequired) {
    return {
      status: "compatible_with_care",
      headline: "A few items need checking",
      detail: summary.needsAction.map((item) => item.label).join(", "),
      reasons: summary.needsAction.map((item) => item.reason_code),
    };
  }
  return {
    status: "compatible",
    headline: "Everything meets the storage policy",
    detail: "Nothing you've listed is prohibited or restricted.",
    reasons: [],
  };
}

export interface SuitabilityMismatch {
  attribute: string;
  required: string;
  actual: string;
  itemLabels: string[];
  message: string;
}

/**
 * Restricted and care-needing items carry the space attributes they depend on.
 * Where the host says otherwise — or hasn't said — we surface it rather than
 * silently blocking two adults from agreeing.
 */
export function suitabilityMismatches(
  items: ScreenedItem[],
  rules: PolicyRule[],
  attributes: SuitabilityAttributes | null,
): SuitabilityMismatch[] {
  const byAttribute = new Map<string, SuitabilityMismatch>();
  for (const item of items) {
    const rule = rules.find((candidate) => candidate.category === item.policy_category);
    if (!rule) continue;
    for (const [key, required] of Object.entries(rule.required_space_attributes ?? {})) {
      const actual = attributes?.[key] ?? "unknown";
      if (actual === required) continue;
      const existing = byAttribute.get(key);
      if (existing) {
        existing.itemLabels.push(item.label);
        continue;
      }
      byAttribute.set(key, {
        attribute: key,
        required,
        actual,
        itemLabels: [item.label],
        message: rule.renter_message,
      });
    }
  }
  return [...byAttribute.values()];
}

function suitabilityDimension(
  mismatches: SuitabilityMismatch[],
  known: boolean,
): CompatibilityDimension {
  if (!known) {
    return {
      status: "compatible_with_care",
      headline: "The host hasn't described this space yet",
      detail: "Ask about damp, ventilation and access before you book.",
      reasons: ["suitability_unknown"],
    };
  }
  if (mismatches.length === 0) {
    return {
      status: "compatible",
      headline: "Suits what you're storing",
      detail: "The host's answers match what your belongings need.",
      reasons: [],
    };
  }
  return {
    status: "compatible_with_care",
    headline: "Worth checking with the host",
    detail: mismatches
      .map((m) => `${suitabilityQuestionLabel(m.attribute)} — ${m.itemLabels.join(", ")}`)
      .join("; "),
    reasons: mismatches.map((m) => `suitability_${m.attribute}`),
  };
}

const RANK: Record<CompatibilityStatus, number> = {
  compatible: 0,
  compatible_with_care: 1,
  not_compatible: 2,
};

export function evaluateCompatibility(input: {
  screening: ScreeningResult | null | undefined;
  rules: PolicyRule[];
  suitability: SuitabilityAttributes | null;
  spaceFit: { score?: number | null; compatible?: boolean | null; label?: string | null } | null;
}): CompatibilityReport {
  const summary = summariseScreening(input.screening);
  const physical = physicalDimension(input.spaceFit);
  const policy = policyDimension(summary);
  const mismatches = suitabilityMismatches(summary.items, input.rules, input.suitability);
  const suitability = suitabilityDimension(mismatches, input.suitability !== null);

  const overall = [physical, policy, suitability].reduce<CompatibilityStatus>(
    (worst, dimension) => (RANK[dimension.status] > RANK[worst] ? dimension.status : worst),
    "compatible",
  );

  return { overall, physical, policy, suitability };
}

export const COMPATIBILITY_LABEL: Record<CompatibilityStatus, string> = {
  compatible: "Looks suitable",
  compatible_with_care: "Suitable with care",
  not_compatible: "Not suitable",
};

/**
 * The single overall outcome, derived only from the three dimensions.
 *
 * Deterministic: no AI, no scoring, no percentages beyond the SpaceFit
 * estimate the renter already saw. A policy block outranks everything, so a
 * good physical fit can never soften an item that can't be stored.
 */
export type CompatibilityOutcome =
  | "strong_match"
  | "match_with_notes"
  | "action_required"
  | "incompatible"
  | "blocked_by_policy";

export const OUTCOME_LABEL: Record<CompatibilityOutcome, string> = {
  strong_match: "Strong match",
  match_with_notes: "Match, with a few notes",
  action_required: "Needs your attention first",
  incompatible: "Not suitable",
  blocked_by_policy: "Can't be stored here",
};

export function compatibilityOutcome(
  report: CompatibilityReport,
  summary: ScreeningSummary,
): { outcome: CompatibilityOutcome; reasons: string[] } {
  const reasons = [
    ...report.policy.reasons,
    ...report.physical.reasons,
    ...report.suitability.reasons,
  ];
  if (summary.blocked || report.policy.status === "not_compatible")
    return { outcome: "blocked_by_policy", reasons };
  if (report.physical.status === "not_compatible") return { outcome: "incompatible", reasons };
  if (summary.actionRequired) return { outcome: "action_required", reasons };
  if (report.overall === "compatible_with_care") return { outcome: "match_with_notes", reasons };
  return { outcome: "strong_match", reasons };
}

/** A request may only be sent when nothing is blocked and nothing is pending. */
export function requestReadiness(input: {
  screening: ScreeningResult | null | undefined;
  declaration: RenterDeclaration | null | undefined;
  policyVersion: string | null;
  report: CompatibilityReport | null;
}): { ready: boolean; blockers: string[] } {
  const summary = summariseScreening(input.screening);
  const blockers: string[] = [];
  if (!input.policyVersion) blockers.push("no_active_policy");
  if (!summary.available) blockers.push("screening_unavailable");
  if (summary.blocked) blockers.push("prohibited_items");
  if (summary.actionRequired) blockers.push("items_need_action");
  if (!declarationComplete(input.declaration, input.policyVersion))
    blockers.push("declaration_incomplete");
  if (input.report && input.report.physical.status === "not_compatible")
    blockers.push("physical_fit");
  return { ready: blockers.length === 0, blockers };
}
