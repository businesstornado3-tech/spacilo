/**
 * Outcome-led discovery.
 *
 * `/tools` answers "what can EarnRoom do?". This module answers the other
 * question — "what am I trying to accomplish?" — and is the ONLY place the
 * Discover page gets its content from.
 *
 * An outcome is a user goal in the user's own words. It carries a natural
 * language `query` which is read by the existing intent engine, so the
 * supporting capabilities shown on a card are derived, never hand-maintained.
 * Adding a future outcome (prepare a home for sale, clear space before
 * renovation, optimise business storage, seasonal belongings...) is a data
 * addition here — no page, routing or engine change.
 */
import { capability, type CapabilityId } from "./capabilities";
import { readIntent } from "./intent";
import { planCapabilities } from "./matching";

export type OutcomeIntent = {
  id: string;
  /** Outcome/problem in the user's words. Never a tool name. */
  title: string;
  /** Concise explanation; may name the tool as support, not as the headline. */
  summary: string;
  /** Optional small supporting label. */
  label?: string;
  /** Natural-language phrasing handed to the intent engine. */
  query: string;
  /** The capability that leads on this outcome. */
  primary: CapabilityId;
  /** Overrides the primary capability's own call to action when set. */
  destination?: string;
  /** Whether the outcome is surfaced on Discover today. */
  publish: boolean;
};

export const OUTCOMES: readonly OutcomeIntent[] = [
  {
    id: "organise_belongings",
    title: "Organise my belongings",
    summary:
      "Photograph what you own and get a reviewed list with estimated sizes, then arrange it in SpacePlanner.",
    label: "Item Scanner + SpacePlanner",
    query: "organise my belongings and know what i have",
    primary: "item_scanner",
    publish: true,
  },
  {
    id: "moving_soon",
    title: "Arrange my stuff before moving",
    summary:
      "Work out what is coming with you, how much space it needs, and where it could go while you move.",
    label: "Item Scanner, SpacePlanner and storage search",
    query: "moving house soon and need to sort my stuff before the move",
    primary: "item_scanner",
    publish: true,
  },
  {
    id: "how_much_space",
    title: "Find out how much space I need",
    summary:
      "Turn your belongings into an estimated volume so you are not guessing at the size of space to book.",
    label: "Item Scanner and space estimation",
    query: "how much storage space do i need for my things",
    primary: "item_scanner",
    publish: true,
  },
  {
    id: "earn_from_space",
    title: "Make money from unused space",
    summary:
      "Use EarnRoom Space Estimate to see what a spare room, garage or loft could potentially earn, then list it.",
    label: "Space Estimate, then list your space",
    query: "earn money from my spare room or garage",
    primary: "space_estimate",
    publish: true,
  },
  {
    id: "storage_near_me",
    title: "Find storage near me",
    summary: "Search space offered by people nearby and compare what is actually available.",
    label: "Location search",
    query: "find storage near me",
    primary: "location_search",
    publish: true,
  },
  {
    id: "furniture_temporarily",
    title: "Store furniture temporarily",
    summary:
      "Find somewhere for furniture for a few weeks or months, and check the size you need before you book.",
    label: "Location search, with planning where it helps",
    query: "store my furniture temporarily for a few months",
    primary: "location_search",
    publish: true,
  },
  {
    id: "use_space_better",
    title: "Make better use of a garage or spare room",
    summary:
      "Scan the space you already have, see the usable volume, and plan what genuinely fits in it.",
    label: "Space Scanner, Space Estimate and SpacePlanner",
    query: "make better use of my garage or spare room",
    primary: "space_scanner",
    publish: true,
  },
  {
    id: "business_stock",
    title: "Store business stock or equipment",
    summary:
      "Find nearby space for stock, tools or equipment, and plan how much of it you need to hold.",
    label: "Location search and planning",
    query: "store business stock and equipment near my business",
    primary: "location_search",
    publish: true,
  },
  {
    id: "student_storage",
    title: "Student or short-term storage",
    summary:
      "Store belongings between terms or tenancies without committing to a long contract.",
    label: "Location search",
    query: "student storage between terms",
    primary: "location_search",
    publish: true,
  },
];

export type OutcomeCard = {
  id: string;
  title: string;
  summary: string;
  label?: string | undefined;
  /** Where the outcome sends the person next. */
  to: string;
  /** Capability names behind the outcome, derived from the intent engine. */
  capabilities: readonly string[];
};

/** The capability names the intent engine considers relevant to an outcome. */
export function outcomeCapabilities(outcome: OutcomeIntent): CapabilityId[] {
  const plan = planCapabilities(readIntent(outcome.query));
  const ids = [outcome.primary, ...(plan.primary ? [plan.primary.id] : []), ...plan.secondary.map((m) => m.id)];
  return Array.from(new Set(ids));
}

export function outcomeDestination(outcome: OutcomeIntent): string {
  return outcome.destination ?? capability(outcome.primary).cta.to;
}

export function outcomeCards(): OutcomeCard[] {
  return OUTCOMES.filter((outcome) => outcome.publish).map((outcome) => ({
    id: outcome.id,
    title: outcome.title,
    summary: outcome.summary,
    label: outcome.label,
    to: outcomeDestination(outcome),
    capabilities: outcomeCapabilities(outcome).map((id) => capability(id).name),
  }));
}
