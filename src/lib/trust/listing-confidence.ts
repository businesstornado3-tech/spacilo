/**
 * Consolidated listing SpaceFit confidence (Prompt 23).
 *
 * One place that turns the EXISTING authoritative results — the SpaceFit
 * engine (FIT), the storage policy screening (POLICY) and the host's declared
 * suitability (SUITABILITY) — into a single, immediately readable decision
 * section.
 *
 * This module invents nothing. It runs no engine of its own, makes no network
 * call, asks no model anything, and never converts a warning into a tick. Every
 * sentence it produces is derived from data the platform can point at, and
 * provenance is preserved: an AI proposal stays "estimated", only an explicit
 * host confirmation reads as "host-confirmed".
 */
import { accessTypeLabel, featureLabel, type AccessTypeValue } from "@/lib/spaces";
import { compatibilityOutcome, type CompatibilityOutcome, type ScreeningSummary } from "@/lib/policy/engine";
import type { CompatibilityReport } from "@/lib/policy/types";
import type { SpaceFitResult } from "@/lib/spacefit/types";
import { hostMeasurementStatus, type HostSpaceLike } from "@/lib/spacefit-hub";

/** Every state a single check can be in. Missing data is UNKNOWN, never a tick. */
export type CheckState = "pass" | "note" | "action" | "fail" | "blocked" | "unknown";

/** Textual status, so the meaning never depends on colour or icon alone. */
export const CHECK_STATE_TEXT: Record<CheckState, string> = {
  pass: "OK",
  note: "Note",
  action: "Action required",
  fail: "Not suitable",
  blocked: "Blocked",
  unknown: "Not known",
};

export type CheckKey = "fit" | "policy" | "suitability";

export interface ConfidenceCheck {
  key: CheckKey;
  /** Short row label, e.g. "Fits your items". */
  label: string;
  state: CheckState;
  /** Spoken/plain status, e.g. "Action required". */
  statusText: string;
  detail: string;
}

export interface ConfidenceValue {
  label: string;
  /** Formatted for display, or null when genuinely unknown. */
  value: string | null;
  /** Where the number came from, in the renter's words. */
  provenance: string;
}

export interface ListingConfidence {
  outcome: CompatibilityOutcome;
  /** True when nothing blocks and nothing needs the renter's attention. */
  positive: boolean;
  checks: ConfidenceCheck[];
  requirement: ConfidenceValue;
  capacity: ConfidenceValue;
}

const round1 = (value: number) => `${(Math.round(value * 10) / 10).toFixed(1)} m³`;

/** FIT — the SpaceFit engine's own verdict, never re-derived here. */
function fitCheck(report: CompatibilityReport, spaceFit: SpaceFitResult | null): ConfidenceCheck {
  if (!spaceFit || spaceFit.score === null) {
    if (spaceFit && !spaceFit.compatible) {
      return {
        key: "fit",
        label: "Fits your items",
        state: "fail",
        statusText: CHECK_STATE_TEXT.fail,
        detail:
          spaceFit.hard_failures[0]?.message ??
          "SpaceFit can't fit your current items into this space.",
      };
    }
    return {
      key: "fit",
      label: "Fits your items",
      state: "unknown",
      statusText: CHECK_STATE_TEXT.unknown,
      detail: report.physical.detail,
    };
  }
  if (report.physical.status === "not_compatible") {
    return {
      key: "fit",
      label: "Space too small for your items",
      state: "fail",
      statusText: CHECK_STATE_TEXT.fail,
      detail: report.physical.detail,
    };
  }
  if (report.physical.status === "compatible_with_care") {
    return {
      key: "fit",
      label: "Fits your items, with care",
      state: "note",
      statusText: CHECK_STATE_TEXT.note,
      detail: report.physical.detail,
    };
  }
  return {
    key: "fit",
    label: "Fits your items",
    state: "pass",
    statusText: CHECK_STATE_TEXT.pass,
    detail: report.physical.detail,
  };
}

/** POLICY — the deterministic screening result, in neutral language. */
function policyCheck(report: CompatibilityReport, screening: ScreeningSummary): ConfidenceCheck {
  if (screening.blocked || report.policy.status === "not_compatible") {
    return {
      key: "policy",
      label: "Blocked by storage policy",
      state: "blocked",
      statusText: CHECK_STATE_TEXT.blocked,
      detail: report.policy.detail,
    };
  }
  if (screening.actionRequired) {
    return {
      key: "policy",
      label: "Storage policy",
      state: "action",
      statusText: CHECK_STATE_TEXT.action,
      detail: report.policy.detail,
    };
  }
  if (!screening.available) {
    return {
      key: "policy",
      label: "Storage policy",
      state: "unknown",
      statusText: CHECK_STATE_TEXT.unknown,
      detail: report.policy.detail,
    };
  }
  return {
    key: "policy",
    label: "Storage policy",
    state: "pass",
    statusText: CHECK_STATE_TEXT.pass,
    detail: report.policy.detail,
  };
}

