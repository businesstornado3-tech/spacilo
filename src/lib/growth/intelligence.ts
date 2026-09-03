/**
 * Phase 11 (surgical enhancement) — deep opportunity intelligence.
 *
 * The radar already reads a *situation*. This layer answers the harder
 * commercial questions on top of it: what is the person actually trying to
 * achieve, which of several intents are in play at once, who they are, where
 * (origin and destination, never invented), how urgent, for how long, what
 * they have, whether EarnRoom is genuinely the right answer, and how much of
 * that is supported by evidence rather than assumed.
 *
 * Three rules govern everything here:
 *  1. Nothing is invented. A dimension with no evidence is UNKNOWN, not a guess.
 *  2. Every populated dimension carries its own confidence and its own evidence.
 *  3. An unrecognised need is *kept* as an emerging need, never discarded.
 *
 * It is pure: no database, no network, no clock beyond what the caller passes.
 */
import type { IntentReading } from "@/lib/discovery/intent";
import type { SemanticReading } from "./semantics";
import type { EvidenceItem, GrowthRole, SupplyContext } from "./types";

/* ------------------------------------------------------------------ types */

export type GrowthIntent =
  | "FIND_STORAGE"
  | "STORE_ITEMS"
  | "PLAN_SPACE"
  | "ESTIMATE_SPACE"
  | "MONETISE_SPACE"
  | "LIST_SPACE"
  | "IMPROVE_SPACE_UTILISATION"
  | "MANAGE_RELOCATION"
  | "MANAGE_PROPERTY_TRANSITION"
  | "MANAGE_BUSINESS_INVENTORY"
  | "STUDENT_STORAGE"
  | "PREPARE_FOR_MOVE"
  | "TEMPORARY_STORAGE"
  | "CAPACITY_PLANNING"
  | "UNKNOWN";

export type UrgencyLevel = "IMMEDIATE" | "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";

export type DurationBand = "SHORT_TERM" | "MEDIUM_TERM" | "LONG_TERM" | "ONGOING" | "UNKNOWN";

export type FitVerdictDeep =
  | "BEST_EXISTING_SOLUTION"
  | "BEST_COMBINATION"
  | "FUTURE_OPPORTUNITY"
  | "NOT_A_FIT";

export type OpportunityCluster =
  | "PROPERTY_TRANSITION_STORAGE"
  | "STUDENT_SHORT_TERM_STORAGE"
  | "UNUSED_SPACE_MONETISATION"
  | "BUSINESS_INVENTORY_OVERFLOW"
  | "HOUSEHOLD_CAPACITY_STORAGE"
  | "RELOCATION_STORAGE"
  | "UNCLUSTERED";

/** A dimension the engine believes, with the reason it believes it. */
export type Dimension<T> = {
  value: T;
  confidence: number;
  evidence: readonly EvidenceItem[];
};

export type LocationIntelligence = {
  /** Always "United Kingdom" only when a UK place was actually recognised. */
  country: string | null;
  region: string | null;
  city: string | null;
  town: string | null;
  postcodeDistrict: string | null;
  /** Where they are moving *from*, when the sentence says so. */
  origin: string | null;
  /** Where they are moving *to*, when the sentence says so. */
  destination: string | null;
  /** True when more than one distinct place was named. */
  multiLocation: boolean;
  slug: string | null;
  confidence: number;
  evidence: readonly EvidenceItem[];
};

export type EmergingNeedRecord = {
  key: string;
  description: string;
  rawSignal: string;
  occurrences: number;
  firstSeen: number;
  confidence: number;
};

export type ProductOpportunity = {
  key: string;
  title: string;
  rationale: string;
  /** Recommendations only. Nothing here is ever deployed automatically. */
  autoDeploy: false;
  confidence: number;
};

export type CampaignPotential = "HIGH" | "MEDIUM" | "LOW" | "NONE";

export type DeepIntelligence = {
  goal: Dimension<string | null>;
  intents: Dimension<readonly GrowthIntent[]>;
  audiences: Dimension<readonly GrowthRole[]>;
  location: LocationIntelligence;
  urgency: Dimension<UrgencyLevel>;
  duration: Dimension<DurationBand>;
  /** Only what was actually named. Never inferred from a category. */
  assets: Dimension<readonly string[]>;
  context: Dimension<readonly string[]>;
  fit: {
    verdict: FitVerdictDeep;
    reasoning: readonly string[];
    confidence: number;
  };
  cluster: OpportunityCluster;
  campaignPotential: CampaignPotential;
  campaignReason: string;
  emergingNeed: EmergingNeedRecord | null;
  productOpportunity: ProductOpportunity | null;
  /** True when the engine genuinely does not know; recorded, not discarded. */
  unknown: boolean;
  /** Overall confidence, the mean of the populated dimensions. */
  confidence: number;
};

