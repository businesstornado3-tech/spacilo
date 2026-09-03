/**
 * Intent understanding.
 *
 * Deterministic, evidence-based and multi-intent by design. A query never has
 * to contain the words "storage", "space", "garage" or "EarnRoom" — the reader
 * works from what the person is trying to *do*.
 *
 * Nothing here decides what to publish. It only produces a traceable reading.
 */
import {
  readLocation,
  type LocationReading,
} from "./locations";
import type {
  BelongingCategory,
  JourneyStage,
  Objective,
  Signal,
  SpaceKind,
  Timeframe,
  UserRole,
} from "./taxonomy";

/** Phrase → dimension value. Order is irrelevant; all matches are collected. */
type Lexicon<T extends string> = ReadonlyArray<readonly [phrase: string, value: T, weight: number]>;

const OBJECTIVE_LEXICON: Lexicon<Objective> = [
  ["organise", "organise", 0.9],
  ["organize", "organise", 0.9],
  ["tidy", "organise", 0.6],
  ["sort out", "organise", 0.6],
  ["declutter", "declutter", 0.9],
  ["clear my house", "declutter", 0.8],
  ["clear out", "declutter", 0.7],
  ["what do i have", "identify", 0.9],
  ["what i have", "identify", 0.7],
  ["identify", "identify", 0.8],
  ["itemise", "identify", 0.9],
  ["itemize", "identify", 0.9],
  ["inventory", "manage_inventory", 0.8],
  ["catalogue", "manage_inventory", 0.7],
  ["measure", "measure", 0.9],
  ["how big", "measure", 0.7],
  ["dimensions", "measure", 0.7],
  ["how much space", "estimate", 0.85],
  ["how much room", "estimate", 0.85],
  ["how much storage", "estimate", 0.85],
  ["estimate", "estimate", 0.8],
  ["work out", "estimate", 0.5],
  ["plan", "plan", 0.8],
  ["arrange", "plan", 0.8],
  ["layout", "plan", 0.7],
  ["fit", "fit", 0.85],
  ["will it fit", "fit", 0.95],
  ["compare", "compare", 0.7],
  ["cheapest", "compare", 0.6],
  ["find", "find", 0.6],
  ["where can i", "find", 0.8],
  ["near me", "find", 0.7],
  ["store", "store", 0.7],
  ["storage", "store", 0.6],
  ["put my", "store", 0.6],
  ["keep my", "store", 0.5],
  ["make money", "earn", 0.95],
  ["earn", "earn", 0.9],
  ["income", "earn", 0.8],
  ["rent out", "list_space", 0.9],
  ["list my space", "list_space", 0.95],
  ["monetise", "earn", 0.9],
  ["monetize", "earn", 0.9],
  ["moving", "move", 0.85],
  ["move house", "move", 0.95],
  ["house move", "move", 0.95],
  ["relocat", "relocate", 0.85],
  ["renovat", "renovate", 0.9],
  ["building work", "renovate", 0.7],
  ["downsiz", "downsize", 0.9],
  ["free up", "free_up_space", 0.8],
  ["more room", "free_up_space", 0.6],
  ["maximise", "optimise_space", 0.85],
  ["maximize", "optimise_space", 0.85],
  ["make the most of", "optimise_space", 0.8],
  ["protect", "protect", 0.6],
  ["safe place", "protect", 0.6],
];

const BELONGINGS_LEXICON: Lexicon<BelongingCategory> = [
  ["furniture", "furniture", 0.9],
  ["sofa", "sofa", 0.9],
  ["couch", "sofa", 0.9],
  ["bed", "bed", 0.85],
  ["mattress", "bed", 0.8],
  ["wardrobe", "wardrobe", 0.9],
  ["table", "table", 0.8],
  ["box", "boxes", 0.85],
  ["boxes", "boxes", 0.9],
  ["clothes", "clothing", 0.85],
  ["clothing", "clothing", 0.85],
  ["document", "documents", 0.85],
  ["paperwork", "documents", 0.8],
  ["archive", "documents", 0.7],
  ["belongings", "household", 0.8],
  ["my stuff", "household", 0.8],
  ["household", "household", 0.8],
  ["stock", "business_inventory", 0.85],
  ["business inventory", "business_inventory", 0.95],
  ["shop", "business_inventory", 0.5],
  ["equipment", "equipment", 0.8],
  ["tools", "equipment", 0.7],
  ["seasonal", "seasonal", 0.8],
  ["christmas", "seasonal", 0.7],
  ["student", "student", 0.9],
  ["uni ", "student", 0.7],
  ["bike", "vehicle_related", 0.6],
  ["motorbike", "vehicle_related", 0.8],
];

const SPACE_LEXICON: Lexicon<SpaceKind> = [
  ["garage", "garage", 0.95],
  ["loft", "loft", 0.9],
  ["attic", "attic", 0.9],
  ["shed", "shed", 0.9],
  ["basement", "basement", 0.9],
  ["cellar", "basement", 0.85],
  ["spare room", "spare_room", 0.95],
  ["spare bedroom", "spare_room", 0.95],
  ["room", "room", 0.6],
  ["warehouse", "warehouse", 0.9],
  ["office", "office", 0.8],
  ["storage unit", "storage_unit", 0.9],
  ["self storage", "storage_unit", 0.85],
];

