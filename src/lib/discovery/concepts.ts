/**
 * Semantic concept layer.
 *
 * The lexicons in `intent.ts` read explicit vocabulary ("storage", "declutter",
 * "rent out"). Real people rarely use it. This layer reads the *shape* of a
 * sentence instead — "what can I do with …", "make better use of …", "too much
 * … for my …" — so unseen phrasing built the same way is still understood.
 *
 * It is deliberately a small set of compositional patterns, not a synonym
 * dictionary: each pattern pairs a sentence shape with a subject group, so new
 * nouns are covered without new rules.
 */
import type { AudienceSegment, Objective, ProblemConcept, Signal } from "./taxonomy";

/** Physical capacity a person can own or control. */
const SPACE_NOUNS =
  "garage|garages|room|rooms|space|spaces|loft|attic|cellar|basement|shed|outbuilding|warehouse|unit|units|storeroom|premises|driveway|annexe|bedroom|floor";

/** Things a business or household ends up with too much of. */
const GOODS_NOUNS =
  "stock|inventory|equipment|goods|products|supplies|pallets|boxes|kit|machinery|tools|stuff|things|belongings|furniture";

const BUSINESS_NOUNS =
  "shop|shops|business|businesses|company|warehouse|office|offices|commercial|retail|storefront|stockroom|sme|ecommerce|e-commerce|market stall|salon|studio";

const STUDENT_NOUNS = "student|students|uni|university|halls|campus|term|terms|semester|freshers";

/** Absence-of-use language, applied to a space rather than matched literally. */
const UNUSED =
  "empty|unused|un-used|idle|spare|unoccupied|not using|not used|isn't used|isnt used|don't use|dont use|do not use|never use|sitting empty|going to waste|doing nothing|wasted";

const SHORTFALL =
  "too much|too many|more than|no room|not enough room|not enough space|nowhere to put|running out of room|running out of space|overflow|overflowing|can't fit|cant fit|cannot fit|outgrown|has no room|no space";

type Pattern = {
  id: string;
  test: RegExp;
  /** A second condition that must also appear somewhere in the query. */
  also?: RegExp;
  problems?: readonly (readonly [ProblemConcept, number])[];
  objectives?: readonly (readonly [Objective, number])[];
  segment?: AudienceSegment;
  /** True when the pattern implies the person owns the space in question. */
  ownsSpace?: boolean;
};

