/**
 * Booking confidence — the planner's answer to "will my belongings fit?".
 *
 * Pure, deterministic and derived entirely from the plan the engine already
 * produced. The panel on a listing page renders these rows verbatim, so the
 * number a renter sees is the same number the score module computed, with no
 * marketing language layered on top.
 *
 * Suggestions are honest too: a *technique* only clears the check it actually
 * addresses, and a *remove* re-runs the whole engine without that item rather
 * than nudging a figure.
 */
import { buildPlan } from "./index";
import { bandFor, recommendationFor, earnroomScore } from "./score";
import type { CheckState, ScoreCheck, EarnRoomScore } from "./score";
import type { InventoryLine, SpacePlan, StorageSpace } from "./types";
import { itemVolume } from "./catalogue";

export type ConfidenceTone = "green" | "amber" | "red";

export function toneForScore(value: number): ConfidenceTone {
  if (value >= 78) return "green";
  if (value >= 50) return "amber";
  return "red";
}

export function toneForCheck(state: CheckState): ConfidenceTone {
  return state === "passed" ? "green" : state === "attention" ? "amber" : "red";
}

export interface ConfidenceRow {
  id: string;
  label: string;
  value: string;
  detail?: string;
  tone: ConfidenceTone;
}

export type BookingIntent = "book" | "review" | "browse";

export interface BookingCta {
  intent: BookingIntent;
  label: string;
  helper: string;
}

export function ctaFor(score: EarnRoomScore): BookingCta {
  const tone = toneForScore(score.value);
  if (tone === "green") {
    return {
      intent: "book",
      label: "Book this space",
      helper: "EarnRoom AI expects your belongings to fit with room to work.",
    };
  }
  if (tone === "amber") {
    return {
      intent: "review",
      label: "Review packing suggestions",
      helper: "It can work, but a few changes would make it comfortable.",
    };
  }
  return {
    intent: "browse",
    label: "Browse larger spaces",
    helper: "On these estimates this space is likely to be too small.",
  };
}

const checkById = (score: EarnRoomScore, id: string): ScoreCheck | undefined =>
  score.checks.find((check) => check.id === id);

const COMPLEXITY_TONE: Record<EarnRoomScore["complexity"], ConfidenceTone> = {
  Easy: "green",
  Moderate: "amber",
  Involved: "amber",
};

export interface BookingConfidence {
  score: EarnRoomScore;
  tone: ConfidenceTone;
  rows: ConfidenceRow[];
  /** Cubic metres estimated to be left over once everything is in. */
  freeSpaceM3: number;
  cta: BookingCta;
}

export function buildBookingConfidence(plan: SpacePlan, score: EarnRoomScore): BookingConfidence {
  const m = plan.metrics;
  const free = Math.max(0, Math.round((m.usableVolume - m.requiredVolume) * 10) / 10);

  const row = (id: string, label: string, fallback: string): ConfidenceRow => {
    const check = checkById(score, id);
    return {
      id,
      label,
      value: check ? stateLabel(check.state) : fallback,
      ...(check ? { detail: check.detail } : {}),
      tone: check ? toneForCheck(check.state) : "amber",
    };
  };

  const rows: ConfidenceRow[] = [
    {
      id: "compatibility",
      label: "Compatibility score",
      value: `${Math.round(m.compatibility)}/100`,
      tone: toneForScore(m.compatibility),
    },
    {
      id: "fit",
      label: "Fit",
      value: `${score.fitPercent}% of usable space`,
      detail: `About ${m.requiredVolume.toFixed(1)}m³ needed of ~${m.usableVolume.toFixed(1)}m³ usable`,
      tone: score.fitPercent <= 85 ? "green" : score.fitPercent <= 100 ? "amber" : "red",
    },
    row("door", "Door clearance", "Unknown"),
    row("walkway", "Walkway", "Unknown"),
    row("ceiling", "Ceiling", "Unknown"),
    row("weight", "Weight", "Unknown"),
    {
      id: "complexity",
      label: "Packing complexity",
      value: score.complexity,
      tone: COMPLEXITY_TONE[score.complexity],
    },
    {
      id: "free",
      label: "Estimated free space remaining",
      value: `${free.toFixed(1)}m³`,
      tone: free >= 1 ? "green" : free > 0 ? "amber" : "red",
    },
    {
      id: "recommendation",
      label: "Recommendation",
      value: score.recommendation,
      tone: toneForScore(score.value),
    },
  ];

  return { score, tone: toneForScore(score.value), rows, freeSpaceM3: free, cta: ctaFor(score) };
}

function stateLabel(state: CheckState): string {
  return state === "passed" ? "Clear" : state === "attention" ? "Needs care" : "Problem";
}

/* -------------------------------------------------------------------------
 * Suggestions
 * ---------------------------------------------------------------------- */

export type SuggestionKind = "technique" | "remove";

export interface PlannerSuggestion {
  id: string;
  label: string;
  detail: string;
  kind: SuggestionKind;
  /** Score check this technique addresses. */
  resolves?: string;
  /** Catalogue line this suggestion takes out of the plan. */
  itemId?: string;
}

/** Penalty the score module applies per check state — mirrored for relief. */
const PENALTY: Record<CheckState, number> = { passed: 0, attention: 7, failed: 22 };

const biggestLine = (lines: InventoryLine[]): InventoryLine | null =>
  [...lines].sort((a, b) => itemVolume(b.item) * b.quantity - itemVolume(a.item) * a.quantity)[0] ??
  null;

const tallestLine = (lines: InventoryLine[]): InventoryLine | null =>
  [...lines].sort((a, b) => b.item.height - a.item.height)[0] ?? null;

