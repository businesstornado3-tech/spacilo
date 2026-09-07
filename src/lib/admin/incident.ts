/**
 * Founder safety incident dossier — pure shaping of `admin_safety_incident()`.
 *
 * There is no second incident system here: the dossier is a read-only join of
 * the existing support case, booking, storage request, space, agreement,
 * inventory, policy, evidence, control and audit records.
 *
 * The four strands of knowledge about an item are kept strictly apart:
 *   A. AI / advisory detection (a prompt for a human check, never a finding)
 *   B. the renter's own declaration
 *   C. the deterministic EarnRoom policy classification
 *   D. the human safety review
 */
import type { SafetyScope, SafetySeverity, SafetySource } from "@/lib/admin/safety";

/* ------------------------------------------------------------------- types */

export interface IncidentCase {
  id: string;
  reference: string;
  category: string;
  stage: string;
  status: string;
  summary: string;
  description: string | null;
  opened_by_user_id: string | null;
  opened_by_role: string | null;
  assigned_to_user_id: string | null;
  severity: SafetySeverity | null;
  source: SafetySource | null;
  severity_note: string | null;
  safety_flagged_at: string | null;
  resolution_code: string | null;
  resolution_summary: string | null;
  financially_resolved: boolean | null;
  refund_total_pence: number | null;
  created_at: string;
  last_activity_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
}

export interface IncidentPerson {
  user_id: string | null;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  phone_verified: boolean | null;
  member_since: string | null;
}

export interface IncidentRenter extends IncidentPerson {
  policy_acceptances: {
    id: string;
    policy_version_id: string | null;
    role: string | null;
    context: string | null;
    accepted_at: string;
  }[];
  declaration: Record<string, unknown> | null;
}

export interface IncidentHost extends IncidentPerson {
  suitability: {
    space_id: string;
    attributes: Record<string, unknown> | null;
    host_notes: string | null;
    declaration_authority: boolean | null;
    declaration_compliance: boolean | null;
    declaration_accuracy: boolean | null;
    declared_at: string | null;
    declared_policy_version_id: string | null;
  } | null;
  suitability_snapshot: Record<string, unknown> | null;
}

export interface IncidentSpace {
  id: string;
  title: string | null;
  space_type: string | null;
  listing_status: string | null;
  storage_mode: string | null;
  address_line1: string | null;
  address_line2: string | null;
  town: string | null;
  postcode: string | null;
  postcode_district: string | null;
  approximate_area: string | null;
  latitude: number | null;
  longitude: number | null;
  access_type: string | null;
  access_notes: string | null;
  accepted_categories: string[] | null;
  host_restrictions: string[] | null;
  restriction_notes: string | null;
}

export interface IncidentBooking {
  id: string;
  request_id: string | null;
  space_id: string | null;
  status: string;
  space_title: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  paid_at: string | null;
  confirmed_at: string | null;
  activated_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  renter_handover_confirmed_at: string | null;
  host_handover_confirmed_at: string | null;
  renter_collection_confirmed_at: string | null;
  host_collection_confirmed_at: string | null;
  items_finalised: boolean;
  storage_started: boolean;
}

export interface IncidentRequest {
  id: string;
  status: string;
  inventory_id: string | null;
  requested_start_date: string | null;
  requested_end_date: string | null;
  renter_note: string | null;
  created_at: string;
  responded_at: string | null;
  item_count: number | null;
}

export interface IncidentAgreement {
  id: string;
  status: string;
  agreement_version: string | null;
  agreement_version_id: string | null;
  renter_accepted_at: string | null;
  host_accepted_at: string | null;
  activated_at: string | null;
  superseded_at: string | null;
  cancelled_at: string | null;
  acceptances: {
    party: "renter" | "host";
    user_id: string | null;
    accepted_at: string;
    agreement_version: string | null;
    agreement_version_id: string | null;
  }[];
}

export interface IncidentItem {
  id: string;
  item_name: string;
  category: string | null;
  quantity: number | null;
  notes: string | null;
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
  estimated_total_volume_m3: number | null;
  fragile: boolean | null;
  size_source: string | null;
  confidence_score: number | null;
  created_manually: boolean | null;
  ai_detected: boolean | null;
  ai_confirmed: boolean | null;
  hazard_signals: unknown;
  policy_category: string | null;
  policy_provenance: string | null;
  policy_confirmed_at: string | null;
  policy_note: string | null;
  created_at: string;
  updated_at: string | null;
  photo_path: string | null;
  photo_analysed_at: string | null;
}

