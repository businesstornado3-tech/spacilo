/**
 * Founder "Needs attention" rules.
 *
 * Every condition below maps to an authoritative count returned by
 * `admin_dashboard_breakdowns`. Severity is fixed per condition — there are no
 * invented thresholds, no health scores, and informational states are never
 * dressed up as incidents.
 */

export type AlertSeverity = "critical" | "attention" | "informational";

export interface AttentionCondition {
  key: string;
  label: string;
  severity: AlertSeverity;
  /** What the founder would do about it. */
  hint: string;
  value: number;
}

const RULES: Array<Omit<AttentionCondition, "value">> = [
  {
    key: "open_disputes",
    label: "Open payment disputes",
    severity: "critical",
    hint: "Each dispute has a card-scheme deadline.",
  },
  {
    key: "failed_payments",
    label: "Failed payments (last 30 days)",
    severity: "critical",
    hint: "A renter tried to pay and could not.",
  },
  {
    key: "refunds_pending",
    label: "Refunds awaiting completion",
    severity: "attention",
    hint: "Money owed back to a renter has not settled.",
  },
  {
    key: "open_support_cases",
    label: "Open support cases",
    severity: "attention",
    hint: "A renter or host is waiting on Spacilo.",
  },
  {
    key: "reported_reviews",
    label: "Reported reviews awaiting moderation",
    severity: "attention",
    hint: "Reported content stays visible until reviewed.",
  },
  {
    key: "expiring_requests",
    label: "Storage requests expiring within 24 hours",
    severity: "attention",
    hint: "Unanswered requests lapse and demand is lost.",
  },
  {
    key: "draft_spaces",
    label: "Draft spaces never published",
    severity: "informational",
    hint: "Supply that hosts started but did not finish.",
  },
];

const ORDER: Record<AlertSeverity, number> = { critical: 0, attention: 1, informational: 2 };

export function buildAttention(counts: Record<string, number> | null | undefined): AttentionCondition[] {
  return RULES.map((rule) => {
    const raw = counts?.[rule.key];
    return { ...rule, value: typeof raw === "number" && Number.isFinite(raw) ? raw : 0 };
  })
    .filter((c) => c.value > 0)
    .sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || b.value - a.value);
}

/** Nothing actionable — the console shows a calm all-clear rather than filler. */
export function isAllClear(conditions: AttentionCondition[]): boolean {
  return conditions.length === 0;
}

/** Highest severity present, used to decide whether to surface a banner. */
export function topSeverity(conditions: AttentionCondition[]): AlertSeverity | null {
  if (conditions.length === 0) return null;
  return conditions.reduce<AlertSeverity>(
    (worst, c) => (ORDER[c.severity] < ORDER[worst] ? c.severity : worst),
    "informational",
  );
}

export const SEVERITY_LABEL: Record<AlertSeverity, string> = {
  critical: "Critical",
  attention: "Needs attention",
  informational: "Informational",
};
