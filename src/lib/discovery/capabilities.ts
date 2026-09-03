/**
 * The EarnRoom capability graph.
 *
 * A capability is a real thing the product can do for someone. The discovery
 * engine matches intent against THIS registry — adding a future capability is
 * a data change here, never a rewrite of the matching, scoring, page or
 * linking layers.
 *
 * Every claim in `purpose`/`outcome` must be something the product actually
 * does today. No aspirational descriptions.
 */
import type { Objective, JourneyStage, UserRole } from "./taxonomy";

export type CapabilityId =
  | "item_scanner"
  | "space_scanner"
  | "spaceplanner"
  | "space_estimate"
  | "location_search";

export type Capability = {
  id: CapabilityId;
  /** Slug under /tools/. */
  slug: string;
  name: string;
  /** One sentence: what it does. */
  purpose: string;
  /** Who it primarily serves. */
  audience: UserRole;
  /** Problem it solves, in the searcher's words. */
  problem: string;
  inputs: readonly string[];
  howItWorks: readonly string[];
  outcome: string;
  /** What it deliberately does NOT do — keeps the page honest. */
  limits: readonly string[];
  cta: { label: string; to: string };
  /** Objectives this capability genuinely serves. */
  objectives: readonly Objective[];
  /** Journey stages where it is the most useful next step. */
  stages: readonly JourneyStage[];
  /** Natural-language signals, matched as whole phrases. */
  signals: readonly string[];
  /** The capability a user most often needs next. */
  nextCapabilities: readonly CapabilityId[];
};

