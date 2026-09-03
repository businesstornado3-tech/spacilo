/**
 * Phase 11 — autonomous opportunity, campaign and growth engine: contracts.
 *
 * Every stage of the lifecycle speaks these shapes. They are deliberately
 * open (`(string & {})` unions) so the engine can record a problem, audience
 * or solution that does not exist in the product today rather than discarding
 * it. Nothing here imports a vendor SDK or a database client.
 */
import type { CapabilityId } from "@/lib/discovery/capabilities";
import type { IntentReading } from "@/lib/discovery/intent";
import type { AudienceSegment, ProblemConcept, UserRole } from "@/lib/discovery/taxonomy";

type Open<T extends string> = T | (string & {});

/* ------------------------------------------------------------------ sources */

export type ConnectorKind = Open<
  | "first_party"
  | "authorised_api"
  | "partner_feed"
  | "licensed_data"
  | "rss"
  | "user_supplied"
  | "search_trend"
  | "marketplace"
  | "social"
>;

/** What a connector is permitted to do. The engine never exceeds this. */
export type ConnectorCapabilityLevel =
  | "DISCOVER_ONLY"
  | "DISCOVER_AND_ANALYSE"
  | "DISCOVER_ANALYSE_AND_CAMPAIGN"
  | "BLOCKED";

export type ConnectorPermissions = {
  read: boolean;
  search: boolean;
  message: boolean;
  campaign: boolean;
  /** Terms/policy position, recorded honestly rather than assumed. */
  termsStatus: Open<"authorised" | "not_authorised" | "unknown" | "pending_review">;
};

export type ConnectorState = {
  id: string;
  name: string;
  kind: ConnectorKind;
  enabled: boolean;
  /** Per-connector feature flag, independent of the global switches. */
  flag: string;
  connected: boolean;
  permissions: ConnectorPermissions;
  level: ConnectorCapabilityLevel;
  lastSyncAt: number | null;
  lastError: string | null;
  rateLimit: { perHour: number; usedThisHour: number };
  /** Days a raw source signal may be retained. */
  retentionDays: number;
  notes: string;
};

/** A single raw observation from a source. Personal data is not required. */
export type SourceSignal = {
  /** Stable, source-scoped reference; drives deduplication. */
  id: string;
  connectorId: string;
  /** The words the person actually used, or a behavioural description. */
  text: string;
  observedAt: number;
  /** Non-identifying source reference (url, event name, query id). */
  reference?: string;
  /** Optional contactable handle, only where the source legitimately gives one. */
  contact?: { channel: ChannelId; address: string; consent: ConsentState } | null;
  /** Repeat count for aggregated first-party signals. */
  occurrences?: number;
  metadata?: Readonly<Record<string, string | number | boolean>>;
};

/* ----------------------------------------------------- understanding layer */

export type Urgency = Open<"immediate" | "weeks" | "months" | "unknown">;

export type GrowthRole = Open<
  "RENTER" | "HOST" | "BUSINESS" | "STUDENT" | "MOVING_TRANSITION" | "PROPERTY_RELATED" | "UNKNOWN"
>;

export type EvidenceItem = {
  /** The literal phrase or event that supports the reading. */
  quote: string;
  field: string;
};

/**
 * What the engine believes about the person's situation. Every populated
 * field must be traceable to `evidence`; unsupported fields stay null.
 */
export type Situation = {
  summary: string;
  achieving: string | null;
  problem: string | null;
  cause: string | null;
  need: string | null;
  likelyNext: string | null;
  urgency: Urgency;
  belongings: readonly string[];
  spaces: readonly string[];
  temporary: boolean | null;
  residentialOrBusiness: Open<"residential" | "business" | "unknown">;
  location: { label: string | null; slug: string | null; kind: string };
  confidence: number;
  evidence: readonly EvidenceItem[];
  /** The deterministic reading the semantic layer was built from. */
  reading: IntentReading;
};

export type PainPoint = {
  id: Open<ProblemConcept | "emergent">;
  label: string;
  /** The underlying problem, not the visible request. */
  description: string;
  confidence: number;
  evidence: readonly EvidenceItem[];
  /** True when no known pattern matched and this was inferred openly. */
  emergent: boolean;
};

