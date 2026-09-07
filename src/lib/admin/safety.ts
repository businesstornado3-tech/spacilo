/**
 * Founder safety queue — pure shaping of the existing support-case data.
 *
 * There is no separate incident system: a safety case IS a support case that
 * has been given a severity and a source by staff. Everything here is
 * presentation logic over `admin_safety_queue()`.
 */

export type SafetySeverity = "low" | "medium" | "high" | "critical";

export type SafetySource =
  | "item_scan"
  | "renter_report"
  | "host_report"
  | "handover_report"
  | "listing_review"
  | "support_case"
  | "policy_screen"
  | "admin_review";

export type SafetyScope = "listing" | "booking" | "storage_arrangement" | "account";

export interface SafetyCaseRow {
  id: string;
  reference: string;
  booking_id: string | null;
  renter_id: string | null;
  host_id: string | null;
  category: string;
  stage: string;
  status: string;
  summary: string;
  severity: SafetySeverity | null;
  source: SafetySource | null;
  /** Set when staff gave the case a severity. */
  safety_flagged_at?: string | null;
  /** Staff-only reason recorded with the severity. */
  severity_note?: string | null;
  created_at: string;

  last_activity_at: string | null;
  evidence_count: number;
  booking_status: string | null;
  payment_hold: boolean;
}

export interface SafetyControlRow {
  id: string;
  scope: SafetyScope;
  subject_id: string;
  state: "active" | "safety_review" | "suspended";
  reason: string;
  source: SafetySource;
  case_id: string | null;
  created_at: string;
}

export interface SafetyQueue {
  cases: SafetyCaseRow[];
  controls: SafetyControlRow[];
  generated_at: string;
}

export const SEVERITY_ORDER: SafetySeverity[] = ["critical", "high", "medium", "low"];

export const SEVERITY_LABEL: Record<SafetySeverity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const SEVERITY_TONE: Record<SafetySeverity, "error" | "warning" | "info"> = {
  critical: "error",
  high: "error",
  medium: "warning",
  low: "info",
};

export const SOURCE_LABEL: Record<SafetySource, string> = {
  item_scan: "Item scan",
  renter_report: "Renter report",
  host_report: "Host report",
  handover_report: "Handover report",
  listing_review: "Listing review",
  support_case: "Support case",
  policy_screen: "Policy screening",
  admin_review: "Admin review",
};

export const SCOPE_LABEL: Record<SafetyScope, string> = {
  listing: "Listing",
  booking: "Booking",
  storage_arrangement: "Storage arrangement",
  account: "Account",
};

/** Highest severity first, then newest. Cases with no severity sort last. */
export function sortBySeverity(cases: SafetyCaseRow[]): SafetyCaseRow[] {
  const rank = (severity: SafetySeverity | null) =>
    severity ? SEVERITY_ORDER.indexOf(severity) : SEVERITY_ORDER.length;
  return [...cases].sort((a, b) => {
    const bySeverity = rank(a.severity) - rank(b.severity);
    if (bySeverity !== 0) return bySeverity;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

export function countBySeverity(cases: SafetyCaseRow[]): Record<SafetySeverity, number> {
  const counts: Record<SafetySeverity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const row of cases) if (row.severity) counts[row.severity] += 1;
  return counts;
}

const OPEN_STATUSES = new Set([
  "open",
  "waiting_for_other_party",
  "waiting_for_reporter",
  "under_review",
]);

export const isOpenCase = (row: SafetyCaseRow) => OPEN_STATUSES.has(row.status);

export function unresolved(cases: SafetyCaseRow[]): SafetyCaseRow[] {
  return sortBySeverity(cases.filter(isOpenCase));
}

/**
 * Wording shown to a renter or host while a case is reviewed. Never accuses
 * anyone, and never claims an authority has been contacted.
 */
export const SAFETY_RESTRICTION_NOTICE =
  "The storage arrangement has been temporarily restricted while the reported item is reviewed.";

export const SAFETY_ITEM_NOTICE =
  "This item may not be permitted under EarnRoom's Storage Rules. Please review the item classification.";

export const SAFETY_DANGER_NOTICE =
  "Do not open, move or handle an item if you believe it may present an immediate danger. If there is an immediate threat to life or property, contact the appropriate emergency service.";
