/**
 * Trust signals — facts, not marketing claims (Prompt 23A).
 *
 * Every signal here is derived deterministically from data the platform can
 * actually stand behind: what the host measured, what the platform verified,
 * and what finished bookings produced. Nothing is scored, weighted or
 * invented, and there is no "trusted host" style badge. A missing fact is
 * reported as missing — never softened into a positive.
 */
import {
  accessTypeLabel,
  featureLabel,
  formatM3,
  type AccessTypeValue,
} from "@/lib/spaces";
import { formatRating } from "@/lib/reviews";

export type TrustTone = "verified" | "declared" | "estimated" | "absent";

export interface TrustSignal {
  key: string;
  label: string;
  detail: string;
  tone: TrustTone;
  /** Who stated this — renters deserve to know the source of every claim. */
  source: "platform" | "host" | "spacefit" | "bookings";
}

/** Wording that is never allowed on a trust surface. */
export const FORBIDDEN_TRUST_CLAIMS = [
  "100% safe",
  "guaranteed safe",
  "fully insured",
  "zero risk",
  "trusted host",
  "verified host",
  "certified",
];

export function containsForbiddenClaim(text: string): boolean {
  const lower = text.toLowerCase();
  return FORBIDDEN_TRUST_CLAIMS.some((claim) => lower.includes(claim));
}

export interface TrustSpaceInput {
  measurement_source?: string | null;
  measurements_verified_at?: string | null;
  length_m?: number | null;
  width_m?: number | null;
  height_m?: number | null;
  total_volume_m3?: number | null;
  estimated_available_volume_m3?: number | null;
  photo_paths?: string[] | null;
  features?: string[] | null;
  access_type?: AccessTypeValue | null;
  host_phone_verified?: boolean | null;
  published_at?: string | null;
  moisture_condition?: string | null;
  temperature_condition?: string | null;
  /** jsonb from `get_host_response_stats` — facts about request replies. */
  host_response_stats?: unknown;
}

export interface HostResponseStats {
  sample_size: number;
  responded_count: number;
  median_response_hours: number | null;
}

/** Too few requests to say anything honest about responsiveness. */
export const MIN_RESPONSE_SAMPLE = 3;

export function parseResponseStats(raw: unknown): HostResponseStats | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const sample = Number(record["sample_size"] ?? 0);
  if (!Number.isFinite(sample) || sample <= 0) return null;
  const responded = Number(record["responded_count"] ?? 0);
  const median = record["median_response_hours"];
  const medianHours = median === null || median === undefined ? null : Number(median);
  return {
    sample_size: Math.trunc(sample),
    responded_count: Number.isFinite(responded) ? Math.trunc(responded) : 0,
    median_response_hours:
      medianHours !== null && Number.isFinite(medianHours) ? medianHours : null,
  };
}

export function formatResponseTime(hours: number): string {
  if (hours < 1) return "under an hour";
  if (hours < 2) return "about an hour";
  if (hours < 24) return `about ${Math.round(hours)} hours`;
  const days = hours / 24;
  return days < 2 ? "about a day" : `about ${Math.round(days)} days`;
}

/**
 * Reply behaviour over the host's last 90 days of requests. Reported only
 * once there is a real sample, and never turned into a badge.
 */
export function responseSignal(space: TrustSpaceInput): TrustSignal | null {
  const stats = parseResponseStats(space.host_response_stats);
  if (!stats) return null;
  if (stats.sample_size < MIN_RESPONSE_SAMPLE) {
    return {
      key: "responsiveness",
      label: "Not enough requests to judge replies",
      detail: "This host hasn't had enough recent requests for a reliable figure.",
      tone: "absent",
      source: "platform",
    };
  }
  const percent = Math.round((stats.responded_count / stats.sample_size) * 100);
  const speed =
    stats.median_response_hours === null
      ? ""
      : ` Typically replies in ${formatResponseTime(stats.median_response_hours)}.`;
  return {
    key: "responsiveness",
    label: `Replied to ${percent}% of recent requests`,
    detail: `Based on ${stats.sample_size} requests in the last 90 days.${speed}`,
    tone: "verified",
    source: "platform",
  };
}

export interface TrustReputationInput {
  review_count?: number | null;
  average_rating?: number | null;
  completed_bookings?: number | null;
}

const measured = (space: TrustSpaceInput): boolean =>
  Boolean(space.length_m && space.width_m && space.height_m);

/** Dimensions are only "confirmed" once a human signed them off. */
export function dimensionsSignal(space: TrustSpaceInput): TrustSignal {
  if (!measured(space)) {
    return {
      key: "dimensions",
      label: "Measurements not provided",
      detail: "The host hasn't given room dimensions, so fit can't be estimated accurately.",
      tone: "absent",
      source: "host",
    };
  }
  const size = `${space.length_m}m × ${space.width_m}m × ${space.height_m}m`;
  if (space.measurements_verified_at) {
    return {
      key: "dimensions",
      label: "Measurements confirmed by the host",
      detail: `${size}. The host reviewed and confirmed these figures.`,
      tone: "verified",
      source: "host",
    };
  }
  if (space.measurement_source === "spacefit_ai") {
    return {
      key: "dimensions",
      label: "Measurements estimated by SpaceFit",
      detail: `${size}. Estimated from photos and not yet confirmed by the host.`,
      tone: "estimated",
      source: "spacefit",
    };
  }
  return {
    key: "dimensions",
    label: "Measurements stated by the host",
    detail: `${size}. Entered by the host and not independently checked.`,
    tone: "declared",
    source: "host",
  };
}