/** Everything EarnRoom AI can suggest for this plan, worst problem first. */
export function buildSuggestions(plan: SpacePlan, score: EarnRoomScore): PlannerSuggestion[] {
  const out: PlannerSuggestion[] = [];
  const lines = plan.lines;

  const door = checkById(score, "door");
  if (door && door.state !== "passed") {
    const widest = biggestLine(lines);
    if (widest) {
      out.push({
        id: "rotate-door",
        label: `Rotate the ${widest.item.name.toLowerCase()} through the opening`,
        detail: "Turning the longest face sideways usually clears a narrow door.",
        kind: "technique",
        resolves: "door",
      });
    }
  }

  const ceiling = checkById(score, "ceiling");
  if (ceiling && ceiling.state !== "passed") {
    const tallest = tallestLine(lines);
    if (tallest) {
      out.push({
        id: "upright-ceiling",
        label: tallest.item.standsUpright
          ? `Stand the ${tallest.item.name.toLowerCase()} vertically`
          : `Lay the ${tallest.item.name.toLowerCase()} flat`,
        detail: "Reorienting the tallest item keeps it under the ceiling.",
        kind: "technique",
        resolves: "ceiling",
      });
    }
  }

  const walkway = checkById(score, "walkway");
  if (walkway && walkway.state !== "passed") {
    out.push({
      id: "stack-boxes",
      label: "Stack boxes two high along the back wall",
      detail: "Frees the access strip so you can still reach everything.",
      kind: "technique",
      resolves: "walkway",
    });
  }

  const weight = checkById(score, "weight");
  if (weight && weight.state !== "passed") {
    out.push({
      id: "heavy-low",
      label: "Move heavy items down to the floor",
      detail: "Heavy items belong at the bottom of every stack.",
      kind: "technique",
      resolves: "weight",
    });
  }

  const fragile = checkById(score, "fragile");
  if (fragile && fragile.state !== "passed") {
    out.push({
      id: "protect-fragile",
      label: "Box and label the fragile items",
      detail: "Keeps delicate pieces off the floor and out of the walkway.",
      kind: "technique",
      resolves: "fragile",
    });
  }

  const fit = checkById(score, "fit");
  if ((fit && fit.state !== "passed") || score.fitPercent > 85) {
    const largest = biggestLine(lines);
    if (largest) {
      out.push({
        id: `remove-${largest.item.id}`,
        label: `Store the ${largest.item.name.toLowerCase()} elsewhere`,
        detail: "Loft or in-home storage for the bulkiest item frees the most volume.",
        kind: "remove",
        itemId: largest.item.id,
      });
    }
  }

  return out;
}

export interface AdjustedPlan {
  plan: SpacePlan | null;
  score: EarnRoomScore | null;
  /** Difference against the untouched plan, in score points. */
  delta: number;
}

/**
 * Re-runs the planner with the applied suggestions.
 *
 * Removals genuinely re-plan without the item; techniques clear the specific
 * check they address and hand back the penalty the score module charged for it.
 */
export function applySuggestions(
  lines: InventoryLine[],
  space: StorageSpace,
  suggestions: PlannerSuggestion[],
  appliedIds: string[],
): AdjustedPlan {
  const base = lines.length ? buildPlan(lines, space) : null;
  const baseScore = base ? earnroomScore(base) : null;
  if (!base || !baseScore) return { plan: null, score: null, delta: 0 };

  const applied = suggestions.filter((s) => appliedIds.includes(s.id));
  const removedIds = applied.filter((s) => s.kind === "remove").map((s) => s.itemId);
  const keptLines = lines.filter((line) => !removedIds.includes(line.item.id));
  if (!keptLines.length) return { plan: base, score: baseScore, delta: 0 };

  const plan = buildPlan(keptLines, space);
  const raw = earnroomScore(plan);

  const resolved = new Set(
    applied.filter((s) => s.kind === "technique" && s.resolves).map((s) => s.resolves as string),
  );

  let relief = 0;
  const checks = raw.checks.map((check) => {
    if (!resolved.has(check.id) || check.state === "passed") return check;
    relief += PENALTY[check.state];
    return {
      ...check,
      state: "passed" as CheckState,
      detail: `${check.detail} — resolved by your change`,
    };
  });

  const value = Math.max(0, Math.min(100, raw.value + relief));
  const band = bandFor(value);
  const score: EarnRoomScore = {
    ...raw,
    value,
    band,
    checks,
    recommendation: recommendationFor(band),
  };

  return { plan, score, delta: value - baseScore.value };
}

/* -------------------------------------------------------------------------
 * Comparing saved inventories against one listing
 * ---------------------------------------------------------------------- */

export interface ComparisonEntry {
  id: string;
  name: string;
  lines: InventoryLine[];
}

export interface ComparisonResult {
  id: string;
  name: string;
  score: number;
  band: EarnRoomScore["band"];
  fitPercent: number;
  itemCount: number;
  tone: ConfidenceTone;
  recommendation: string;
}

/** Scores several saved inventories against the same space, best first. */
export function compareInventories(
  entries: ComparisonEntry[],
  space: StorageSpace,
): ComparisonResult[] {
  return entries
    .filter((entry) => entry.lines.length > 0)
    .map((entry) => {
      const plan = buildPlan(entry.lines, space);
      const score = earnroomScore(plan);
      return {
        id: entry.id,
        name: entry.name,
        score: score.value,
        band: score.band,
        fitPercent: score.fitPercent,
        itemCount: plan.itemCount,
        tone: toneForScore(score.value),
        recommendation: score.recommendation,
      };
    })
    .sort((a, b) => b.score - a.score);
}