export type AudienceReading = {
  /** Multiple simultaneous dimensions are normal. */
  roles: readonly GrowthRole[];
  primary: GrowthRole;
  segment: AudienceSegment;
  discoveryRole: UserRole;
  confidence: number;
  evidence: readonly EvidenceItem[];
};

/* ------------------------------------------------------------ fit + supply */

export type FitVerdict = "BEST_EXISTING_SOLUTION" | "BEST_COMBINATION" | "NEW_OPPORTUNITY" | "NOT_A_FIT";

export type FitResult = {
  verdict: FitVerdict;
  capabilities: readonly CapabilityId[];
  /** Where the person should be sent, using existing routes only. */
  destination: { label: string; to: string } | null;
  reasons: readonly string[];
  confidence: number;
  /** Set when the verdict is NEW_OPPORTUNITY. */
  unmetNeed?: string;
};

export type SupplyLevel = "LEVEL_1_NO_SUPPLY" | "LEVEL_2_SOME_SUPPLY" | "LEVEL_3_STRONG_SUPPLY";

export type SupplyContext = {
  level: SupplyLevel;
  publishedSpaces: number;
  /** Marketing continues at every level; only the call to action changes. */
  ctaMode: Open<"capture_demand" | "surface_matches" | "book_now" | "host_acquisition">;
  /** True when the message may reference available spaces. */
  mayClaimAvailability: boolean;
  reasons: readonly string[];
};

/* ---------------------------------------------------------------- scoring */

export type GrowthScores = {
  /** 0..100 headline relevance. */
  opportunity: number;
  campaignEligibility: number;
  conversionLikelihood: number;
  sourceConfidence: number;
  intentConfidence: number;
  band: Open<"low" | "possible" | "strong" | "high">;
  factors: readonly { name: string; value: number; weight: number; note: string }[];
};

/* --------------------------------------------------------------- campaign */

export type CampaignDecisionValue =
  | "CAMPAIGN_NOW"
  | "CAMPAIGN_LATER"
  | "CAPTURE_ONLY"
  | "RETAIN_FOR_INSIGHT"
  | "DO_NOT_CAMPAIGN";

export type CampaignDecision = {
  value: CampaignDecisionValue;
  reasons: readonly string[];
  /** Epoch ms; set for CAMPAIGN_LATER. */
  scheduledFor?: number;
};

export type ChannelId = Open<
  | "earnroom_internal"
  | "email"
  | "sms"
  | "push"
  | "partner"
  | "platform_message"
>;

export type ConsentState = Open<"granted" | "legitimate_interest" | "none" | "withdrawn" | "unknown">;

export type ChannelState = {
  id: ChannelId;
  label: string;
  enabled: boolean;
  requiresConsent: boolean;
  acceptsLegitimateInterest: boolean;
  perRecipientPerDay: number;
  cooldownHours: number;
  /** Identity/source disclosure the channel demands in every message. */
  requiresSenderIdentity: boolean;
  /**
   * "none" = no adapter at all, "mock" = execution path only (contacts nobody),
   * "live" = a genuinely transmitting, authorised adapter.
   */
  deliveryMode: Open<"none" | "mock" | "live">;
  credentialState: Open<"missing" | "configured" | "verified" | "not_required">;
  /** Terms and lawful-basis position for outbound on this channel. */
  termsStatus: Open<"authorised" | "not_authorised" | "pending_review" | "unknown">;
};

export type PolicyCheck = { id: string; passed: boolean; detail: string };

export type PolicyVerdict = "ALLOW" | "BLOCK" | "DEFER" | "ESCALATE";

export type PolicyDecision = {
  verdict: PolicyVerdict;
  checks: readonly PolicyCheck[];
  reasons: readonly string[];
  /** True when a human must configure something; never a per-lead approval. */
  requiresConfiguration: boolean;
};

export type CampaignMessage = {
  subject: string | null;
  body: string;
  cta: { label: string; to: string } | null;
  /** Every claim the message makes, with the evidence behind it. */
  claims: readonly { claim: string; evidence: string }[];
  style: Open<"transition" | "host_acquisition" | "business" | "student" | "capture" | "neutral">;
  tone: "plain";
};