export function usableSpaceSignal(space: TrustSpaceInput): TrustSignal | null {
  const usable = space.estimated_available_volume_m3;
  if (usable === null || usable === undefined) return null;
  return {
    key: "usable_volume",
    label: `About ${formatM3(Number(usable))} usable`,
    detail: "An estimate of what's actually free to store in, after obstacles.",
    tone: "estimated",
    source: "spacefit",
  };
}

export function photoSignal(space: TrustSpaceInput): TrustSignal {
  const count = space.photo_paths?.length ?? 0;
  if (count === 0) {
    return {
      key: "photos",
      label: "No photos yet",
      detail: "This listing has no photographs of the space.",
      tone: "absent",
      source: "host",
    };
  }
  return {
    key: "photos",
    label: `${count} ${count === 1 ? "photo" : "photos"} of the space`,
    detail: "Uploaded by the host. Photos show the space, not its current contents.",
    tone: "declared",
    source: "host",
  };
}

export function phoneSignal(space: TrustSpaceInput): TrustSignal {
  return space.host_phone_verified
    ? {
        key: "phone",
        label: "Host's phone number checked",
        detail: "The host confirmed a working UK mobile number.",
        tone: "verified",
        source: "platform",
      }
    : {
        key: "phone",
        label: "Phone number not checked",
        detail: "This host hasn't completed the phone check yet.",
        tone: "absent",
        source: "platform",
      };
}

export function accessSignal(space: TrustSpaceInput): TrustSignal | null {
  if (!space.access_type) return null;
  return {
    key: "access",
    label: accessTypeLabel(space.access_type),
    detail: "How you'd reach your belongings, as described by the host.",
    tone: "declared",
    source: "host",
  };
}

export function securitySignal(space: TrustSpaceInput): TrustSignal | null {
  const features = (space.features ?? []).filter((feature) =>
    ["lockable", "cctv", "alarm", "gated", "indoor"].includes(feature),
  );
  if (features.length === 0) return null;
  return {
    key: "security",
    label: features.map(featureLabel).join(" · "),
    detail: "Stated by the host. Project Stow hasn't inspected the space.",
    tone: "declared",
    source: "host",
  };
}

export function historySignal(reputation: TrustReputationInput | null | undefined): TrustSignal {
  const completed = reputation?.completed_bookings ?? 0;
  const reviews = reputation?.review_count ?? 0;
  const rating = reputation?.average_rating ?? null;

  if (completed === 0) {
    return {
      key: "history",
      label: "No completed bookings yet",
      detail: "New listings start here. It isn't a mark against the host.",
      tone: "absent",
      source: "bookings",
    };
  }
  if (reviews === 0 || rating === null) {
    return {
      key: "history",
      label: `${completed} completed ${completed === 1 ? "booking" : "bookings"}`,
      detail: "No reviews left yet. Only renters who finished a booking can review.",
      tone: "declared",
      source: "bookings",
    };
  }
  return {
    key: "history",
    label: `${formatRating(rating)} from ${reviews} ${reviews === 1 ? "review" : "reviews"}`,
    detail: `Across ${completed} completed ${completed === 1 ? "booking" : "bookings"}.`,
    tone: "verified",
    source: "bookings",
  };
}

export interface TrustSummary {
  signals: TrustSignal[];
  /** Facts that are missing — shown honestly rather than hidden. */
  gaps: TrustSignal[];
  isNewListing: boolean;
  /** One neutral sentence. Never a claim about safety. */
  headline: string;
}

export function buildTrustSummary(
  space: TrustSpaceInput,
  reputation?: TrustReputationInput | null,
): TrustSummary {
  const all = [
    dimensionsSignal(space),
    usableSpaceSignal(space),
    photoSignal(space),
    phoneSignal(space),
    accessSignal(space),
    securitySignal(space),
    responseSignal(space),
    historySignal(reputation),
  ].filter((signal): signal is TrustSignal => signal !== null);

  const signals = all.filter((signal) => signal.tone !== "absent");
  const gaps = all.filter((signal) => signal.tone === "absent");
  const isNewListing = (reputation?.completed_bookings ?? 0) === 0;

  const headline = isNewListing
    ? "A new listing. Here's exactly what's been checked so far."
    : "Here's what's been checked, what the host has stated, and what's estimated.";

  return { signals, gaps, isNewListing, headline };
}

export const TRUST_TONE_LABEL: Record<TrustTone, string> = {
  verified: "Checked",
  declared: "Host stated",
  estimated: "Estimate",
  absent: "Not provided",
};

export const TRUST_DISCLAIMER =
  "Project Stow checks what it can and shows the rest as stated or estimated. Nothing here is a guarantee.";
