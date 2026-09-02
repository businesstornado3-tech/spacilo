/**
 * EarnRoom AI founder analytics.
 *
 * Built only from the canonical analytics taxonomy in
 * `src/lib/analytics/events.ts` and from domain outcomes. Where a business
 * stage exists in the product but is not instrumented, it is reported as
 * "not instrumented" rather than fabricated as zero — a founder must be able
 * to tell "nobody did this" apart from "we don't measure this".
 *
 * Privacy: these are aggregate event counts only. No camera frame, photo,
 * scan payload or item detail ever reaches founder analytics.
 */
import type { AnalyticsEvent } from "@/lib/analytics/events";

export type EventCounts = Record<string, number>;

export interface AiStage {
  /** Business-facing label. */
  label: string;
  /** Canonical event, or null where the stage is not instrumented. */
  event: AnalyticsEvent | null;
  /** Count for the period, or null when the stage is not instrumented. */
  value: number | null;
  /** Percentage of the first instrumented stage, or null when not derivable. */
  ofStart: number | null;
}

function count(counts: EventCounts | null | undefined, key: string): number {
  const value = counts?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function build(
  counts: EventCounts | null | undefined,
  spec: Array<{ label: string; event: AnalyticsEvent | null }>,
): AiStage[] {
  const first = spec.find((s) => s.event);
  const base = first?.event ? count(counts, first.event) : 0;
  return spec.map((s) => {
    if (!s.event) return { label: s.label, event: null, value: null, ofStart: null };
    const value = count(counts, s.event);
    return {
      label: s.label,
      event: s.event,
      value,
      ofStart: base > 0 ? (value / base) * 100 : null,
    };
  });
}

/**
 * Renter "Scan my stuff". Result acceptance/correction happens inside the
 * review screen and is not instrumented, so it is declared, not invented.
 */
export function renterAiFunnel(counts: EventCounts | null | undefined): AiStage[] {
  return build(counts, [
    { label: "Scan started", event: "spacefit_stuff_started" },
    { label: "Result produced", event: "spacefit_stuff_completed" },
    { label: "Result reviewed or corrected", event: null },
    { label: "Search started", event: "storage_search_started" },
    { label: "Storage request created", event: "storage_request_created" },
  ]);
}

/**
 * Host "Scan my space". Camera readiness and boundary-editor steps are not
 * separately instrumented for the host path, so they are declared as gaps.
 */
export function hostAiFunnel(counts: EventCounts | null | undefined): AiStage[] {
  return build(counts, [
    { label: "Scan started", event: "spacefit_space_started" },
    { label: "Measurement produced", event: "spacefit_space_completed" },
    { label: "Boundary confirmed", event: null },
    { label: "Listing started", event: "host_listing_started" },
    { label: "Listing published", event: "host_listing_published" },
  ]);
}

export interface AiReliabilityRow {
  label: string;
  event: AnalyticsEvent;
  value: number;
}

/**
 * Capture-layer reliability. Live Scan events are shared by both journeys and
 * are deliberately NOT attributed to renter or host.
 */
export function aiReliability(counts: EventCounts | null | undefined): AiReliabilityRow[] {
  const rows: Array<{ label: string; event: AnalyticsEvent }> = [
    { label: "Live Scan started (renter + host)", event: "live_scan_started" },
    { label: "Live Scan completed (renter + host)", event: "live_scan_completed" },
    { label: "Fell back to photo upload", event: "scan_photo_fallback_used" },
    { label: "Fell back to manual measurement", event: "scan_manual_fallback_used" },
  ];
  return rows.map((r) => ({ ...r, value: count(counts, r.event) }));
}

/** Guest preview outcomes, kept apart from the two product funnels. */
export function guestAiOutcomes(counts: EventCounts | null | undefined): AiReliabilityRow[] {
  const rows: Array<{ label: string; event: AnalyticsEvent }> = [
    { label: "Guest result viewed", event: "guest_scan_result_viewed" },
    { label: "Guest result claimed after signup", event: "guest_scan_claimed" },
  ];
  return rows.map((r) => ({ ...r, value: count(counts, r.event) }));
}

/** True when nothing at all was recorded, so the UI can show a calm message. */
export function aiSectionIsEmpty(stages: AiStage[][], extras: AiReliabilityRow[][]): boolean {
  const stageTotal = stages.flat().reduce((sum, s) => sum + (s.value ?? 0), 0);
  const extraTotal = extras.flat().reduce((sum, r) => sum + r.value, 0);
  return stageTotal === 0 && extraTotal === 0;
}