const PATTERNS: readonly Pattern[] = [
  {
    id: "what_can_i_do_with_space",
    test: new RegExp(`\\b(what|anything)\\s+(can|could|should)\\s+(i|we)\\s+(do|use)\\b[\\s\\S]{0,40}\\b(${SPACE_NOUNS})\\b|\\b(make|earn)\\s+(money|income)\\s+(from|with)\\b[\\s\\S]{0,30}\\b(${SPACE_NOUNS})\\b`),
    problems: [
      ["underused_space", 0.85],
      ["monetisation_unknown", 0.7],
    ],
    objectives: [
      ["optimise_space", 0.7],
      ["earn", 0.55],
      ["estimate", 0.5],
    ],
    ownsSpace: true,
  },
  {
    id: "make_better_use_of",
    test: /\b(make|making|get|getting)\s+(better|more|the most|good)\s+use\s+of\b|\bput\s+[\s\S]{0,20}\bto\s+(better\s+)?use\b|\butilis(e|ing)\b|\butiliz(e|ing)\b/,
    problems: [["underused_space", 0.8]],
    objectives: [
      ["optimise_space", 0.85],
      ["estimate", 0.45],
    ],
    ownsSpace: true,
  },
  {
    id: "unused_space",
    test: new RegExp(`\\b(${UNUSED})\\b[\\s\\S]{0,30}\\b(${SPACE_NOUNS})\\b`),
    problems: [
      ["underused_space", 0.85],
      ["monetisation_unknown", 0.6],
    ],
    objectives: [
      ["free_up_space", 0.6],
      ["earn", 0.55],
      ["optimise_space", 0.5],
    ],
    ownsSpace: true,
  },
  {
    id: "space_i_dont_use",
    test: new RegExp(`\\b(${SPACE_NOUNS})\\b[\\s\\S]{0,30}\\b(i|we)\\s+(don't|dont|do not|never)\\s+(use|need)\\b`),
    problems: [["underused_space", 0.85]],
    objectives: [
      ["optimise_space", 0.6],
      ["earn", 0.5],
    ],
    ownsSpace: true,
  },
  {
    id: "capacity_shortfall",
    test: new RegExp(`\\b(${SHORTFALL})\\b`),
    also: new RegExp(`\\b(${GOODS_NOUNS}|${SPACE_NOUNS})\\b`),
    problems: [["capacity_shortfall", 0.8]],
    objectives: [
      ["store", 0.7],
      ["find", 0.5],
    ],
  },
  {
    id: "business_overflow",
    test: new RegExp(`\\b(${SHORTFALL})\\b`),
    also: new RegExp(`\\b(${BUSINESS_NOUNS})\\b|\\b(stock|inventory|pallets)\\b`),
    problems: [
      ["business_overflow", 0.85],
      ["excess_inventory", 0.75],
    ],
    objectives: [
      ["store", 0.75],
      ["manage_inventory", 0.6],
      ["find", 0.55],
    ],
    segment: "business",
  },
  {
    id: "commercial_space",
    test: new RegExp(`\\b(${BUSINESS_NOUNS})\\b`),
    segment: "business",
  },
  {
    id: "commercial_optimisation",
    test: /\b(make|making|get|getting)\s+(better|more|the most)\s+use\s+of\b/,
    also: new RegExp(`\\b(${BUSINESS_NOUNS})\\b`),
    problems: [["commercial_space_optimisation", 0.8]],
    objectives: [["optimise_space", 0.8]],
    segment: "business",
  },
  {
    id: "student_context",
    test: new RegExp(`\\b(${STUDENT_NOUNS})\\b`),
    problems: [["transition", 0.6]],
    objectives: [["store", 0.5]],
    segment: "student",
  },
  {
    id: "needs_somewhere",
    test: /\b(where\s+can\s+(i|we|students|my)\b[\s\S]{0,20}\b(store|keep|put)|somewhere\s+to\s+(store|keep|put)|place\s+to\s+(store|keep|put)|need\s+(somewhere|storage|space))\b/,
    problems: [["needs_somewhere_to_store", 0.85]],
    objectives: [
      ["store", 0.8],
      ["find", 0.7],
    ],
  },
  {
    id: "clearing_before_sale",
    test: /\b(sell|selling|sale|viewings?)\b/,
    also: /\b(house|home|flat|property)\b/,
    problems: [["transition", 0.7]],
    objectives: [
      ["declutter", 0.7],
      ["store", 0.5],
    ],
  },
  {
    id: "income_from_home",
    test: /\b(side|passive|extra|additional|second)\s+(income|money|earnings)\b|\bearn\s+(from|at)\s+home\b|\bmake\s+money\s+(from|at)\s+home\b/,
    problems: [["monetisation_unknown", 0.8]],
    objectives: [
      ["earn", 0.9],
      ["estimate", 0.5],
    ],
    ownsSpace: true,
  },
];

export type ConceptReading = {
  problems: readonly Signal<ProblemConcept>[];
  objectives: readonly Signal<Objective>[];
  segment: AudienceSegment;
  /** True when the query implies the person controls a physical space. */
  ownsSpace: boolean;
  /** Pattern ids that fired — kept so any decision stays explainable. */
  matched: readonly string[];
};

function strongest<T extends string>(
  found: Map<T, Signal<T>>,
  value: T,
  weight: number,
  evidence: string,
): void {
  const existing = found.get(value);
  if (!existing || existing.weight < weight) found.set(value, { value, weight, evidence });
}

/** Reads sentence-shape concepts out of an already-normalised query. */
export function readConcepts(query: string): ConceptReading {
  const problems = new Map<ProblemConcept, Signal<ProblemConcept>>();
  const objectives = new Map<Objective, Signal<Objective>>();
  const matched: string[] = [];
  let segment: AudienceSegment = "undetermined";
  let ownsSpace = false;

  for (const pattern of PATTERNS) {
    if (!pattern.test.test(query)) continue;
    if (pattern.also && !pattern.also.test(query)) continue;
    matched.push(pattern.id);
    for (const [value, weight] of pattern.problems ?? []) strongest(problems, value, weight, pattern.id);
    for (const [value, weight] of pattern.objectives ?? []) strongest(objectives, value, weight, pattern.id);
    if (pattern.segment && pattern.segment !== "undetermined") {
      // A specific segment (student/business) beats an undetermined default.
      if (segment === "undetermined" || segment === pattern.segment) segment = pattern.segment;
    }
    if (pattern.ownsSpace) ownsSpace = true;
  }

  const bySignal = <T extends string>(map: Map<T, Signal<T>>) =>
    [...map.values()].sort((a, b) => b.weight - a.weight || a.value.localeCompare(b.value));

  return {
    problems: bySignal(problems),
    objectives: bySignal(objectives),
    segment,
    ownsSpace,
    matched,
  };
}
