/**
 * Analytics seam.
 *
 * No analytics platform is installed yet. Key interactions call `track()` with
 * a stable event name so a provider can be attached in one place later.
 *
 * NEVER pass an address, a full postcode of a host space, or any coordinate.
 * Search postcodes entered by the renter are their own input and are recorded
 * only as a district (e.g. "PO4").
 */
export type AnalyticsEvent =
  | "homepage_need_storage_selected"
  | "homepage_have_space_selected"
  | "location_search_submitted"
  | "radius_changed"
  | "filter_applied"
  | "sort_changed"
  | "map_marker_selected"
  | "search_result_selected"
  | "spacefit_explanation_opened"
  | "get_spacefit_selected"
  | "list_space_selected"
  | "storage_request_started"
  | "storage_request_submitted"
  | "storage_request_withdrawn"
  | "booking_review_opened"
  | "booking_created";

export type AnalyticsProps = Record<string, string | number | boolean | null | undefined>;

type Sink = (event: AnalyticsEvent, props?: AnalyticsProps) => void;

let sink: Sink | null = null;

/** Attach a provider once, at app start, when one is introduced. */
export function setAnalyticsSink(next: Sink | null) {
  sink = next;
}

export function track(event: AnalyticsEvent, props: AnalyticsProps = {}) {
  try {
    sink?.(event, props);
  } catch {
    /* analytics must never break the UI */
  }
}
