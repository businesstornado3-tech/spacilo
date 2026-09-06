/**
 * Content coverage, duplication and fatigue protection.
 *
 * Stops the engine repeatedly marketing the same place with the same angle,
 * and keeps UK coverage balanced so one strong location cannot absorb all
 * activity. Pure module.
 */
import { UK_PLACES } from "@/lib/discovery/locations";
import type { MarketingOpportunity } from "./types";

export type ContentHistoryEntry = {
  campaignId: string;
  planDate: string;
  /** Opportunity key the campaign was built from. */
  opportunityKey: string;
  topic: string;
  locationSlug: string | null;
  audience: string;
  trigger: string;
  hook: string;
  publishedAt: number | null;
};

export type CoverageRow = {
  slug: string;
  name: string;
  campaigns: number;
  /** Days since the most recent campaign for this place, or null. */
  daysSinceLast: number | null;
  state: "UNCOVERED" | "FRESH" | "RECENT" | "OVERREPRESENTED";
};

function normalise(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Token overlap 0..1 — cheap, deterministic near-duplicate detection. */
export function similarity(a: string, b: string): number {
  const left = new Set(normalise(a).split(" ").filter(Boolean));
  const right = new Set(normalise(b).split(" ").filter(Boolean));
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared / Math.max(left.size, right.size);
}

export type DuplicationVerdict = {
  /** 0..1 — how similar this opportunity is to recent content. */
  risk: number;
  blocked: boolean;
  reasons: readonly string[];
  /** Suggested change when the risk is high. */
  suggestion: string | null;
};

export function duplicationRisk(
  opportunity: MarketingOpportunity,
  history: readonly ContentHistoryEntry[],
  options: { now: number; windowDays?: number } ,
): DuplicationVerdict {
  const windowMs = (options.windowDays ?? 30) * 86_400_000;
  const recent = history.filter((entry) => options.now - Date.parse(`${entry.planDate}T00:00:00Z`) <= windowMs);
  const reasons: string[] = [];
  let risk = 0;

  for (const entry of recent) {
    if (entry.opportunityKey === opportunity.key) {
      risk = Math.max(risk, 1);
      reasons.push(`Same opportunity already ran on ${entry.planDate}.`);
      continue;
    }
    const sameLocation = entry.locationSlug && entry.locationSlug === (opportunity.location?.slug ?? null);
    const topicMatch = similarity(entry.topic, opportunity.topic);
    const audienceMatch = entry.audience === opportunity.audience;
    let pairRisk = topicMatch * 0.6;
    if (sameLocation) pairRisk += 0.25;
    if (audienceMatch) pairRisk += 0.15;
    if (pairRisk > risk) {
      risk = Math.min(1, pairRisk);
      if (pairRisk >= 0.6) {
        reasons.push(
          `Close to "${entry.topic}"${entry.locationSlug ? ` in ${entry.locationSlug}` : ""} from ${entry.planDate}.`,
        );
      }
    }
  }

  const blocked = risk >= 0.85;
  return {
    risk: Number(risk.toFixed(2)),
    blocked,
    reasons,
    suggestion: risk >= 0.6 ? "Change the angle, audience, location or format before publishing." : null,
  };
}

/** UK-wide coverage picture used by the founder console and the balancer. */
export function coverageRows(
  history: readonly ContentHistoryEntry[],
  options: { now: number; recentDays?: number },
): CoverageRow[] {
  const recentDays = options.recentDays ?? 30;
  const byPlace = new Map<string, { count: number; latest: number }>();

  for (const entry of history) {
    if (!entry.locationSlug) continue;
    const at = Date.parse(`${entry.planDate}T00:00:00Z`);
    const existing = byPlace.get(entry.locationSlug);
    byPlace.set(entry.locationSlug, {
      count: (existing?.count ?? 0) + 1,
      latest: Math.max(existing?.latest ?? 0, Number.isNaN(at) ? 0 : at),
    });
  }

  return UK_PLACES.filter((place) => place.kind === "city" || place.kind === "town").map((place) => {
    const record = byPlace.get(place.slug);
    const daysSinceLast = record?.latest ? Math.floor((options.now - record.latest) / 86_400_000) : null;
    const state: CoverageRow["state"] =
      !record ? "UNCOVERED"
      : record.count >= 4 && (daysSinceLast ?? 999) <= recentDays ? "OVERREPRESENTED"
      : (daysSinceLast ?? 999) <= 7 ? "RECENT"
      : "FRESH";
    return { slug: place.slug, name: place.name, campaigns: record?.count ?? 0, daysSinceLast, state };
  });
}

/**
 * Multiplier applied to an opportunity's score so a heavily covered place is
 * deprioritised without ever being permanently excluded.
 */
export function geographicBalance(
  opportunity: MarketingOpportunity,
  rows: readonly CoverageRow[],
  cooldownDays: number,
): { multiplier: number; note: string } {
  const slug = opportunity.location?.slug;
  if (!slug) return { multiplier: 1, note: "UK-wide campaign — no local balancing applied." };
  const row = rows.find((candidate) => candidate.slug === slug);
  if (!row || row.state === "UNCOVERED") return { multiplier: 1.1, note: "No marketing coverage here yet." };
  if (row.state === "OVERREPRESENTED") return { multiplier: 0.55, note: "This location is already heavily covered." };
  if (row.daysSinceLast !== null && row.daysSinceLast < cooldownDays) {
    return { multiplier: 0.7, note: `Covered ${row.daysSinceLast} day(s) ago — inside the cooldown window.` };
  }
  return { multiplier: 1, note: "Coverage is balanced for this location." };
}
