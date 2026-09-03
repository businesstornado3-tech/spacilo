/**
 * Phase 9 — intent taxonomy.
 *
 * Deliberately *open*: every dimension is a union of the values we currently
 * recognise plus `(string & {})`, so a new objective, object or space type can
 * be observed and recorded by the discovery loop without a rewrite. Nothing in
 * this file decides what gets published — it only describes what a search
 * might be about.
 */

type Open<T extends string> = T | (string & {});

/** A. Who the searcher probably is. */
export type UserRole = "renter" | "host" | "prospective_host" | "undetermined";

/** B. What they are trying to do. */
export type Objective = Open<
  | "store"
  | "organise"
  | "identify"
  | "measure"
  | "estimate"
  | "plan"
  | "fit"
  | "compare"
  | "find"
  | "earn"
  | "list_space"
  | "move"
  | "declutter"
  | "renovate"
  | "downsize"
  | "relocate"
  | "manage_inventory"
  | "protect"
  | "free_up_space"
  | "optimise_space"
>;

/** C. What belongings are involved. */
export type BelongingCategory = Open<
  | "furniture"
  | "sofa"
  | "bed"
  | "wardrobe"
  | "table"
  | "boxes"
  | "clothing"
  | "documents"
  | "household"
  | "business_inventory"
  | "equipment"
  | "seasonal"
  | "student"
  | "vehicle_related"
>;

/** D. What kind of space is involved. */
export type SpaceKind = Open<
  | "room"
  | "garage"
  | "loft"
  | "shed"
  | "basement"
  | "attic"
  | "spare_room"
  | "warehouse"
  | "office"
  | "storage_unit"
>;

/** E. The underlying problem behind the words. Open by design. */
export type ProblemConcept = Open<
  | "underused_space"
  | "unknown_capacity"
  | "capacity_shortfall"
  | "business_overflow"
  | "excess_inventory"
  | "commercial_space_optimisation"
  | "monetisation_unknown"
  | "disorganisation"
  | "transition"
  | "needs_somewhere_to_store"
>;

/** E2. Who the searcher is acting as, when the query supports a conclusion. */
export type AudienceSegment = Open<"household" | "business" | "student" | "undetermined">;

/** F. Time horizon. */
export type Timeframe = Open<"short_term" | "long_term" | "temporary" | "moving_period" | "seasonal" | "unknown">;

/** G. Where in the journey the searcher is. */
export type JourneyStage = Open<
  "discovery" | "education" | "planning" | "measurement" | "estimation" | "comparison" | "search" | "transaction" | "listing"
>;


/**
 * A single dimension reading with the evidence that produced it. Keeping the
 * matched token makes every downstream decision traceable rather than magic.
 */
export type Signal<T extends string> = {
  value: T;
  /** 0..1 — how strongly the query supports this reading. */
  weight: number;
  /** The literal phrase in the query that produced it. */
  evidence: string;
};

export const ALL_USER_ROLES: readonly UserRole[] = [
  "renter",
  "host",
  "prospective_host",
  "undetermined",
] as const;

/** Dimensions the engine currently reads. New dimensions may be appended. */
export const INTENT_DIMENSIONS = [
  "role",
  "objective",
  "belongings",
  "space",
  "location",
  "timeframe",
  "journey_stage",
  "problem",
  "segment",
] as const;


export type IntentDimension = (typeof INTENT_DIMENSIONS)[number];
