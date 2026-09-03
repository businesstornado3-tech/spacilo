/**
 * Phase 11 Stage 3 — semantic opportunity intelligence.
 *
 * The deterministic discovery reader answers "what is this query about?".
 * This layer answers the harder question the growth engine needs: what is the
 * person's *situation*, what is actually going wrong, how urgent is it, how
 * long will it last, and how much of that is genuinely supported by evidence
 * rather than assumed.
 *
 * It is open by construction. A situation that matches no known pattern is
 * still recorded — as an emergent pain point with low confidence — instead of
 * being discarded, so tomorrow's problem can be discovered without a rewrite.
 */
import type { IntentReading } from "@/lib/discovery/intent";
import type { EvidenceItem, GrowthRole, PainPoint, Urgency } from "./types";

export type SituationType =
  | "MOVING_TRANSITION"
  | "PROPERTY_TRANSITION"
  | "HOST_UNDERUSED_SPACE"
  | "BUSINESS_OVERFLOW"
  | "STUDENT_TRANSITION"
  | "RENTER_CAPACITY"
  | "UNCLASSIFIED";

export type SemanticReading = {
  situationType: SituationType;
  /** One plain sentence describing what is going on. Evidence-backed only. */
  summary: string;
  problem: string | null;
  cause: string | null;
  need: string | null;
  likelyNext: string | null;
  urgency: Urgency;
  /** Verbatim duration phrase, when the person gave one. */
  duration: string | null;
  temporary: boolean | null;
  /** True when the engine does not have enough evidence to make claims. */
  uncertain: boolean;
  confidence: number;
  roles: readonly GrowthRole[];
  painPoints: readonly PainPoint[];
  evidence: readonly EvidenceItem[];
};

type Rule = {
  type: SituationType;
  test: RegExp;
  role: GrowthRole;
  problem: string;
  cause: string;
  need: string;
  likelyNext: string;
  weight: number;
};

/**
 * Situation shapes, not vocabulary lists. Each one pairs the *reason* a person
 * ends up needing space with the role they are acting in.
 */
