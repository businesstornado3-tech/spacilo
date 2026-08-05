/**
 * SpaceFit — host pricing guidance and earnings calculator (`spacefit-price-v1`).
 *
 * Two separate jobs, kept in one module because they share the same rate model:
 *
 *  1. SUGGEST a monthly price for a space, from its usable volume, type,
 *     condition and access. This is GUIDANCE ONLY — it is derived from the
 *     space's own attributes, NOT from market data, competitor pricing or any
 *     claim about what other hosts charge. The host always sets the final price.
 *
 *  2. PROJECT earnings over 1, 3, 6 and 12 months at a chosen occupancy.
 *     The renter pays the Spacilo service fee ON TOP of the storage price,
 *     so a host keeps 100% of the price they set (see `src/lib/payments/fees.ts`).
 *
 * Deterministic and pure: no AI, no randomness, no network calls.
 */
import { serviceFeePence } from "@/lib/payments/fees";

export const SPACEFIT_PRICE_VERSION = "spacefit-price-v1";

/** Guide rate per usable m³ per month, in pence, by space type. */
export const BASE_RATE_PENCE_PER_M3: Record<string, number> = {
  garage: 850,
  spare_room: 1100,
  storage_room: 1000,
  loft: 650,
  basement: 800,
  shed: 700,
  outbuilding: 750,
  commercial: 1200,
  other: 800,
};

export const DEFAULT_BASE_RATE_PENCE_PER_M3 = 800;

/** Sensible UK floor and ceiling so guidance never looks absurd. */
export const MIN_SUGGESTED_MONTHLY_PENCE = 1500;
export const MAX_SUGGESTED_MONTHLY_PENCE = 100_000;

/** Multipliers applied to the base rate. Each is additive to a running total. */
export const PRICE_UPLIFTS = {
  dry: 0.08,
  heated: 0.08,
  independentAccess: 0.1,
  daytimeAccess: 0.04,
  security: 0.05,
  groundFloor: 0.03,
} as const;

export interface PriceSuggestionInput {
  usableVolumeM3: number | null;
  spaceType: string | null;
  accessType: string | null;
  moistureCondition: string | null;
  temperatureCondition: string | null;
  features: string[] | null;
}

export interface PriceSuggestion {
  algorithm: typeof SPACEFIT_PRICE_VERSION;
  /** null when there isn't enough information to guide at all. */
  suggestedMonthlyPence: number | null;
  lowMonthlyPence: number | null;
  highMonthlyPence: number | null;
  suggestedWeeklyPence: number | null;
  suggestedDailyPence: number | null;
  baseRatePencePerM3: number;
  /** Human-readable reasons the guide moved up or down. */
  factors: { label: string; effect: string }[];
  notes: string[];
}

const SECURITY_FEATURES = ["cctv", "alarm", "gated", "lighting", "smoke_alarm"];

/** Rounds to the nearest 50p so guidance reads like a real price. */
const roundPence = (pence: number) => Math.round(pence / 50) * 50;

const clamp = (pence: number) =>
  Math.min(MAX_SUGGESTED_MONTHLY_PENCE, Math.max(MIN_SUGGESTED_MONTHLY_PENCE, pence));

