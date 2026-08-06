/**
 * Storage safety — shared types.
 *
 * AI OBSERVES. USERS CONFIRM. POLICY RULES DECIDE. THE SERVER ENFORCES.
 *
 * Nothing in this folder decides whether something is lawful. It maps what a
 * renter has told us they're storing onto the published storage policy, and
 * reports what that policy says.
 */

export type PolicyDecision =
  | "allowed"
  | "allowed_with_confirmation"
  | "restricted"
  | "prohibited"
  | "needs_identification"
  | "needs_review";

export interface PolicyRule {
  id: string;
  rule_key: string;
  category: string;
  decision: PolicyDecision;
  severity: number;
  requires_user_confirmation: boolean;
  requires_staff_review: boolean;
  renter_message: string;
  host_message: string | null;
  internal_reason_code: string;
  required_space_attributes: Record<string, string>;
  sort_order: number;
}

export interface PolicySection {
  heading: string;
  body: string;
}

export interface PolicyVersion {
  id: string;
  version: string;
  status: "draft" | "published" | "retired";
  title: string;
  summary: string;
  sections: PolicySection[];
  effective_at: string | null;
  published_at: string | null;
}

/** One screened item, exactly as the server returns it. */
export interface ScreenedItem {
  item_id: string;
  label: string;
  policy_category: string;
  decision: PolicyDecision;
  reason_code: string;
  message: string;
  requires_confirmation: boolean;
  requires_staff_review: boolean;
  confirmed: boolean;
  provenance: "ai_proposed" | "renter_confirmed" | "renter_corrected" | "manual";
}

export interface ScreeningResult {
  ok: boolean;
  reason?: string;
  policy_version?: string;
  policy_version_id?: string;
  screened_at?: string;
  items?: ScreenedItem[];
  blocked?: boolean;
  action_required?: boolean;
}

/** Tri-state answers keep "we don't know" honest and visible. */
export type SuitabilityAnswer = string;
export type SuitabilityAttributes = Record<string, SuitabilityAnswer>;

export interface SuitabilityProfile {
  space_id: string;
  host_id: string;
  attributes: SuitabilityAttributes;
  host_notes: string | null;
  host_confirmed_at: string | null;
  declaration_authority: boolean;
  declaration_compliance: boolean;
  declaration_accuracy: boolean;
  declared_at: string | null;
}

/** What the renter confirms before a request can be sent. */
export interface RenterDeclaration {
  policy_version: string;
  accurate: boolean;
  no_prohibited_items: boolean;
  accepts_policy: boolean;
}

export type CompatibilityStatus = "compatible" | "compatible_with_care" | "not_compatible";

export interface CompatibilityDimension {
  status: CompatibilityStatus;
  headline: string;
  detail: string;
  reasons: string[];
}

export interface CompatibilityReport {
  overall: CompatibilityStatus;
  physical: CompatibilityDimension;
  policy: CompatibilityDimension;
  suitability: CompatibilityDimension;
}

/**
 * What an anonymous visitor is allowed to see of a rule. No internal reason
 * codes, no host-only messaging, no staff-review flags.
 */
export interface PublicPolicyRule {
  id: string;
  rule_key: string;
  category: string;
  decision: PolicyDecision;
  renter_message: string;
  sort_order: number;
}
