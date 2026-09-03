/**
 * Phase 11 — deterministic opportunity radar.
 *
 * This layer accepts only already-sanitised first-party observations. It never
 * contacts a person, publishes a page, changes a product journey or invents
 * supply. AI can be introduced behind the same contracts later; the current
 * radar remains explainable and bounded.
 */
import { resolveDiscovery, type DiscoveryResolution } from "@/lib/discovery/resolve";
import { locationLabel } from "@/lib/discovery/locations";
import type { IntentReading } from "@/lib/discovery/intent";
import type { UserRole } from "@/lib/discovery/taxonomy";
import { growthConfig, scoreBand } from "./config";
import { getConnector } from "./connectors";
import type {
  AudienceReading,
  AuditEvent,
  CampaignDecision,
  FitResult,
  GrowthInsight,
  GrowthOpportunity,
  GrowthRole,
  PainPoint,
  PipelineResult,
  Situation,
  SourceSignal,
  SupplyContext,
} from "./types";

export type GrowthAnalyticsRow = {
  id: number;
  event_name: string;
  path: string | null;
  props: unknown;
  occurred_at: string;
  environment: string;
  is_bot: boolean;
};

const EVENT_TEXT: Record<string, string> = {
  discovery_started: "find the right storage or space solution",
  discovery_resolved: "find a storage or space solution",
  discovery_location_viewed: "find storage in a location",
  capability_viewed: "understand which tool can help",
  storage_search_started: "find storage near me",
  search_refined: "compare storage options",
  search_result_selected: "choose a storage space",
  listing_viewed: "find a place to store belongings",
  enquiry_started: "ask about storing belongings",
  enquiry_sent: "ask a host about storage",
  storage_request_started: "request storage",
  storage_request_created: "arrange storage for belongings",
  host_listing_started: "list unused space for storage",
  host_listing_published: "earn from unused space",
  spacefit_stuff_started: "work out what belongings need storing",
  spacefit_stuff_completed: "estimate belongings storage needs",
  spacefit_space_started: "measure space available for storage",
  spacefit_space_completed: "estimate usable storage space",
  planner_started: "plan how belongings fit in a space",
  planner_completed: "plan how belongings fit in a space",
  spaceplanner_started: "plan how belongings fit in a space",
  spaceplanner_completed: "plan how belongings fit in a space",
  spaceplanner_listing_match_generated: "find storage that fits belongings",
  spaceplanner_booking_started: "book storage that fits belongings",
  signup_started: "get help with storage or unused space",
};

const RADAR_EVENTS = new Set(Object.keys(EVENT_TEXT));

function scalarProps(value: unknown): Record<string, string | number | boolean> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string | number | boolean> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (/address|postcode|email|phone|name|message|body|note|photo|image|query|search/i.test(key)) continue;
    if (typeof raw === "string" && raw.length <= 64 && raw.trim()) out[key] = raw.trim();
    else if (typeof raw === "number" && Number.isFinite(raw)) out[key] = raw;
    else if (typeof raw === "boolean") out[key] = raw;
  }
  return out;
}