const RULES: readonly Rule[] = [
  {
    type: "MOVING_TRANSITION",
    test: /\b(moving|move house|house move|relocat|between houses|new place|moving out|moving in|removals)\b/,
    role: "MOVING_TRANSITION",
    problem: "Belongings need somewhere to go during a move.",
    cause: "A house move creates a gap between one property and the next.",
    need: "Short-term space for belongings while the move completes.",
    likelyNext: "Look for space near the new or old address.",
    weight: 0.85,
  },
  {
    type: "PROPERTY_TRANSITION",
    test: /\b(selling|sell my (house|home|flat)|viewings?|renovat|building work|refurb|decorating|clear (my|the|parents'?|mum'?s|dad'?s) (house|home|flat)|probate|downsiz)\b/,
    role: "PROPERTY_RELATED",
    problem: "A property has to be cleared or emptied for a period.",
    cause: "A sale, renovation or clearance makes the property unusable for storage.",
    need: "Somewhere to hold the contents until the work or sale is done.",
    likelyNext: "Estimate how much needs storing, then find space.",
    weight: 0.8,
  },
  {
    type: "HOST_UNDERUSED_SPACE",
    test: /\b(unused|empty|spare|idle|not using|never use|doing nothing|going to waste)\b[\s\S]{0,30}\b(garage|loft|attic|room|space|shed|basement|cellar|driveway|outbuilding|unit)\b|\b(rent out|list my space|earn from|make money from|monetis|monetiz)\b/,
    role: "HOST",
    problem: "Space is sitting idle and earning nothing.",
    cause: "The owner has capacity but no route to turn it into income.",
    need: "A way to understand the space's value and list it safely.",
    likelyNext: "Estimate earnings, then list the space.",
    weight: 0.85,
  },
  {
    type: "BUSINESS_OVERFLOW",
    test: /\b(stock|inventory|pallets|warehouse|shop|business|commercial|retail|stockroom|sme|ecommerce|e-commerce|equipment)\b/,
    role: "BUSINESS",
    problem: "A business has more goods than its premises can hold.",
    cause: "Trading volume has outgrown the available commercial space.",
    need: "Flexible overflow space without a long commercial lease.",
    likelyNext: "Compare nearby space and cost.",
    weight: 0.8,
  },
  {
    type: "STUDENT_TRANSITION",
    test: /\b(student|students|uni|university|halls|campus|term|semester|freshers)\b/,
    role: "STUDENT",
    problem: "Student belongings need somewhere to go between terms.",
    cause: "Term-time accommodation is only available part of the year.",
    need: "Affordable short-term storage close to the university.",
    likelyNext: "Find space near the campus for the vacation.",
    weight: 0.8,
  },
  {
    type: "RENTER_CAPACITY",
    test: /\b(no room|not enough (room|space)|nowhere to put|running out of (room|space)|too much|too many|overflow|can'?t fit|cannot fit|outgrown|need (somewhere|storage|space)|somewhere to (store|keep|put)|where can i (store|keep|put))\b/,
    role: "RENTER",
    problem: "There is more to store than the current space allows.",
    cause: "Belongings have outgrown the space available at home.",
    need: "Somewhere nearby to store what will not fit.",
    likelyNext: "Estimate the volume, then search locally.",
    weight: 0.8,
  },
];

const URGENCY_RULES: readonly (readonly [RegExp, Urgency, string])[] = [
  [/\b(today|tomorrow|asap|urgent|right now|immediately|this week|by friday)\b/, "immediate", "immediate timing"],
  [/\b(next week|in (a|two|three|2|3) weeks?|this month|next month|end of the month)\b/, "weeks", "weeks away"],
  [/\b(in (a few|several) months|next (year|term|summer)|later this year)\b/, "months", "months away"],
];

const DURATION_RE =
  /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|a couple of|a few)\s+(day|days|week|weeks|month|months|year|years)\b|\b(over (the )?summer|between terms?|short[- ]term|long[- ]term|temporar\w*)\b/;

function evidenceFrom(text: string, pattern: RegExp, field: string): EvidenceItem | null {
  const match = pattern.exec(text);
  return match ? { quote: match[0], field } : null;
}

function readUrgency(text: string): { urgency: Urgency; evidence: EvidenceItem | null } {
  for (const [pattern, urgency, field] of URGENCY_RULES) {
    const item = evidenceFrom(text, pattern, field);
    if (item) return { urgency, evidence: item };
  }
  return { urgency: "unknown", evidence: null };
}

/**
 * Reads the situation behind a signal. Every populated field carries evidence;
 * when nothing matches, the reading stays deliberately uncertain rather than
 * inventing a story.
 */
export function readSemantics(rawText: string, reading: IntentReading): SemanticReading {
  const text = rawText.toLowerCase();
  const evidence: EvidenceItem[] = [];
  const painPoints: PainPoint[] = [];
  const roles = new Set<GrowthRole>();

  const matched = RULES.filter((rule) => rule.test.test(text));
  for (const rule of matched) {
    const item = evidenceFrom(text, rule.test, rule.type.toLowerCase());
    if (item) evidence.push(item);
    roles.add(rule.role);
    painPoints.push({
      id: rule.type.toLowerCase(),
      label: rule.type.replaceAll("_", " ").toLowerCase(),
      description: rule.problem,
      confidence: rule.weight,
      evidence: item ? [item] : [],
      emergent: false,
    });
  }

  for (const problem of reading.problems) {
    painPoints.push({
      id: problem.value,
      label: problem.value.replaceAll("_", " "),
      description: problem.value.replaceAll("_", " "),
      confidence: problem.weight,
      evidence: [{ quote: problem.evidence, field: "problem" }],
      emergent: false,
    });
  }

  const { urgency, evidence: urgencyEvidence } = readUrgency(text);
  if (urgencyEvidence) evidence.push(urgencyEvidence);

  const durationMatch = DURATION_RE.exec(text);
  const duration = durationMatch?.[0] ?? null;
  if (durationMatch) evidence.push({ quote: durationMatch[0], field: "duration" });

  const primaryRule = matched.sort((a, b) => b.weight - a.weight)[0] ?? null;
  const situationType: SituationType = primaryRule?.type ?? "UNCLASSIFIED";

  // Nothing recognised: keep the observation as an emergent need rather than
  // discarding a problem the product has simply never seen before.
  if (!primaryRule && reading.problems.length === 0) {
    painPoints.push({
      id: "emergent",
      label: "unclassified need",
      description: "An observed need that matches no known EarnRoom pattern.",
      confidence: Math.min(0.3, reading.confidence),
      evidence: [{ quote: rawText.slice(0, 120), field: "raw_signal" }],
      emergent: true,
    });
  }

  const supportCount = evidence.length + reading.objectives.length;
  const confidence = Math.min(
    1,
    Math.round(((primaryRule?.weight ?? 0.2) * 0.6 + Math.min(supportCount, 4) * 0.1) * 100) / 100,
  );
  const uncertain = !primaryRule && reading.problems.length === 0;

  if (reading.role === "renter") roles.add("RENTER");
  if (reading.role === "host" || reading.role === "prospective_host") roles.add("HOST");
  if (roles.size === 0) roles.add("UNKNOWN");

  const summary = primaryRule
    ? primaryRule.problem
    : reading.problems[0]
      ? `Observed need: ${reading.problems[0].value.replaceAll("_", " ")}.`
      : "An observed need that has not been classified yet.";

  return {
    situationType,
    summary,
    problem: primaryRule?.problem ?? null,
    cause: primaryRule?.cause ?? null,
    need: primaryRule?.need ?? null,
    likelyNext: primaryRule?.likelyNext ?? null,
    urgency,
    duration,
    temporary: duration ? true : reading.timeframe === "temporary" || reading.timeframe === "moving_period",
    uncertain,
    confidence,
    roles: [...roles],
    painPoints,
    evidence,
  };
}

/**
 * The clustering key. Repeats of the same underlying need — same situation,
 * audience and place — collapse onto one opportunity rather than inflating the
 * numbers with duplicates.
 */
export function clusterKey(parts: {
  situationType: SituationType;
  role: GrowthRole;
  segment: string;
  locationSlug: string | null;
}): string {
  return [parts.situationType, parts.role, parts.segment, parts.locationSlug ?? "uk_wide"].join("|");
}