const TIMEFRAME_LEXICON: Lexicon<Timeframe> = [
  ["short term", "short_term", 0.9],
  ["short-term", "short_term", 0.9],
  ["few weeks", "short_term", 0.8],
  ["long term", "long_term", 0.9],
  ["long-term", "long_term", 0.9],
  ["temporar", "temporary", 0.9],
  ["for a while", "temporary", 0.6],
  ["while moving", "moving_period", 0.9],
  ["between houses", "moving_period", 0.9],
  ["over summer", "seasonal", 0.8],
  ["over winter", "seasonal", 0.8],
  ["seasonal", "seasonal", 0.85],
];

/** Durations like "two months" / "3 weeks" imply a temporary need. */
const DURATION_RE =
  /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|a couple of|a few)\s+(day|days|week|weeks|month|months|year|years)\b/;

const HOST_SIGNALS = [
  "make money",
  "earn",
  "income",
  "rent out",
  "rent my",
  "monetise",
  "monetize",
  "list my space",
  "my empty",
  "unused space",
  "my spare room",
  "my garage could",
  "what could my space",
];

const RENTER_SIGNALS = [
  "where can i store",
  "somewhere to store",
  "need storage",
  "storage near",
  "storage in",
  "store my",
  "place to store",
  "i need somewhere",
];

const STAGE_LEXICON: Lexicon<JourneyStage> = [
  ["how do i", "education", 0.7],
  ["how to", "education", 0.7],
  ["what is", "education", 0.7],
  ["best way", "education", 0.6],
  ["how much", "estimation", 0.7],
  ["measure", "measurement", 0.8],
  ["plan", "planning", 0.7],
  ["compare", "comparison", 0.8],
  ["cheapest", "comparison", 0.7],
  ["near me", "search", 0.8],
  ["available", "search", 0.6],
  ["book", "transaction", 0.8],
  ["rent out", "listing", 0.9],
  ["list my space", "listing", 0.9],
];

export type IntentReading = {
  /** Normalised query text — never persisted by analytics. */
  query: string;
  role: UserRole;
  objectives: readonly Signal<Objective>[];
  belongings: readonly Signal<BelongingCategory>[];
  spaces: readonly Signal<SpaceKind>[];
  timeframe: Timeframe;
  location: LocationReading;
  stage: JourneyStage;
  /** 0..1 — how much usable evidence the query actually contained. */
  confidence: number;
  /** True when nothing recognisable was found; callers must degrade usefully. */
  unknown: boolean;
};

function collect<T extends string>(text: string, lexicon: Lexicon<T>): Signal<T>[] {
  const found = new Map<T, Signal<T>>();
  for (const [phrase, value, weight] of lexicon) {
    if (!text.includes(phrase)) continue;
    const existing = found.get(value);
    if (!existing || existing.weight < weight) {
      found.set(value, { value, weight, evidence: phrase });
    }
  }
  return [...found.values()].sort((a, b) => b.weight - a.weight || a.value.localeCompare(b.value));
}

export function normaliseQuery(raw: string): string {
  return raw.toLowerCase().replace(/[^\p{L}\p{N}\s'-]/gu, " ").replace(/\s+/g, " ").trim();
}

function readRole(text: string, objectives: readonly Signal<Objective>[]): UserRole {
  const hostHit = HOST_SIGNALS.some((s) => text.includes(s));
  const renterHit = RENTER_SIGNALS.some((s) => text.includes(s));
  if (hostHit && !renterHit) {
    return objectives.some((o) => o.value === "list_space") ? "host" : "prospective_host";
  }
  if (renterHit && !hostHit) return "renter";
  if (objectives.some((o) => o.value === "earn" || o.value === "list_space")) return "prospective_host";
  if (objectives.some((o) => o.value === "store" || o.value === "find")) return "renter";
  return "undetermined";
}

function readTimeframe(text: string): Timeframe {
  const hits = collect(text, TIMEFRAME_LEXICON);
  if (hits[0]) return hits[0].value;
  if (DURATION_RE.test(text)) return "temporary";
  return "unknown";
}

function readStage(
  text: string,
  location: LocationReading,
  objectives: readonly Signal<Objective>[],
): JourneyStage {
  const hits = collect(text, STAGE_LEXICON);
  if (location.kind !== "none" && objectives.some((o) => o.value === "find" || o.value === "store")) {
    return "search";
  }
  return hits[0]?.value ?? "discovery";
}

/**
 * Reads every dimension we currently understand out of a natural-language
 * query. Multiple objectives, belongings and space types are all returned —
 * a query is never forced into a single category.
 */
export function readIntent(rawQuery: string): IntentReading {
  const query = normaliseQuery(rawQuery);
  const objectives = collect(query, OBJECTIVE_LEXICON);
  const belongings = collect(query, BELONGINGS_LEXICON);
  const spaces = collect(query, SPACE_LEXICON);
  const location = readLocation(rawQuery);
  const role = readRole(query, objectives);
  const timeframe = readTimeframe(query);
  const stage = readStage(query, location, objectives);

  const evidenceCount =
    objectives.length + belongings.length + spaces.length + (location.kind === "none" ? 0 : 1);
  const strongest = objectives[0]?.weight ?? 0;
  const confidence = Math.min(1, Math.round((strongest * 0.6 + Math.min(evidenceCount, 4) * 0.1) * 100) / 100);

  return {
    query,
    role,
    objectives,
    belongings,
    spaces,
    timeframe,
    location,
    stage,
    confidence,
    unknown: evidenceCount === 0,
  };
}

/** Convenience: does this reading carry more than one distinct objective? */
export function isMultiIntent(reading: IntentReading): boolean {
  return reading.objectives.length > 1;
}