export function suggestPrice(input: PriceSuggestionInput): PriceSuggestion {
  const baseRate =
    (input.spaceType ? BASE_RATE_PENCE_PER_M3[input.spaceType] : undefined) ??
    DEFAULT_BASE_RATE_PENCE_PER_M3;

  const factors: { label: string; effect: string }[] = [];
  const notes: string[] = [];
  const features = input.features ?? [];

  if (!input.usableVolumeM3 || input.usableVolumeM3 <= 0) {
    return {
      algorithm: SPACEFIT_PRICE_VERSION,
      suggestedMonthlyPence: null,
      lowMonthlyPence: null,
      highMonthlyPence: null,
      suggestedWeeklyPence: null,
      suggestedDailyPence: null,
      baseRatePencePerM3: baseRate,
      factors,
      notes: ["Add your measurements and we can suggest a starting price."],
    };
  }

  let multiplier = 1;

  if (input.moistureCondition === "dry") {
    multiplier += PRICE_UPLIFTS.dry;
    factors.push({ label: "Confirmed dry", effect: `+${pct(PRICE_UPLIFTS.dry)}` });
  }
  if (input.temperatureCondition === "normal_indoor") {
    multiplier += PRICE_UPLIFTS.heated;
    factors.push({ label: "Normal indoor temperature", effect: `+${pct(PRICE_UPLIFTS.heated)}` });
  }
  if (input.accessType === "anytime" || input.accessType === "independent") {
    multiplier += PRICE_UPLIFTS.independentAccess;
    factors.push({ label: "Independent access", effect: `+${pct(PRICE_UPLIFTS.independentAccess)}` });
  } else if (input.accessType === "daytime") {
    multiplier += PRICE_UPLIFTS.daytimeAccess;
    factors.push({ label: "Daytime access", effect: `+${pct(PRICE_UPLIFTS.daytimeAccess)}` });
  }
  if (features.some((feature) => SECURITY_FEATURES.includes(feature))) {
    multiplier += PRICE_UPLIFTS.security;
    factors.push({ label: "Security features", effect: `+${pct(PRICE_UPLIFTS.security)}` });
  }
  if (features.includes("ground_floor")) {
    multiplier += PRICE_UPLIFTS.groundFloor;
    factors.push({ label: "Ground floor", effect: `+${pct(PRICE_UPLIFTS.groundFloor)}` });
  }

  const raw = input.usableVolumeM3 * baseRate * multiplier;
  const suggested = clamp(roundPence(raw));

  if (suggested === MIN_SUGGESTED_MONTHLY_PENCE && raw < MIN_SUGGESTED_MONTHLY_PENCE) {
    notes.push("This is a small space, so we've suggested our minimum starting price.");
  }
  notes.push("A guide based on your own measurements and features — not market data. You choose the final price.");

  return {
    algorithm: SPACEFIT_PRICE_VERSION,
    suggestedMonthlyPence: suggested,
    lowMonthlyPence: clamp(roundPence(suggested * 0.85)),
    highMonthlyPence: clamp(roundPence(suggested * 1.15)),
    // Shorter commitments carry a premium, as they do across UK storage.
    suggestedWeeklyPence: roundPence((suggested / 4.3) * 1.15),
    suggestedDailyPence: roundPence((suggested / 30) * 1.35),
    baseRatePencePerM3: baseRate,
    factors,
    notes,
  };
}

const pct = (value: number) => `${Math.round(value * 100)}%`;

/* --------------------------------------------------------------- earnings */

export const EARNINGS_HORIZONS_MONTHS = [1, 3, 6, 12] as const;
export type EarningsHorizon = (typeof EARNINGS_HORIZONS_MONTHS)[number];

export interface EarningsProjection {
  months: EarningsHorizon;
  /** Occupancy applied, 0–100. */
  occupancyPercent: number;
  /** What the host receives — the full storage price. */
  hostEarningsPence: number;
  /** What the renter pays in total, for transparency. */
  renterPaysPence: number;
  serviceFeePence: number;
}

/**
 * Projects host earnings. The host keeps the whole storage price: the Project
 * Stow service fee is added to the renter's total rather than deducted here.
 */
export function projectEarnings(
  monthlyPricePence: number | null,
  occupancyPercent = 100,
): EarningsProjection[] {
  if (!monthlyPricePence || monthlyPricePence <= 0) return [];
  const occupancy = Math.min(100, Math.max(0, Math.round(occupancyPercent)));

  return EARNINGS_HORIZONS_MONTHS.map((months) => {
    const hostEarnings = Math.round((monthlyPricePence * months * occupancy) / 100);
    const fee = hostEarnings > 0 ? serviceFeePence(hostEarnings) : 0;
    return {
      months,
      occupancyPercent: occupancy,
      hostEarningsPence: hostEarnings,
      renterPaysPence: hostEarnings + fee,
      serviceFeePence: fee,
    };
  });
}

export const EARNINGS_NOTE =
  "Projections assume your space stays booked at the price and occupancy shown. They're not a promise of income, and tax is your responsibility.";

export const HOST_KEEPS_NOTE =
  "You keep the full storage price you set. Renters pay our service fee on top.";