/** SUITABILITY — what the host declared about the space, not an AI opinion. */
function suitabilityCheck(report: CompatibilityReport): ConfidenceCheck {
  if (report.suitability.status === "not_compatible") {
    return {
      key: "suitability",
      label: "Space suitability",
      state: "fail",
      statusText: CHECK_STATE_TEXT.fail,
      detail: report.suitability.detail,
    };
  }
  if (report.suitability.reasons.includes("suitability_unknown")) {
    return {
      key: "suitability",
      label: "Space suitability",
      state: "unknown",
      statusText: CHECK_STATE_TEXT.unknown,
      detail: report.suitability.detail,
    };
  }
  if (report.suitability.status === "compatible_with_care") {
    return {
      key: "suitability",
      label: "Suitability note",
      state: "note",
      statusText: CHECK_STATE_TEXT.note,
      detail: report.suitability.detail,
    };
  }
  return {
    key: "suitability",
    label: "Space suitability",
    state: "pass",
    statusText: CHECK_STATE_TEXT.pass,
    detail: report.suitability.detail,
  };
}

/** How a capacity figure should be described, preserving provenance. */
export function capacityProvenance(space: HostSpaceLike): string {
  switch (hostMeasurementStatus(space)) {
    case "host_verified":
      return "Host-confirmed measurements";
    case "host_entered":
      return "Entered by the host";
    case "ai_estimate":
      return "Estimated by Spacilo AI — not yet confirmed by the host";
    default:
      return "Not measured yet";
  }
}

export function buildListingConfidence(input: {
  report: CompatibilityReport;
  screening: ScreeningSummary;
  spaceFit: SpaceFitResult | null;
  /** The renter's estimated storage requirement, m³. */
  requirementM3: number | null;
  space: HostSpaceLike;
}): ListingConfidence {
  const checks = [
    fitCheck(input.report, input.spaceFit),
    policyCheck(input.report, input.screening),
    suitabilityCheck(input.report),
  ];
  const { outcome } = compatibilityOutcome(input.report, input.screening);
  const capacityRaw =
    input.space.estimated_available_volume_m3 === null ||
    input.space.estimated_available_volume_m3 === undefined
      ? null
      : Number(input.space.estimated_available_volume_m3);

  return {
    outcome,
    positive: outcome === "strong_match" || outcome === "match_with_notes",
    checks,
    requirement: {
      label: "Your estimated requirement",
      value: input.requirementM3 === null ? null : round1(input.requirementM3),
      provenance: "Estimated from the items you've confirmed in My Stuff",
    },
    capacity: {
      label: "Available usable capacity",
      value: capacityRaw === null || !Number.isFinite(capacityRaw) ? null : round1(capacityRaw),
      provenance: capacityProvenance(input.space),
    },
  };
}

/* ------------------------------------------------------- why this space */

export type WhyTone = "positive" | "caution" | "negative";

export interface WhySection {
  title: string;
  tone: WhyTone;
  reasons: string[];
}

const WHY_TITLE: Record<WhyTone, string> = {
  positive: "Why this space may work",
  caution: "Things to consider",
  negative: "This space may not match your current needs",
};

/** Facts about the listing itself, only where the host actually stated them. */
function listingFacts(space: HostSpaceLike, capacityCovers: boolean | null): string[] {
  const facts: string[] = [];
  if (capacityCovers === true) facts.push("Enough usable capacity for your current items");
  const features = space.features ?? [];
  for (const feature of ["indoor", "dry", "lockable", "ground_floor", "cctv", "alarm", "gated"]) {
    if (features.includes(feature)) facts.push(featureLabel(feature));
  }
  if (space.access_type) facts.push(`${accessTypeLabel(space.access_type as AccessTypeValue)} access`);
  const measurement = hostMeasurementStatus(space);
  if (measurement === "host_verified") facts.push("Host-confirmed dimensions");
  else if (measurement === "host_entered") facts.push("Dimensions entered by the host");
  else if (measurement === "ai_estimate")
    facts.push("Dimensions estimated by Spacilo AI — not yet confirmed by the host");
  return facts;
}

/**
 * The state-aware reasons section. A negative compatibility never keeps the
 * "Why this space may work" heading.
 */
export function buildWhySection(input: {
  confidence: ListingConfidence;
  spaceFit: SpaceFitResult | null;
  space: HostSpaceLike;
  /** Renter requirement vs stated capacity, when both are known. */
  capacityCovers: boolean | null;
  limit?: number;
}): WhySection {
  const { confidence, spaceFit } = input;
  const blocking = confidence.checks.filter(
    (check) => check.state === "fail" || check.state === "blocked",
  );
  const notes = confidence.checks.filter(
    (check) => check.state === "note" || check.state === "action",
  );

  if (blocking.length > 0) {
    const reasons = [
      ...blocking.map((check) => `${check.label} — ${check.detail}`),
      ...(spaceFit?.hard_failures ?? []).map((failure) => failure.message),
    ];
    return { title: WHY_TITLE.negative, tone: "negative", reasons: dedupe(reasons) };
  }

  if (notes.length > 0) {
    const reasons = [
      ...notes.map((check) => `${check.label} — ${check.detail}`),
      ...(spaceFit?.warnings ?? []),
    ];
    return { title: WHY_TITLE.caution, tone: "caution", reasons: dedupe(reasons) };
  }

  const reasons = dedupe([
    ...listingFacts(input.space, input.capacityCovers),
    ...(spaceFit?.positives ?? []),
  ]);
  return {
    title: WHY_TITLE.positive,
    tone: "positive",
    reasons: reasons.slice(0, input.limit ?? 6),
  };
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = value.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

/** Copy shown when the renter has nothing in My Stuff yet. Never a fake match. */
export const NO_INVENTORY_COPY = {
  title: "Scan my stuff",
  body: "SpaceFit can estimate how much space you need and check this listing against your own items. Nothing is checked until you add them.",
  cta: "Scan my stuff",
} as const;