export interface IncidentPolicyRule {
  id: string;
  rule_key: string;
  category: string;
  subcategory: string | null;
  decision: string;
  severity: string | null;
  requires_user_confirmation: boolean | null;
  requires_staff_review: boolean | null;
  internal_reason_code: string | null;
  renter_message: string | null;
}

export interface IncidentPolicy {
  policy_version: string | null;
  policy_version_id: string | null;
  screening: Record<string, unknown> | null;
  compatibility: Record<string, unknown> | null;
  request_policy_version: string | null;
  request_screening: Record<string, unknown> | null;
  rules: IncidentPolicyRule[];
}

export interface IncidentEvidence {
  case_photos: {
    id: string;
    storage_path: string;
    mime_type: string | null;
    file_size: number | null;
    caption: string | null;
    uploaded_by_user_id: string | null;
    uploaded_by_role: string | null;
    created_at: string;
  }[];
  handover_photos: {
    id: string;
    stage: string;
    storage_path: string;
    caption: string | null;
    uploader_role: string | null;
    created_at: string;
  }[];
  condition_notes: {
    id: string;
    stage: string;
    author_role: string | null;
    body: string;
    created_at: string;
  }[];
  handover_issues: {
    id: string;
    stage: string;
    category: string;
    reporter_role: string | null;
    description: string | null;
    status: string | null;
    created_at: string;
  }[];
}

export interface IncidentControl {
  id: string;
  scope: SafetyScope;
  subject_id: string;
  state: "active" | "safety_review" | "suspended";
  reason: string;
  source: SafetySource;
  case_id: string | null;
  created_by: string | null;
  created_at: string;
  lifted_at: string | null;
  lifted_by: string | null;
  lift_reason: string | null;
}

export interface IncidentPaymentHold {
  id: string;
  status: string;
  host_entitlement_pence: number | null;
  currency: string | null;
  hold_dispute: boolean | null;
  hold_refund: boolean | null;
  hold_review: boolean | null;
  blocked_reason: string | null;
  period_label: string | null;
  created_at: string;
}