/** Converts stored first-party events into non-identifying radar observations. */
export function analyticsRowToSignal(row: GrowthAnalyticsRow): SourceSignal | null {
  if (row.environment !== "production" || row.is_bot || !RADAR_EVENTS.has(row.event_name)) return null;
  const text = EVENT_TEXT[row.event_name];
  if (!text) return null;
  return {
    id: `analytics:${row.id}`,
    connectorId: "first_party",
    text,
    observedAt: Date.parse(row.occurred_at),
    reference: row.path ?? row.event_name,
    contact: null,
    occurrences: 1,
    metadata: { event: row.event_name, path: row.path ?? "/", ...scalarProps(row.props) },
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function hashKey(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `opp_${(hash >>> 0).toString(16)}`;
}

function growthRole(role: UserRole, reading: IntentReading): GrowthRole {
  if (reading.segment === "business") return "BUSINESS";
  if (reading.segment === "student") return "STUDENT";
  if (role === "host" || role === "prospective_host") return "HOST";
  if (reading.timeframe === "moving_period" || reading.objectives.some((item) => item.value === "move")) {
    return "MOVING_TRANSITION";
  }
  if (role === "renter") return "RENTER";
  return "UNKNOWN";
}

function evidence(reading: IntentReading): Array<{ quote: string; field: string }> {
  const items: Array<{ quote: string; field: string }> = [];
  const objective = reading.objectives[0];
  if (objective) items.push({ quote: objective.evidence, field: "objective" });
  const problem = reading.problems[0];
  if (problem) items.push({ quote: problem.evidence, field: "problem" });
  const belonging = reading.belongings[0];
  if (belonging) items.push({ quote: belonging.evidence, field: "belongings" });
  const space = reading.spaces[0];
  if (space) items.push({ quote: space.evidence, field: "space" });
  if (reading.location.kind !== "none") items.push({ quote: "location signal", field: "location" });
  return items;
}

function situation(reading: IntentReading, items: ReturnType<typeof evidence>): Situation {
  const role = growthRole(reading.role, reading);
  const problem = reading.problems[0]?.value ?? null;
  return {
    summary: `${role.toLowerCase()} need: ${problem ?? reading.objectives[0]?.value ?? "storage or space help"}`,
    achieving: reading.objectives[0]?.value ?? null,
    problem,
    cause: null,
    need: reading.objectives[0]?.value ?? null,
    likelyNext: reading.stage,
    urgency: reading.timeframe === "short_term" || reading.timeframe === "moving_period" ? "weeks" : "unknown",
    belongings: reading.belongings.map((item) => item.value),
    spaces: reading.spaces.map((item) => item.value),
    temporary: reading.timeframe === "temporary" || reading.timeframe === "moving_period",
    residentialOrBusiness: reading.segment === "business" ? "business" : "residential",
    location: {
      label: locationLabel(reading.location),
      slug: reading.location.kind === "place" ? reading.location.place.slug : null,
      kind: reading.location.kind,
    },
    confidence: reading.confidence,
    evidence: items,
    reading,
  };
}

function audience(reading: IntentReading, items: ReturnType<typeof evidence>): AudienceReading {
  const primary = growthRole(reading.role, reading);
  const roles = new Set<GrowthRole>([primary]);
  if (reading.timeframe === "moving_period") roles.add("MOVING_TRANSITION");
  if (reading.segment === "business") roles.add("BUSINESS");
  if (reading.segment === "student") roles.add("STUDENT");
  return {
    roles: [...roles],
    primary,
    segment: reading.segment,
    discoveryRole: reading.role,
    confidence: reading.confidence,
    evidence: items,
  };
}

function fit(resolution: DiscoveryResolution): FitResult {
  const capabilities = resolution.plan.primary
    ? [resolution.plan.primary.id, ...resolution.plan.secondary.map((item) => item.id)]
    : [];
  const existing = Boolean(resolution.destination && resolution.plan.primary && resolution.opportunity === null);
  const verdict = existing
    ? capabilities.length > 1
      ? "BEST_COMBINATION"
      : "BEST_EXISTING_SOLUTION"
    : capabilities.length > 0
      ? "NEW_OPPORTUNITY"
      : "NOT_A_FIT";
  return {
    verdict,
    capabilities,
    destination: resolution.destination
      ? { label: resolution.cluster?.title ?? "EarnRoom", to: resolution.destination }
      : null,
    reasons: resolution.explanation,
    confidence: resolution.reading.confidence,
    ...(verdict === "NEW_OPPORTUNITY" ? { unmetNeed: resolution.reading.problems[0]?.value ?? "emerging storage or space need" } : {}),
  };
}

function supply(reading: IntentReading): SupplyContext {
  const renter = reading.role === "renter";
  return {
    level: "LEVEL_1_NO_SUPPLY",
    publishedSpaces: 0,
    ctaMode: renter ? "capture_demand" : "host_acquisition",
    mayClaimAvailability: false,
    reasons: renter
      ? ["No live supply count was provided to this radar run.", "Availability is never claimed from an analytics event."]
      : ["Host and supply acquisition intent is not blocked by renter supply."],
  };
}

function scores(reading: IntentReading, resolution: DiscoveryResolution): GrowthOpportunity["scores"] {
  const sourceConfidence = 0.8;
  const intentConfidence = reading.confidence;
  const opportunity = Math.round(
    clamp01(intentConfidence) * 35 +
      clamp01(resolution.score.total / 100) * 45 +
      (resolution.opportunity ? 15 : 5) +
      (reading.segment === "business" || reading.segment === "student" ? 5 : 0),
  );
  const eligibility = Math.round(opportunity * clamp01(intentConfidence));
  const conversionLikelihood = Math.round(
    clamp01((resolution.destination ? 0.65 : 0.25) + (reading.stage === "transaction" ? 0.2 : 0)) * 100,
  );
  return {
    opportunity,
    campaignEligibility: eligibility,
    conversionLikelihood,
    sourceConfidence,
    intentConfidence,
    band: scoreBand(opportunity),
    factors: [
      { name: "first_party_source", value: sourceConfidence, weight: 20, note: "EarnRoom-owned behavioural event." },
      { name: "intent_confidence", value: intentConfidence, weight: 35, note: "Evidence available to the deterministic reader." },
      { name: "discovery_score", value: resolution.score.total / 100, weight: 45, note: "Existing capability and usefulness assessment." },
    ],
  };
}

function decision(reading: IntentReading, score: GrowthOpportunity["scores"]): CampaignDecision {
  const reasons = ["No contact handle is attached to first-party analytics.", "Outbound automation is disabled by default."];
  if (score.opportunity < growthConfig().thresholds.campaignFloor) {
    return { value: "RETAIN_FOR_INSIGHT", reasons: [...reasons, "Opportunity is below the campaign floor."] };
  }
  if (reading.unknown || score.intentConfidence < growthConfig().thresholds.confidenceFloor) {
    return { value: "CAPTURE_ONLY", reasons: [...reasons, "Intent confidence is not sufficient for outreach."] };
  }
  return { value: "CAPTURE_ONLY", reasons: [...reasons, "Keep the signal for an in-product or demand-capture journey."] };
}

function insights(opportunity: GrowthOpportunity): GrowthInsight[] {
  if (opportunity.fit.verdict !== "NEW_OPPORTUNITY") return [];
  const kind = opportunity.audience.primary === "HOST" ? "HOST_SUPPLY" : opportunity.audience.primary === "RENTER" ? "RENTER_DEMAND" : "PRODUCT";
  return [
    {
      id: `insight:${opportunity.key}`,
      kind,
      title: `Emerging need: ${opportunity.situation.problem ?? "storage or space help"}`,
      problem: opportunity.situation.summary,
      audience: opportunity.audience.primary,
      geography: opportunity.situation.location.label,
      evidenceCount: opportunity.frequency,
      supportingKeys: [opportunity.key],
      recommendation: "Review the need before creating product, content or marketplace supply.",
      components: opportunity.fit.capabilities,
      confidence: opportunity.scores.intentConfidence,
      status: opportunity.status,
    },
  ];
}

function audit(
  signal: SourceSignal,
  opportunity: GrowthOpportunity,
  action: AuditEvent["action"],
  reason: string,
  detail?: AuditEvent["detail"],
): AuditEvent {
  return {
    id: `${signal.id}:${action}`,
    at: signal.observedAt,
    actor: "system",
    action,
    reason,
    source: signal.connectorId,
    referenceId: opportunity.key,
    ...(detail ? { detail } : {}),
  };
}

export function buildGrowthPipeline(signal: SourceSignal, now = Date.now()): PipelineResult {
  const connector = getConnector(signal.connectorId);
  if (!connector || !connector.enabled || connector.level === "BLOCKED") {
    return {
      signal,
      opportunity: null,
      campaign: null,
      insights: [],
      audit: [{ id: `${signal.id}:blocked`, at: now, actor: "system", action: "action_blocked", reason: "Connector is not enabled for analysis.", source: signal.connectorId, referenceId: signal.id }],
      dropped: { stage: "connector", reason: "Connector is unavailable or blocked." },
      tiers: [],
    };
  }
  const resolution = resolveDiscovery(signal.text);
  const items = evidence(resolution.reading);
  if (resolution.reading.unknown) {
    return {
      signal,
      opportunity: null,
      campaign: null,
      insights: [],
      audit: [{ id: `${signal.id}:dropped`, at: now, actor: "system", action: "action_blocked", reason: "The observation carried no usable intent evidence.", source: signal.connectorId, referenceId: signal.id }],
      dropped: { stage: "understanding", reason: "No usable intent evidence." },
      tiers: [0],
    };
  }
  const growthScores = scores(resolution.reading, resolution);
  const opportunity: GrowthOpportunity = {
    key: hashKey(`${resolution.reading.problems[0]?.value ?? "unknown"}:${resolution.reading.segment}:${resolution.reading.role}:${resolution.reading.stage}`),
    signalId: signal.id,
    connectorId: signal.connectorId,
    situation: situation(resolution.reading, items),
    painPoints: resolution.reading.problems.map((problem): PainPoint => ({ id: problem.value, label: problem.value.replaceAll("_", " "), description: problem.value.replaceAll("_", " "), confidence: problem.weight, evidence: [{ quote: problem.evidence, field: "problem" }], emergent: false })),
    audience: audience(resolution.reading, items),
    fit: fit(resolution),
    supply: supply(resolution.reading),
    scores: growthScores,
    decision: decision(resolution.reading, growthScores),
    status: resolution.opportunity ? "ACTIONABLE" : "OBSERVING",
    firstSeen: signal.observedAt,
    latestSeen: signal.observedAt,
    frequency: signal.occurrences ?? 1,
    evidence: items,
  };
  const opportunityInsights = insights(opportunity);
  return {
    signal,
    opportunity,
    campaign: null,
    insights: opportunityInsights,
    audit: [
      audit(signal, opportunity, "signal_ingested", "Accepted from the first-party production analytics stream."),
      audit(signal, opportunity, "classified", `Role ${opportunity.audience.primary}; segment ${opportunity.audience.segment}.`),
      audit(signal, opportunity, "opportunity_created", `Scored ${opportunity.scores.opportunity}/100 (${opportunity.scores.band}).`),
      audit(signal, opportunity, "policy_evaluated", opportunity.decision.reasons.join(" ")),
    ],
    dropped: null,
    tiers: [0, opportunity.scores.opportunity >= growthConfig().budgets.deepReasoningFloor ? 1 : 0],
  };
}

export function mergeGrowthOpportunities(results: readonly PipelineResult[]): GrowthOpportunity[] {
  const byKey = new Map<string, GrowthOpportunity>();
  for (const result of results) {
    const opportunity = result.opportunity;
    if (!opportunity) continue;
    const previous = byKey.get(opportunity.key);
    if (!previous) {
      byKey.set(opportunity.key, opportunity);
      continue;
    }
    byKey.set(opportunity.key, {
      ...previous,
      signalId: opportunity.signalId,
      latestSeen: Math.max(previous.latestSeen, opportunity.latestSeen),
      frequency: previous.frequency + opportunity.frequency,
      evidence: [...previous.evidence, ...opportunity.evidence].slice(0, 12),
      scores: opportunity.scores.opportunity >= previous.scores.opportunity ? opportunity.scores : previous.scores,
    });
  }
  return [...byKey.values()].sort((a, b) => b.scores.opportunity - a.scores.opportunity || b.frequency - a.frequency);
}

export function mergeGrowthInsights(results: readonly PipelineResult[]): GrowthInsight[] {
  const byId = new Map<string, GrowthInsight>();
  for (const result of results) {
    for (const insight of result.insights) {
      const previous = byId.get(insight.id);
      byId.set(insight.id, previous ? { ...insight, evidenceCount: previous.evidenceCount + insight.evidenceCount } : insight);
    }
  }
  return [...byId.values()].sort((a, b) => b.confidence - a.confidence);
}