export type CampaignState =
  | "DISCOVERED"
  | "QUALIFIED"
  | "READY"
  | "BLOCKED"
  | "QUEUED"
  | "SENT"
  | "DELIVERED"
  | "CLICKED"
  | "RESPONDED"
  | "REGISTERED"
  | "REQUESTED"
  | "LISTED"
  | "BOOKED"
  | "CONVERTED"
  | "NO_RESPONSE"
  | "EXPIRED";

export type Campaign = {
  id: string;
  opportunityKey: string;
  /** Deterministic; a retry can never produce a second send. */
  idempotencyKey: string;
  /** Hashed recipient reference only; raw addresses never enter a campaign. */
  recipientIdentityHash: string | null;
  channel: ChannelId | null;
  message: CampaignMessage | null;
  state: CampaignState;
  decision: CampaignDecision;
  policy: PolicyDecision;
  createdAt: number;
  sentAt: number | null;
  expiresAt: number | null;
};

/* ------------------------------------------------------------ opportunity */

export type OpportunityStatus =
  | "NEW"
  | "OBSERVING"
  | "VALIDATED"
  | "ACTIONABLE"
  | "IN_PRODUCT"
  | "IN_CAMPAIGN"
  | "RESOLVED"
  | "REJECTED";

/** The single record the whole lifecycle revolves around. */
export type GrowthOpportunity = {
  /** Stable key: repeats of the same underlying need collapse onto it. */
  key: string;
  signalId: string;
  connectorId: string;
  situation: Situation;
  painPoints: readonly PainPoint[];
  audience: AudienceReading;
  fit: FitResult;
  supply: SupplyContext;
  scores: GrowthScores;
  decision: CampaignDecision;
  status: OpportunityStatus;
  firstSeen: number;
  latestSeen: number;
  frequency: number;
  evidence: readonly EvidenceItem[];
  /**
   * Deep, multi-dimensional reading of the same opportunity. Additive: every
   * existing consumer of this record keeps working without it.
   */
  intelligence?: import("./intelligence").DeepIntelligence;
};

export type InsightKind = "PRODUCT" | "CONTENT" | "MARKETPLACE" | "HOST_SUPPLY" | "RENTER_DEMAND";

/** A recommendation for humans. Nothing here is ever auto-published. */
export type GrowthInsight = {
  id: string;
  kind: InsightKind;
  title: string;
  problem: string;
  audience: GrowthRole;
  geography: string | null;
  evidenceCount: number;
  supportingKeys: readonly string[];
  recommendation: string;
  components: readonly string[];
  confidence: number;
  status: OpportunityStatus;
};

/* ---------------------------------------------------- learning + auditing */

export type GrowthLearningSignal = {
  opportunityKey: string;
  channel: ChannelId | null;
  outcome: Open<"sent" | "clicked" | "responded" | "registered" | "converted" | "no_response" | "blocked">;
  valuePence?: number;
  at: number;
};

export type AuditAction = Open<
  | "signal_ingested"
  | "signal_deduplicated"
  | "classified"
  | "opportunity_created"
  | "score_changed"
  | "recommendation"
  | "policy_evaluated"
  | "campaign_generated"
  | "campaign_sent"
  | "action_blocked"
  | "response_recorded"
  | "conversion_recorded"
  | "system_override"
  | "connector_state_change"
  | "error"
>;

export type AuditEvent = {
  id: string;
  at: number;
  actor: Open<"system" | "founder">;
  action: AuditAction;
  reason: string;
  source: string;
  referenceId: string;
  detail?: Readonly<Record<string, string | number | boolean | null>>;
};

/** The complete traceable result of running one signal through the engine. */
export type PipelineResult = {
  signal: SourceSignal;
  opportunity: GrowthOpportunity | null;
  campaign: Campaign | null;
  insights: readonly GrowthInsight[];
  audit: readonly AuditEvent[];
  /** Set when the signal was dropped before understanding (dedupe, cheap filter). */
  dropped: { stage: string; reason: string } | null;
  /** Which cost tiers actually ran. */
  tiers: readonly number[];
};