export interface IncidentEvent {
  id: string;
  event_type: string;
  visibility: string;
  actor_user_id: string | null;
  actor_role: string | null;
  public_message: string | null;
  internal_note: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface IncidentAuditEvent {
  id: string;
  event_type: string;
  subject_type: string | null;
  subject_id: string | null;
  actor_id: string | null;
  detail: Record<string, unknown> | null;
  created_at: string;
}

export interface IncidentDossier {
  generated_at: string;
  case: IncidentCase;
  renter: IncidentRenter | null;
  host: IncidentHost | null;
  space: IncidentSpace | null;
  booking: IncidentBooking | null;
  request: IncidentRequest | null;
  agreement: IncidentAgreement | null;
  items: IncidentItem[];
  policy: IncidentPolicy;
  evidence: IncidentEvidence;
  controls: IncidentControl[];
  payment_holds: IncidentPaymentHold[];
  events: IncidentEvent[];
  audit: IncidentAuditEvent[];
}

/* -------------------------------------------------------------- severity */

export const PROMINENT_SEVERITIES: SafetySeverity[] = ["critical", "high"];

export const isProminent = (severity: SafetySeverity | null): boolean =>
  severity !== null && PROMINENT_SEVERITIES.includes(severity);

export function severityHeadline(severity: SafetySeverity | null): string {
  switch (severity) {
    case "critical":
      return "CRITICAL SAFETY INCIDENT";
    case "high":
      return "HIGH SAFETY INCIDENT";
    case "medium":
      return "Medium safety case";
    case "low":
      return "Low safety case";
    default:
      return "Safety case — severity not set";
  }
}

/** Severity moves staff may make. Both directions are allowed and audited. */
export const SEVERITY_TRANSITIONS: Record<SafetySeverity, SafetySeverity[]> = {
  low: ["medium", "high", "critical"],
  medium: ["low", "high", "critical"],
  high: ["low", "medium", "critical"],
  critical: ["low", "medium", "high"],
};

export function allowedSeverityChanges(current: SafetySeverity | null): SafetySeverity[] {
  if (!current) return ["low", "medium", "high", "critical"];
  return SEVERITY_TRANSITIONS[current];
}

/* ------------------------------------------------------------------ items */

export const HAZARD_LABEL: Record<string, string> = {
  check_fuel: "Fuel may be present — human check needed",
  check_battery: "Battery may be present — human check needed",
  check_liquids: "Liquids may be present — human check needed",
  check_perishable: "Perishable contents — human check needed",
  needs_human_review: "Flagged for a human check",
};

/** Reads whatever shape the advisory hazard field holds, defensively. */
export function hazardFlags(signals: unknown): string[] {
  if (!signals) return [];
  if (Array.isArray(signals)) return signals.filter((v): v is string => typeof v === "string");
  if (typeof signals === "string") return signals === "none" ? [] : [signals];
  if (typeof signals === "object") {
    const record = signals as Record<string, unknown>;
    const flags = record["flags"];
    if (Array.isArray(flags)) return flags.filter((v): v is string => typeof v === "string");
    const hazard = record["hazard"];
    if (typeof hazard === "string" && hazard !== "none") return [hazard];
    return Object.keys(record).filter((key) => record[key] === true);
  }
  return [];
}

export function hazardNote(signals: unknown): string | null {
  if (signals && typeof signals === "object" && !Array.isArray(signals)) {
    const note = (signals as Record<string, unknown>)["note"];
    if (typeof note === "string" && note.trim()) return note.trim();
  }
  return null;
}

export const hazardLabel = (flag: string): string =>
  HAZARD_LABEL[flag] ?? `Flagged for a human check (${flag.replace(/_/g, " ")})`;

/**
 * Advisory wording. An AI or scanner signal is never presented as proof that
 * an item is illegal or that a person did anything wrong.
 */
export function advisoryWording(flags: string[], severity: SafetySeverity | null): string | null {
  if (flags.length === 0) return null;
  const level = severity ? severity.toUpperCase() : "UNRATED";
  return `Potential prohibited or hazardous item identified — ${level} severity — human review required.`;
}

export const AI_NOT_PROOF_NOTICE =
  "Advisory detection is a prompt for a human check, not a finding. It is never proof that an item is illegal and never establishes that anyone committed an offence.";

export const NO_AUTHORITY_NOTICE =
  "EarnRoom does not report cases to any authority automatically. Any external escalation stays with the legal and compliance process outside this console.";

export const POLICY_SOURCE_NOTICE =
  "Only the deterministic EarnRoom policy classification, against the published Storage Rules, decides whether an item is prohibited or restricted.";

export type ItemStrand = "advisory" | "declared" | "policy" | "review";

export interface ItemReading {
  /** B — what the renter said the item is. */
  declared: string;
  /** A — advisory hazard prompts from the scanner, if any. */
  advisory: string[];
  advisoryWording: string | null;
  /** C — deterministic policy classification. */
  policyCategory: string | null;
  policyProvenance: string | null;
  policyConfirmedAt: string | null;
  /** D — human note recorded on the item. */
  humanNote: string | null;
  aiDetected: boolean;
  renterConfirmed: boolean;
}

export function readItem(item: IncidentItem, severity: SafetySeverity | null): ItemReading {
  const advisory = hazardFlags(item.hazard_signals);
  return {
    declared: item.item_name,
    advisory,
    advisoryWording: advisoryWording(advisory, severity),
    policyCategory: item.policy_category,
    policyProvenance: item.policy_provenance,
    policyConfirmedAt: item.policy_confirmed_at,
    humanNote: item.policy_note ?? hazardNote(item.hazard_signals),
    aiDetected: item.ai_detected === true,
    renterConfirmed: item.ai_confirmed === true || item.policy_confirmed_at !== null,
  };
}

/** Items worth reading first: an advisory flag, or a policy category recorded. */
export function relevantItems(items: IncidentItem[]): IncidentItem[] {
  const scored = (item: IncidentItem) =>
    (hazardFlags(item.hazard_signals).length > 0 ? 2 : 0) + (item.policy_category ? 1 : 0);
  return [...items].sort((a, b) => scored(b) - scored(a));
}

/* ----------------------------------------------------------------- policy */

export interface PolicyOutcome {
  prohibited: boolean;
  restricted: boolean;
  needsIdentification: boolean;
  decisions: string[];
}

export function policyOutcome(policy: IncidentPolicy): PolicyOutcome {
  const decisions = policy.rules.map((rule) => rule.decision);
  return {
    prohibited: decisions.includes("prohibited"),
    restricted: decisions.includes("restricted"),
    needsIdentification:
      decisions.includes("needs_identification") || decisions.includes("needs_review"),
    decisions,
  };
}

export function policyResultLabel(policy: IncidentPolicy): string {
  const outcome = policyOutcome(policy);
  if (outcome.prohibited) return "Prohibited under the published Storage Rules";
  if (outcome.restricted) return "Restricted under the published Storage Rules";
  if (outcome.needsIdentification) return "Identification required before storage";
  if (policy.rules.length > 0) return "Allowed under the published Storage Rules";
  return "No policy rule recorded for the declared items";
}

/* -------------------------------------------------------------- agreement */

export function agreementSummary(agreement: IncidentAgreement | null): {
  status: string;
  version: string;
  renterAccepted: boolean;
  hostAccepted: boolean;
  active: boolean;
  reacceptanceRequired: boolean;
  ended: boolean;
} {
  if (!agreement) {
    return {
      status: "No agreement record",
      version: "—",
      renterAccepted: false,
      hostAccepted: false,
      active: false,
      reacceptanceRequired: false,
      ended: false,
    };
  }
  return {
    status: agreement.status,
    version: agreement.agreement_version ?? "—",
    renterAccepted: agreement.renter_accepted_at !== null,
    hostAccepted: agreement.host_accepted_at !== null,
    active: agreement.status === "active",
    reacceptanceRequired: agreement.status === "requires_reacceptance",
    ended: agreement.status === "superseded" || agreement.status === "cancelled",
  };
}

/* --------------------------------------------------------- booking states */

/**
 * Handover and storage state read from the authoritative timestamps, never
 * inferred from the booking status alone.
 */
export function handoverState(booking: IncidentBooking | null): {
  itemsFinalised: boolean;
  renterConfirmedAt: string | null;
  hostConfirmedAt: string | null;
  storageStarted: boolean;
  collectionComplete: boolean;
  label: string;
} {
  if (!booking) {
    return {
      itemsFinalised: false,
      renterConfirmedAt: null,
      hostConfirmedAt: null,
      storageStarted: false,
      collectionComplete: false,
      label: "No booking linked",
    };
  }
  const renterConfirmedAt = booking.renter_handover_confirmed_at;
  const hostConfirmedAt = booking.host_handover_confirmed_at;
  const itemsFinalised = renterConfirmedAt !== null && hostConfirmedAt !== null;
  const storageStarted = booking.activated_at !== null;
  const collectionComplete =
    booking.renter_collection_confirmed_at !== null &&
    booking.host_collection_confirmed_at !== null;

  let label = "Items not yet finalised in the space";
  if (collectionComplete) label = "Items collected — both parties confirmed";
  else if (storageStarted) label = "Storage under way — items finalised in the space";
  else if (itemsFinalised) label = "Both parties confirmed handover";
  else if (renterConfirmedAt) label = "Renter confirmed handover; waiting on the host";
  else if (hostConfirmedAt) label = "Host confirmed handover; waiting on the renter";

  return {
    itemsFinalised,
    renterConfirmedAt,
    hostConfirmedAt,
    storageStarted,
    collectionComplete,
    label,
  };
}

/* -------------------------------------------------------------- location */

/** Full address, for authorised safety staff only. */
export function addressLines(space: IncidentSpace | null): string[] {
  if (!space) return [];
  return [
    space.address_line1,
    space.address_line2,
    space.town,
    space.postcode,
  ].filter((line): line is string => Boolean(line && line.trim()));
}

/* -------------------------------------------------------------- controls */

export const CONTROL_STATE_LABEL: Record<IncidentControl["state"], string> = {
  active: "Active",
  safety_review: "Under safety review",
  suspended: "Suspended",
};

export const activeControls = (controls: IncidentControl[]): IncidentControl[] =>
  controls.filter((row) => row.lifted_at === null);

export const heldPayments = (holds: IncidentPaymentHold[]): IncidentPaymentHold[] =>
  holds.filter((row) => row.hold_dispute === true || row.hold_refund === true || row.hold_review === true);

/** One line for the summary header. Never claims an action that was not taken. */
export function safetyActionLine(
  controls: IncidentControl[],
  holds: IncidentPaymentHold[],
): string {
  const live = activeControls(controls);
  const held = heldPayments(holds);
  if (live.length === 0 && held.length === 0) return "No safety control applied";
  const parts = live.map((row) => `${row.scope} ${CONTROL_STATE_LABEL[row.state].toLowerCase()}`);
  if (held.length > 0) parts.push("host earnings on hold");
  return parts.join(" · ");
}

export function personName(person: IncidentPerson | null): string {
  if (!person) return "Unknown";
  const name =
    person.display_name ??
    [person.first_name, person.last_name].filter(Boolean).join(" ").trim();
  return name && name.length > 0 ? name : "Name not set";
}

/** New/unread indicator: nothing recorded on the case since it was flagged. */
export function isNewlyFlagged(row: {
  severity: SafetySeverity | null;
  safety_flagged_at?: string | null;
  last_activity_at?: string | null;
}): boolean {
  if (!isProminent(row.severity)) return false;
  if (!row.safety_flagged_at) return false;
  if (!row.last_activity_at) return true;
  return new Date(row.last_activity_at).getTime() <= new Date(row.safety_flagged_at).getTime();
}
