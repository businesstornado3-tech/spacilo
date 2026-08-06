/**
 * Host trust profile presentation (Prompt 26B, Phase 3).
 *
 * Every value comes from `get_public_host_profile`, which projects only what
 * is safe to publish: first name, join month, verification state, published
 * listing count and the two existing aggregates (reputation, responsiveness).
 * No surname, no email, no phone number, no address, no social features.
 *
 * Nothing here is a guarantee — a verified phone and a good reply rate are
 * checks and facts, not a promise about a person.
 */
import { RESPONSE_MIN_SAMPLE, type ResponseAggregate } from "@/lib/trust/responsiveness";

export interface HostProfilePayload {
  first_name?: string | null;
  photo_url?: string | null;
  joined_at?: string | null;
  phone_verified?: boolean | null;
  listings_count?: number | null;
  reputation?: {
    review_count?: number | null;
    average_rating?: number | null;
    completed_bookings?: number | null;
  } | null;
  response_stats?: Partial<ResponseAggregate> | null;
}

export interface HostProfileView {
  firstName: string;
  photoUrl: string | null;
  joinedLabel: string | null;
  phoneVerified: boolean;
  listingsLabel: string;
  ratingLabel: string | null;
  reviewsLabel: string;
  responseRateLabel: string | null;
  responseTimeLabel: string | null;
  completedLabel: string;
}

function joinedLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

export function responseRateLabel(stats: Partial<ResponseAggregate> | null | undefined): string | null {
  const sample = stats?.sample_size ?? 0;
  const responded = stats?.responded_count ?? 0;
  if (sample < RESPONSE_MIN_SAMPLE) return null;
  return `${Math.round((responded / sample) * 100)}% of requests answered`;
}

export function responseTimeLabel(stats: Partial<ResponseAggregate> | null | undefined): string | null {
  const sample = stats?.sample_size ?? 0;
  const hours = stats?.median_response_hours ?? null;
  if (sample < RESPONSE_MIN_SAMPLE || hours === null) return null;
  if (hours < 1) return "Usually replies within the hour";
  if (hours < 24) return `Usually replies in about ${Math.round(hours)} hour${Math.round(hours) === 1 ? "" : "s"}`;
  const days = Math.round(hours / 24);
  return `Usually replies in about ${days} day${days === 1 ? "" : "s"}`;
}

export function hostProfileView(payload: HostProfilePayload | null | undefined): HostProfileView {
  const reviews = payload?.reputation?.review_count ?? 0;
  const average = payload?.reputation?.average_rating ?? null;
  const listings = payload?.listings_count ?? 0;
  const completed = payload?.reputation?.completed_bookings ?? 0;

  return {
    firstName: payload?.first_name?.trim() || "Your host",
    photoUrl: payload?.photo_url ?? null,
    joinedLabel: joinedLabel(payload?.joined_at),
    phoneVerified: Boolean(payload?.phone_verified),
    listingsLabel: `${listings} published listing${listings === 1 ? "" : "s"}`,
    ratingLabel: reviews > 0 && average !== null ? Number(average).toFixed(1) : null,
    reviewsLabel: reviews === 0 ? "No reviews yet" : `${reviews} review${reviews === 1 ? "" : "s"}`,
    responseRateLabel: responseRateLabel(payload?.response_stats),
    responseTimeLabel: responseTimeLabel(payload?.response_stats),
    completedLabel:
      completed === 0
        ? "No completed bookings yet"
        : `${completed} completed booking${completed === 1 ? "" : "s"}`,
  };
}