/* ------------------------------------------------------------------ input */

export type IntelligenceInput = {
  text: string;
  reading: IntentReading;
  semantics: SemanticReading;
  supply: SupplyContext;
  /** Whether a lawfully obtained, contactable handle exists at all. */
  hasContact?: boolean;
  now: number;
};

const clamp = (value: number) => Math.max(0, Math.min(1, value));

function item(quote: string, field: string): EvidenceItem {
  return { quote, field };
}

/* ------------------------------------------------------------------ goals */

const GOAL_BY_SITUATION: Record<string, string> = {
  MOVING_TRANSITION: "Get through a house move without belongings in the way.",
  PROPERTY_TRANSITION: "Empty or clear a property for a sale, clearance or works.",
  HOST_UNDERUSED_SPACE: "Turn space that is currently earning nothing into income.",
  BUSINESS_OVERFLOW: "Hold trading stock without committing to a commercial lease.",
  STUDENT_TRANSITION: "Keep belongings safe between terms without carrying them home.",
  RENTER_CAPACITY: "Free up room at home by storing what will not fit.",
};

/* ---------------------------------------------------------------- intents */

const INTENT_RULES: readonly (readonly [GrowthIntent, RegExp])[] = [
  ["FIND_STORAGE", /\b(find|search|look(?:ing)? for|need|want)\b[\s\S]{0,24}\b(storage|space|unit|garage|room)\b/],
  ["STORE_ITEMS", /\b(store|storing|keep|put away|stash)\b/],
  ["PLAN_SPACE", /\b(plan|layout|arrange|organis|organiz|fit out|floor ?plan)\b/],
  ["ESTIMATE_SPACE", /\b(how much|how big|estimate|measure|size|volume|cubic|how many boxes)\b/],
  ["MONETISE_SPACE", /\b(earn|income|make money|monetis|monetiz|rent out|extra cash|profit)\b/],
  ["LIST_SPACE", /\b(list my|advertise|become a host|host my|put my (garage|room|space) on)\b/],
  ["IMPROVE_SPACE_UTILISATION", /\b(unused|wasted|idle|underused|not using|doing nothing|going to waste|declutter)\b/],
  ["MANAGE_RELOCATION", /\b(relocat|moving (?:house|home|abroad|city)|removals|new job in)\b/],
  ["MANAGE_PROPERTY_TRANSITION", /\b(selling|sold|probate|renovat|refurb|building work|clear(?:ing)? (?:my )?(?:parents'?|mum'?s|dad'?s)?\s*(?:house|home|flat)|downsiz|completion|viewings?)\b/],
  ["MANAGE_BUSINESS_INVENTORY", /\b(stock|inventory|pallets|warehouse|stockroom|ecommerce|e-commerce|retail|business)\b/],
  ["STUDENT_STORAGE", /\b(student|uni|university|halls|campus|term|semester|freshers)\b/],
  ["PREPARE_FOR_MOVE", /\b(before (?:the|my) move|pack(?:ing)?|prepare|ahead of (?:the|my) move|staging)\b/],
  ["TEMPORARY_STORAGE", /\b(temporar|short(?:[ -])?term|a few (?:weeks|months)|for (?:a|one|two|three|\d+) (?:week|month)s?|until|interim|in between|meanwhile)\b/],
  ["CAPACITY_PLANNING", /\b(how much (?:space|room)|will it fit|capacity|enough (?:space|room)|running out of (?:space|room))\b/],
];

function readIntents(text: string, input: IntelligenceInput): Dimension<readonly GrowthIntent[]> {
  const evidence: EvidenceItem[] = [];
  const found = new Set<GrowthIntent>();
  for (const [intent, test] of INTENT_RULES) {
    const match = test.exec(text);
    if (!match) continue;
    found.add(intent);
    evidence.push(item(match[0], `intent:${intent}`));
  }
  // The situation the semantic layer recognised is itself intent evidence.
  const bySituation: Record<string, GrowthIntent> = {
    MOVING_TRANSITION: "MANAGE_RELOCATION",
    PROPERTY_TRANSITION: "MANAGE_PROPERTY_TRANSITION",
    HOST_UNDERUSED_SPACE: "MONETISE_SPACE",
    BUSINESS_OVERFLOW: "MANAGE_BUSINESS_INVENTORY",
    STUDENT_TRANSITION: "STUDENT_STORAGE",
    RENTER_CAPACITY: "FIND_STORAGE",
  };
  const situational = bySituation[input.semantics.situationType];
  if (situational) {
    found.add(situational);
    evidence.push(item(input.semantics.summary, "intent:situation"));
  }
  if (found.size === 0) {
    return { value: ["UNKNOWN"], confidence: 0, evidence: [] };
  }
  return {
    value: [...found],
    confidence: clamp(0.35 + Math.min(found.size, 3) * 0.2),
    evidence: evidence.slice(0, 6),
  };
}

/* --------------------------------------------------------------- audience */

function readAudiences(input: IntelligenceInput): Dimension<readonly GrowthRole[]> {
  const roles = new Set<GrowthRole>(input.semantics.roles.filter((role) => role !== "UNKNOWN"));
  const evidence: EvidenceItem[] = [...input.semantics.evidence].slice(0, 4);
  if (input.reading.segment === "business") roles.add("BUSINESS");
  if (input.reading.segment === "student") roles.add("STUDENT");
  if (input.reading.role === "host" || input.reading.role === "prospective_host") roles.add("HOST");
  if (input.reading.role === "renter") roles.add("RENTER");
  if (roles.size === 0) {
    return { value: ["UNKNOWN"], confidence: 0, evidence: [] };
  }
  return {
    value: [...roles],
    confidence: clamp(Math.max(input.reading.confidence, input.semantics.confidence)),
    evidence,
  };
}

/* --------------------------------------------------------------- location */

const POSTCODE_DISTRICT = /\b([A-Z]{1,2}\d{1,2}[A-Z]?)\b/;
// Stops the destination at the first connective so "to leeds and need space"
// yields "leeds" rather than swallowing the rest of the sentence.
const FROM_TO =
  /\bfrom\s+([a-z][a-z\s-]{2,24}?)\s+to\s+([a-z][a-z-]{2,24}(?:\s+(?!and\b|but\b|for\b|in\b|on\b|so\b|because\b|with\b|next\b|this\b|need\b|then\b)[a-z][a-z-]{1,24}){0,2})/;

function readLocationIntelligence(text: string, input: IntelligenceInput): LocationIntelligence {
  const reading = input.reading.location;
  const evidence: EvidenceItem[] = [];
  let city: string | null = null;
  let town: string | null = null;
  let region: string | null = null;
  let slug: string | null = null;

  if (reading.kind === "place") {
    slug = reading.place.slug;
    if (reading.place.kind === "city") city = reading.place.name;
    else if (reading.place.kind === "town") town = reading.place.name;
    else region = reading.place.name;
    evidence.push(item(reading.place.name, "location:place"));
  }

  const district = POSTCODE_DISTRICT.exec(input.text.toUpperCase());
  const postcodeDistrict = district?.[1] ?? null;
  if (postcodeDistrict) evidence.push(item(postcodeDistrict, "location:postcode_district"));

  const journey = FROM_TO.exec(text);
  const origin = journey?.[1]?.trim() ?? null;
  const destination = journey?.[2]?.trim() ?? null;
  if (origin) evidence.push(item(journey?.[0] ?? origin, "location:origin"));
  if (destination) evidence.push(item(journey?.[0] ?? destination, "location:destination"));

  const named = [city, town, region, origin, destination].filter(Boolean);
  const distinct = new Set(named.map((value) => String(value).toLowerCase()));

  return {
    // Country is only asserted when a UK place was genuinely recognised.
    country: reading.kind === "place" || postcodeDistrict ? "United Kingdom" : null,
    region,
    city,
    town,
    postcodeDistrict,
    origin,
    destination,
    multiLocation: distinct.size > 1,
    slug,
    confidence: evidence.length === 0 ? 0 : clamp(0.4 + evidence.length * 0.15),
    evidence,
  };
}

/* ------------------------------------------------------- urgency/duration */

const URGENCY_PATTERNS: readonly (readonly [UrgencyLevel, RegExp])[] = [
  ["IMMEDIATE", /\b(today|tonight|tomorrow|asap|right now|immediately|urgent(?:ly)?)\b/],
  ["HIGH", /\b(this week|next week|within (?:a|one) week|by (?:mon|tue|wed|thu|fri|sat|sun)|few days|completion|deadline)\b/],
  ["MEDIUM", /\b(this month|next month|in (?:a|one|two|three) months?|few weeks|soon|shortly)\b/],
  ["LOW", /\b(next year|eventually|at some point|thinking about|considering|planning ahead|no rush)\b/],
];

function readUrgency(text: string): Dimension<UrgencyLevel> {
  for (const [level, test] of URGENCY_PATTERNS) {
    const match = test.exec(text);
    if (match) return { value: level, confidence: 0.75, evidence: [item(match[0], "urgency")] };
  }
  return { value: "UNKNOWN", confidence: 0, evidence: [] };
}

const DURATION_PATTERNS: readonly (readonly [DurationBand, RegExp])[] = [
  ["SHORT_TERM", /\b((?:a|one|two|three|four|\d+)\s*(?:week|fortnight)s?|(?:a|one)\s*month|30 days|short(?:[ -])?term)\b/],
  ["MEDIUM_TERM", /\b((?:two|three|four|five|six|2|3|4|5|6)\s*months?|a (?:few|couple of) months|term time|the summer|until (?:september|term))\b/],
  ["LONG_TERM", /\b((?:seven|eight|nine|ten|eleven|twelve|\d{1,2})\s*months?|(?:a|one|two|\d+)\s*years?|long(?:[ -])?term)\b/],
  ["ONGOING", /\b(ongoing|permanent(?:ly)?|indefinite(?:ly)?|for the foreseeable|no end date|rolling)\b/],
];

function readDuration(text: string, input: IntelligenceInput): Dimension<DurationBand> {
  for (const [band, test] of DURATION_PATTERNS) {
    const match = test.exec(text);
    if (match) return { value: band, confidence: 0.7, evidence: [item(match[0], "duration")] };
  }
  if (input.semantics.duration) {
    return {
      value: "SHORT_TERM",
      confidence: 0.4,
      evidence: [item(input.semantics.duration, "duration:semantic")],
    };
  }
  return { value: "UNKNOWN", confidence: 0, evidence: [] };
}

/* ------------------------------------------------------------ assets etc. */

function readAssets(input: IntelligenceInput): Dimension<readonly string[]> {
  const values = input.reading.belongings.map((signal) => signal.value);
  if (values.length === 0) return { value: [], confidence: 0, evidence: [] };
  return {
    value: [...new Set(values)],
    confidence: clamp(0.5 + values.length * 0.1),
    evidence: input.reading.belongings.slice(0, 4).map((signal) => item(signal.evidence, "asset")),
  };
}

const CONTEXT_PATTERNS: readonly (readonly [string, RegExp])[] = [
  ["property_sale", /\b(selling|sold|completion|exchange|viewings?)\b/],
  ["renovation", /\b(renovat\w*|refurb\w*|building work|extension|decorating|damp|flood\w*)\b/],
  ["bereavement_or_probate", /\b(probate|passed away|inherited|estate)\b/],
  ["downsizing", /\b(downsiz|smaller (?:place|house|flat))\b/],
  ["new_baby_or_family_change", /\b(baby|nursery|new arrival|moving in together|separating|divorce)\b/],
  ["business_growth", /\b(growing|scaling|peak season|black friday|christmas stock)\b/],
  ["academic_calendar", /\b(term|semester|vacation|graduat|halls)\b/],
  ["landlord_or_tenancy", /\b(landlord|tenancy|lease (?:ends?|expiring)|end of tenancy|eviction)\b/],
];

function readContext(text: string): Dimension<readonly string[]> {
  const values: string[] = [];
  const evidence: EvidenceItem[] = [];
  for (const [id, test] of CONTEXT_PATTERNS) {
    const match = test.exec(text);
    if (!match) continue;
    values.push(id);
    evidence.push(item(match[0], `context:${id}`));
  }
  if (values.length === 0) return { value: [], confidence: 0, evidence: [] };
  return { value: values, confidence: clamp(0.4 + values.length * 0.2), evidence };
}

/* --------------------------------------------------------------- fit etc. */

/** Capabilities EarnRoom genuinely has today. Fit is judged against these. */
const REAL_CAPABILITIES: Readonly<Record<GrowthIntent, boolean>> = {
  FIND_STORAGE: true,
  STORE_ITEMS: true,
  PLAN_SPACE: true,
  ESTIMATE_SPACE: true,
  MONETISE_SPACE: true,
  LIST_SPACE: true,
  IMPROVE_SPACE_UTILISATION: true,
  MANAGE_RELOCATION: true,
  MANAGE_PROPERTY_TRANSITION: true,
  MANAGE_BUSINESS_INVENTORY: true,
  STUDENT_STORAGE: true,
  PREPARE_FOR_MOVE: true,
  TEMPORARY_STORAGE: true,
  CAPACITY_PLANNING: true,
  UNKNOWN: false,
};

function readFit(intents: readonly GrowthIntent[], input: IntelligenceInput) {
  const served = intents.filter((intent) => REAL_CAPABILITIES[intent]);
  const reasoning: string[] = [];
  let verdict: FitVerdictDeep;

  if (served.length === 0) {
    verdict = input.semantics.uncertain ? "FUTURE_OPPORTUNITY" : "NOT_A_FIT";
    reasoning.push(
      input.semantics.uncertain
        ? "No existing EarnRoom capability matches this need; it is kept as a future opportunity."
        : "The need does not map to anything EarnRoom does today.",
    );
  } else if (served.length === 1) {
    verdict = "BEST_EXISTING_SOLUTION";
    reasoning.push(`A single existing capability answers this need: ${served[0]}.`);
  } else {
    verdict = "BEST_COMBINATION";
    reasoning.push(`Several existing capabilities combine to answer this: ${served.join(", ")}.`);
  }

  // Supply never changes fit — it changes what may be claimed.
  reasoning.push(
    input.supply.mayClaimAvailability
      ? "Live supply may be referenced for this audience."
      : "No availability may be claimed; demand is captured truthfully instead.",
  );

  return {
    verdict,
    reasoning,
    confidence: clamp(served.length === 0 ? 0.2 : 0.4 + served.length * 0.15),
  };
}

/* ---------------------------------------------------------------- cluster */

function readCluster(
  input: IntelligenceInput,
  intents: readonly GrowthIntent[],
): OpportunityCluster {
  switch (input.semantics.situationType) {
    case "PROPERTY_TRANSITION":
      return "PROPERTY_TRANSITION_STORAGE";
    case "STUDENT_TRANSITION":
      return "STUDENT_SHORT_TERM_STORAGE";
    case "HOST_UNDERUSED_SPACE":
      return "UNUSED_SPACE_MONETISATION";
    case "BUSINESS_OVERFLOW":
      return "BUSINESS_INVENTORY_OVERFLOW";
    case "MOVING_TRANSITION":
      return "RELOCATION_STORAGE";
    case "RENTER_CAPACITY":
      return "HOUSEHOLD_CAPACITY_STORAGE";
    default:
      if (intents.includes("MONETISE_SPACE") || intents.includes("LIST_SPACE")) {
        return "UNUSED_SPACE_MONETISATION";
      }
      return "UNCLUSTERED";
  }
}

/* ------------------------------------------------------- campaign reading */

function readCampaignPotential(
  input: IntelligenceInput,
  urgency: UrgencyLevel,
  fitVerdict: FitVerdictDeep,
  overall: number,
): { potential: CampaignPotential; reason: string } {
  if (fitVerdict === "NOT_A_FIT") {
    return { potential: "NONE", reason: "EarnRoom cannot help with this need today." };
  }
  if (fitVerdict === "FUTURE_OPPORTUNITY") {
    return {
      potential: "LOW",
      reason: "Recorded as an emerging need; there is nothing truthful to offer yet.",
    };
  }
  if (input.hasContact !== true) {
    return {
      potential: "LOW",
      reason: "No lawfully obtained contact handle exists, so this can only be acted on in-product.",
    };
  }
  if (overall < 0.35) {
    return { potential: "LOW", reason: "Understanding is too thin to say anything useful." };
  }
  if (urgency === "IMMEDIATE" || urgency === "HIGH") {
    return { potential: "HIGH", reason: "A real, dated need with a clear existing EarnRoom answer." };
  }
  return { potential: "MEDIUM", reason: "A genuine need with no stated deadline." };
}

/* ----------------------------------------------------------------- public */

export function analyseOpportunity(input: IntelligenceInput): DeepIntelligence {
  const text = input.text.toLowerCase();

  const intents = readIntents(text, input);
  const audiences = readAudiences(input);
  const location = readLocationIntelligence(text, input);
  const urgency = readUrgency(text);
  const duration = readDuration(text, input);
  const assets = readAssets(input);
  const context = readContext(text);
  const fit = readFit(intents.value, input);
  const cluster = readCluster(input, intents.value);

  const goalValue =
    GOAL_BY_SITUATION[input.semantics.situationType] ?? input.semantics.need ?? null;
  const goal: Dimension<string | null> = {
    value: goalValue,
    confidence: goalValue ? clamp(input.semantics.confidence) : 0,
    evidence: goalValue ? [item(input.semantics.summary, "goal")] : [],
  };

  const dimensions = [
    goal.confidence,
    intents.confidence,
    audiences.confidence,
    location.confidence,
    urgency.confidence,
    duration.confidence,
    assets.confidence,
    context.confidence,
    fit.confidence,
  ];
  const confidence = clamp(dimensions.reduce((a, b) => a + b, 0) / dimensions.length);

  const unknown =
    intents.value[0] === "UNKNOWN" && audiences.value[0] === "UNKNOWN" && goalValue === null;

  // An unrecognised need is preserved, not dropped: this is how tomorrow's
  // product gets discovered.
  const emergingNeed: EmergingNeedRecord | null =
    input.semantics.situationType === "UNCLASSIFIED" && input.text.trim().length > 0
      ? {
          key: `emerging:${cluster}:${text.replace(/[^a-z0-9]+/g, "-").slice(0, 48)}`,
          description: input.semantics.summary,
          rawSignal: input.text.slice(0, 240),
          occurrences: 1,
          firstSeen: input.now,
          confidence: clamp(input.semantics.confidence),
        }
      : null;

  const productOpportunity: ProductOpportunity | null =
    fit.verdict === "FUTURE_OPPORTUNITY"
      ? {
          key: `product:${cluster}`,
          title: `Unserved need in ${cluster.replaceAll("_", " ").toLowerCase()}`,
          rationale: input.semantics.summary,
          autoDeploy: false,
          confidence: clamp(confidence),
        }
      : null;

  const { potential, reason } = readCampaignPotential(input, urgency.value, fit.verdict, confidence);

  return {
    goal,
    intents,
    audiences,
    location,
    urgency,
    duration,
    assets,
    context,
    fit,
    cluster,
    campaignPotential: potential,
    campaignReason: reason,
    emergingNeed,
    productOpportunity,
    unknown,
    confidence,
  };
}

/**
 * Multi-signal synthesis. Repeats of the same underlying need reinforce each
 * other rather than creating duplicates: the *strongest evidenced* value wins
 * per dimension and confidence rises only where evidence genuinely agrees.
 */
export function mergeIntelligence(
  previous: DeepIntelligence,
  next: DeepIntelligence,
): DeepIntelligence {
  const better = <T>(a: Dimension<T>, b: Dimension<T>) => (b.confidence > a.confidence ? b : a);
  const intents: Dimension<readonly GrowthIntent[]> = {
    value: [...new Set([...previous.intents.value, ...next.intents.value])].filter(
      (intent, _i, all) => intent !== "UNKNOWN" || all.length === 1,
    ),
    confidence: Math.max(previous.intents.confidence, next.intents.confidence),
    evidence: [...previous.intents.evidence, ...next.intents.evidence].slice(0, 8),
  };
  const audiences: Dimension<readonly GrowthRole[]> = {
    value: [...new Set([...previous.audiences.value, ...next.audiences.value])].filter(
      (role, _i, all) => role !== "UNKNOWN" || all.length === 1,
    ),
    confidence: Math.max(previous.audiences.confidence, next.audiences.confidence),
    evidence: [...previous.audiences.evidence, ...next.audiences.evidence].slice(0, 8),
  };
  const merged: DeepIntelligence = {
    ...next,
    goal: better(previous.goal, next.goal),
    intents,
    audiences,
    location: next.location.confidence >= previous.location.confidence ? next.location : previous.location,
    urgency: better(previous.urgency, next.urgency),
    duration: better(previous.duration, next.duration),
    assets: better(previous.assets, next.assets),
    context: better(previous.context, next.context),
    emergingNeed:
      previous.emergingNeed && next.emergingNeed
        ? { ...previous.emergingNeed, occurrences: previous.emergingNeed.occurrences + 1 }
        : (previous.emergingNeed ?? next.emergingNeed),
    confidence: Math.max(previous.confidence, next.confidence),
    unknown: previous.unknown && next.unknown,
  };
  return merged;
}