export const CAPABILITIES: readonly Capability[] = [
  {
    id: "item_scanner",
    slug: "item-scanner",
    name: "Item Scanner",
    purpose: "Identifies and itemises your belongings from photos so you know what you actually have.",
    audience: "renter",
    problem: "You do not have a clear list of what you own, or how much of it there is.",
    inputs: ["Photos of your belongings", "Optional manual additions and quantities"],
    howItWorks: [
      "You photograph or upload the belongings you want to account for.",
      "EarnRoom AI proposes items, quantities and approximate sizes.",
      "You review and correct every proposal — nothing is treated as measured until you confirm it.",
    ],
    outcome: "A reviewed inventory with an estimated total volume for your belongings.",
    limits: [
      "Sizes are AI estimates you confirm, not measurements.",
      "It does not value your belongings or arrange insurance.",
    ],
    cta: { label: "Scan your items", to: "/spacefit/stuff" },
    objectives: ["identify", "organise", "manage_inventory", "declutter", "move", "estimate"],
    stages: ["discovery", "education", "measurement", "planning"],
    signals: [
      "what do i have",
      "what i have",
      "list my belongings",
      "inventory",
      "catalogue",
      "itemise",
      "itemize",
      "organise my stuff",
      "organise my belongings",
      "organize my stuff",
      "organize my belongings",
      "declutter",
      "sort out my things",
      "what's in my garage",
      "what is in my garage",
      "in storage",
    ],
    nextCapabilities: ["spaceplanner", "location_search"],
  },
  {
    id: "space_scanner",
    slug: "space-scanner",
    name: "Space Scanner",
    purpose: "Reads a room, garage, loft or shed from photos and estimates the usable space in it.",
    audience: "host",
    problem: "You do not know how much usable space you have, or how much would fit in it.",
    inputs: ["Photos of the space", "Optional corrections to dimensions and access details"],
    howItWorks: [
      "You photograph the space you are thinking about using.",
      "EarnRoom AI estimates floor area, usable volume and access constraints.",
      "You confirm or correct the figures before anything depends on them.",
    ],
    outcome: "An estimated usable volume and access profile for that space.",
    limits: [
      "Estimates are a starting point you check, not a survey.",
      "It does not assess structural safety, damp or suitability for any particular item.",
    ],
    cta: { label: "Scan your space", to: "/spacefit/space" },
    objectives: ["measure", "estimate", "free_up_space", "optimise_space", "list_space"],
    stages: ["discovery", "measurement", "estimation", "listing"],
    signals: [
      "how much space do i have",
      "how much room do i have",
      "measure my garage",
      "measure my room",
      "measure a room",
      "size of my garage",
      "how big is my",
      "usable space",
      "available space in my",
      "how many boxes fit",
      "how many boxes can fit",
      "prepare my garage",
    ],
    nextCapabilities: ["spaceplanner", "space_estimate"],
  },
  {
    id: "spaceplanner",
    slug: "spaceplanner",
    name: "SpacePlanner AI",
    purpose: "Works out whether your belongings fit a given space and how they can be arranged in it.",
    audience: "undetermined",
    problem: "You do not know whether everything fits, or how to arrange it so it does.",
    inputs: ["Your items and their sizes", "The space you want to use"],
    howItWorks: [
      "You bring in items — from the Item Scanner or added by hand.",
      "You choose a space, either one you scanned or one from the marketplace.",
      "SpacePlanner calculates fit deterministically and proposes an arrangement you can adjust.",
    ],
    outcome: "A fit result, the space left over, and a layout you can act on.",
    limits: [
      "Fit is calculated from the sizes you confirmed; wrong inputs give wrong answers.",
      "A plan is not a booking and does not reserve anything.",
    ],
    cta: { label: "Try SpacePlanner", to: "/spacefit/stuff" },
    objectives: ["plan", "fit", "organise", "optimise_space", "estimate", "move", "compare"],
    stages: ["planning", "estimation", "comparison"],
    signals: [
      "fit",
      "will it fit",
      "how do i fit",
      "arrange",
      "arrangement",
      "layout",
      "plan my storage",
      "storage plan",
      "maximise space",
      "maximize space",
      "make the most of",
      "organise my garage",
      "organize my garage",
      "how much storage do i need",
      "how much space do i need",
      "how much room do i need",
      "space for a 3 bed",
      "space do 50 boxes",
      "packing",
    ],
    nextCapabilities: ["location_search", "space_estimate"],
  },
  {
    id: "space_estimate",
    slug: "space-estimate",
    name: "Space Estimate",
    purpose: "Estimates what a space you are not using could be worth as storage, from its size and details.",
    audience: "prospective_host",
    problem: "You have space you are not using and no idea what it could be worth.",
    inputs: ["The size and type of your space", "Access details and what you would accept"],
    howItWorks: [
      "You describe or scan the space you are not using.",
      "EarnRoom estimates a price range from the space's own characteristics.",
      "You decide whether to list it, and you set your own price.",
    ],
    outcome: "An estimated monthly price range for that specific space.",
    limits: [
      "An estimate is not an offer, a guarantee or a forecast of demand.",
      "Nothing is earned until a real booking is made and completed.",
    ],
    cta: { label: "Estimate your space", to: "/spacefit/space" },
    objectives: ["earn", "estimate", "list_space", "free_up_space"],
    stages: ["discovery", "estimation", "listing"],
    signals: [
      "make money",
      "earn",
      "earning",
      "income",
      "rent out",
      "rent my",
      "monetise",
      "monetize",
      "what could my space",
      "worth",
      "side income",
      "extra income",
      "unused space",
      "empty garage",
      "spare room",
    ],
    nextCapabilities: ["space_scanner", "location_search"],
  },
  {
    id: "location_search",
    slug: "location-search",
    name: "Location Search",
    purpose: "Finds storage space published by nearby hosts, with distance, price and fit shown up front.",
    audience: "renter",
    problem: "You need somewhere to put your things and want to see what is genuinely available.",
    inputs: ["A UK postcode or area", "Optional filters for space type, size and dates"],
    howItWorks: [
      "You enter an area or postcode.",
      "EarnRoom shows published spaces nearby with approximate distance and price.",
      "You can check fit against your own items before you request anything.",
    ],
    outcome: "A list of real published spaces you can request.",
    limits: [
      "Only spaces hosts have actually published appear — availability varies by area.",
      "Exact addresses are only shared once a booking is confirmed.",
    ],
    cta: { label: "Search storage", to: "/search" },
    objectives: ["find", "store", "compare", "relocate", "move", "protect"],
    stages: ["search", "comparison", "transaction"],
    signals: [
      "storage near",
      "storage in",
      "where can i store",
      "somewhere to store",
      "place to store",
      "find storage",
      "store my",
      "storage for",
      "self storage",
      "storage unit",
      "available space",
    ],
    nextCapabilities: ["spaceplanner"],
  },
] as const;

const BY_ID = new Map(CAPABILITIES.map((c) => [c.id, c] as const));
const BY_SLUG = new Map(CAPABILITIES.map((c) => [c.slug, c] as const));

export function capability(id: CapabilityId): Capability {
  const found = BY_ID.get(id);
  if (!found) throw new Error(`Unknown capability: ${id}`);
  return found;
}

export function capabilityBySlug(slug: string): Capability | null {
  return BY_SLUG.get(slug.trim().toLowerCase()) ?? null;
}

export const CAPABILITY_IDS: readonly CapabilityId[] = CAPABILITIES.map((c) => c.id);
