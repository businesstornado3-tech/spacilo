/**
 * Listing quality — completeness, not judgement (Prompt 23B).
 *
 * This engine never rates a host. It reports which facts a renter needs in
 * order to decide, and which of those facts are missing. Every check is a
 * yes/no question about data that already exists, so two people looking at
 * the same listing always see the same checklist.
 */
import type { TrustSpaceInput } from "@/lib/trust/signals";

export type QualityWeight = "essential" | "recommended";

export interface QualityCheck {
  key: string;
  label: string;
  /** What the renter loses when this is missing. */
  why: string;
  /** The exact thing the host should do. */
  action: string;
  weight: QualityWeight;
  complete: boolean;
}

export interface QualitySpaceInput extends TrustSpaceInput {
  title?: string | null;
  description?: string | null;
  monthly_price_pence?: number | null;
  accepted_categories?: string[] | null;
  access_notes?: string | null;
  minimum_stay_days?: number | null;
  suitability_confirmed?: boolean;
  declarations_complete?: boolean;
}

const has = (value: unknown): boolean =>
  typeof value === "string" ? value.trim().length > 0 : value !== null && value !== undefined;

export function listingChecks(space: QualitySpaceInput): QualityCheck[] {
  const photos = space.photo_paths?.length ?? 0;
  const description = (space.description ?? "").trim();

  return [
    {
      key: "photos",
      label: "At least three photos",
      why: "Renters skip listings they can't see.",
      action: "Add photos of the space, the door and the route in.",
      weight: "essential",
      complete: photos >= 3,
    },
    {
      key: "dimensions",
      label: "Room dimensions",
      why: "Without measurements, SpaceFit can't estimate whether belongings fit.",
      action: "Measure length, width and height, or scan the space.",
      weight: "essential",
      complete: Boolean(space.length_m && space.width_m && space.height_m),
    },
    {
      key: "measurements_confirmed",
      label: "Measurements confirmed",
      why: "Confirmed figures are shown to renters as confirmed rather than estimated.",
      action: "Review the measurements and confirm them.",
      weight: "recommended",
      complete: Boolean(space.measurements_verified_at),
    },
    {
      key: "price",
      label: "Monthly price set",
      why: "A listing without a price can't be requested.",
      action: "Set the monthly price for the space.",
      weight: "essential",
      complete: (space.monthly_price_pence ?? 0) > 0,
    },
    {
      key: "description",
      label: "Description of at least 80 characters",
      why: "Short descriptions leave renters guessing about the space.",
      action: "Describe the space, what it suits and anything unusual.",
      weight: "essential",
      complete: description.length >= 80,
    },
    {
      key: "access",
      label: "Access explained",
      why: "Renters need to know how and when they'd reach their belongings.",
      action: "Choose an access type and add a short note.",
      weight: "essential",
      complete: has(space.access_type),
    },
    {
      key: "conditions",
      label: "Damp and temperature stated",
      why: "Conditions decide what can safely be stored.",
      action: "Answer the damp and temperature questions.",
      weight: "essential",
      complete: has(space.moisture_condition) && has(space.temperature_condition),
    },
    {
      key: "suitability",
      label: "Suitability answers confirmed",
      why: "Compatibility checks rely on your answers being confirmed, not proposed.",
      action: "Confirm the suitability answers on your listing.",
      weight: "essential",
      complete: space.suitability_confirmed === true,
    },
    {
      key: "declarations",
      label: "Host declarations signed",
      why: "A listing can't be published until declarations are made.",
      action: "Complete the host declarations.",
      weight: "essential",
      complete: space.declarations_complete === true,
    },
    {
      key: "categories",
      label: "Accepted item types chosen",
      why: "Renters see straight away whether their belongings are welcome.",
      action: "Pick the item types you're happy to store.",
      weight: "recommended",
      complete: (space.accepted_categories?.length ?? 0) > 0,
    },
    {
      key: "minimum_stay",
      label: "Minimum stay stated",
      why: "Avoids requests for periods you'd decline anyway.",
      action: "Set a minimum stay in days.",
      weight: "recommended",
      complete: (space.minimum_stay_days ?? 0) > 0,
    },
  ];
}

export interface QualityReport {
  checks: QualityCheck[];
  essentialMissing: QualityCheck[];
  recommendedMissing: QualityCheck[];
  /** Completed essentials out of total essentials — never a star rating. */
  completedEssentials: number;
  totalEssentials: number;
  readyToPublish: boolean;
  headline: string;
  nextAction: QualityCheck | null;
}

export function listingQuality(space: QualitySpaceInput): QualityReport {
  const checks = listingChecks(space);
  const essentials = checks.filter((check) => check.weight === "essential");
  const essentialMissing = essentials.filter((check) => !check.complete);
  const recommendedMissing = checks.filter(
    (check) => check.weight === "recommended" && !check.complete,
  );
  const completedEssentials = essentials.length - essentialMissing.length;
  const readyToPublish = essentialMissing.length === 0;

  const headline = readyToPublish
    ? recommendedMissing.length === 0
      ? "Everything renters look for is here."
      : `Ready to publish. ${recommendedMissing.length} optional ${recommendedMissing.length === 1 ? "detail" : "details"} left.`
    : `${essentialMissing.length} ${essentialMissing.length === 1 ? "essential is" : "essentials are"} missing.`;

  return {
    checks,
    essentialMissing,
    recommendedMissing,
    completedEssentials,
    totalEssentials: essentials.length,
    readyToPublish,
    headline,
    nextAction: essentialMissing[0] ?? recommendedMissing[0] ?? null,
  };
}
