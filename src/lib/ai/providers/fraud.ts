/**
 * Fraud signal intelligence (Phase 6B).
 *
 * Internal only. This provider observes patterns and scores them for staff
 * review; it never decides that anyone has done anything wrong, and nothing it
 * produces is shown to customers.
 */
import { explain, factor } from "../core/explain";
import { registerAiProvider } from "../core/provider-manager";
import type { AiProvider } from "../core/types";

const ENGINE_MODEL = "earnroom-reasoning-1";

export interface FraudSubject {
  /** Pseudonymous id. Never a name, email or address. */
  subjectId: string;
  subjectType: "listing" | "account" | "booking";
  title?: string;
  description?: string;
  /** Perceptual hashes of the listing photos, where available. */
  imageHashes?: string[];
  monthlyPricePence?: number;
  /** Median monthly price for comparable local listings, in pence. */
  localMedianPence?: number;
  accountAgeDays?: number;
  listingsCreatedLast24h?: number;
  bookingsLast24h?: number;
  cancellationsLast30d?: number;
  messagesBeforeBooking?: number;
  idVerified?: boolean;
  payoutAccountAgeDays?: number;
  /** Distinct devices or IP prefixes seen on the account. */
  distinctDevices?: number;
}

export interface FraudInput {
  subjects: FraudSubject[];
}

export type FraudSignalCode =
  | "duplicate_listing"
  | "duplicate_images"
  | "templated_description"
  | "abnormal_pricing"
  | "rapid_listing_creation"
  | "unusual_booking_pattern"
  | "identity_anomaly";

export interface FraudSignal {
  code: FraudSignalCode;
  detail: string;
  /** 0–1 strength of the observation, not a verdict. */
  weight: number;
}

export interface FraudAssessment {
  subjectId: string;
  subjectType: FraudSubject["subjectType"];
  /** 0–100 review priority. */
  riskScore: number;
  band: "low" | "elevated" | "high";
  signals: FraudSignal[];
  /** What a human should look at first. */
  recommendedAction: "none" | "monitor" | "manual_review";
}

export interface FraudOutput {
  assessments: FraudAssessment[];
  /** Subjects sharing a description or image fingerprint. */
  clusters: Array<{ fingerprint: string; subjectIds: string[]; kind: "text" | "image" }>;
}

function normaliseText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

function fingerprint(text: string): string {
  const words = normaliseText(text).split(" ").filter((word) => word.length > 3);
  return words.slice(0, 12).sort().join("-");
}

export function scoreFraudSignals(input: FraudInput): FraudOutput {
  // Cluster by description fingerprint and by image hash.
  const textIndex = new Map<string, string[]>();
  const imageIndex = new Map<string, string[]>();

  for (const subject of input.subjects) {
    if (subject.description && subject.description.length > 40) {
      const key = fingerprint(subject.description);
      if (key) textIndex.set(key, [...(textIndex.get(key) ?? []), subject.subjectId]);
    }
    for (const hash of subject.imageHashes ?? []) {
      imageIndex.set(hash, [...(imageIndex.get(hash) ?? []), subject.subjectId]);
    }
  }

  const clusters: FraudOutput["clusters"] = [
    ...[...textIndex.entries()]
      .filter(([, ids]) => ids.length > 1)
      .map(([fingerprintKey, subjectIds]) => ({ fingerprint: fingerprintKey, subjectIds, kind: "text" as const })),
    ...[...imageIndex.entries()]
      .filter(([, ids]) => new Set(ids).size > 1)
      .map(([hash, subjectIds]) => ({ fingerprint: hash, subjectIds: [...new Set(subjectIds)], kind: "image" as const })),
  ];

  const duplicatedText = new Set(clusters.filter((c) => c.kind === "text").flatMap((c) => c.subjectIds));
  const duplicatedImages = new Set(clusters.filter((c) => c.kind === "image").flatMap((c) => c.subjectIds));

  const assessments = input.subjects.map((subject) => {
    const signals: FraudSignal[] = [];

    if (duplicatedText.has(subject.subjectId)) {
      signals.push({
        code: "duplicate_listing",
        detail: "The description closely matches another listing on the platform.",
        weight: 0.7,
      });
    }
    if (duplicatedImages.has(subject.subjectId)) {
      signals.push({
        code: "duplicate_images",
        detail: "One or more photos appear on another listing.",
        weight: 0.8,
      });
    }

    const description = subject.description ?? "";
    if (description && description.length < 60 && (subject.listingsCreatedLast24h ?? 0) > 1) {
      signals.push({
        code: "templated_description",
        detail: "Very short description repeated across several new listings.",
        weight: 0.4,
      });
    }

    if (subject.monthlyPricePence && subject.localMedianPence) {
      const ratio = subject.monthlyPricePence / subject.localMedianPence;
      if (ratio < 0.35) {
        signals.push({
          code: "abnormal_pricing",
          detail: `Priced ${Math.round((1 - ratio) * 100)}% below the local median.`,
          weight: 0.6,
        });
      } else if (ratio > 3) {
        signals.push({
          code: "abnormal_pricing",
          detail: `Priced ${Math.round(ratio)}× the local median.`,
          weight: 0.4,
        });
      }
    }

    if ((subject.listingsCreatedLast24h ?? 0) >= 4) {
      signals.push({
        code: "rapid_listing_creation",
        detail: `${subject.listingsCreatedLast24h} listings created in 24 hours.`,
        weight: 0.6,
      });
    }

    if ((subject.bookingsLast24h ?? 0) >= 4 && (subject.messagesBeforeBooking ?? 1) === 0) {
      signals.push({
        code: "unusual_booking_pattern",
        detail: "Several bookings in a day with no prior messages.",
        weight: 0.6,
      });
    }
    if ((subject.cancellationsLast30d ?? 0) >= 3) {
      signals.push({
        code: "unusual_booking_pattern",
        detail: `${subject.cancellationsLast30d} cancellations in the last 30 days.`,
        weight: 0.4,
      });
    }

    const young = (subject.accountAgeDays ?? 999) < 3;
    if (young && subject.idVerified === false && (subject.payoutAccountAgeDays ?? 999) < 3) {
      signals.push({
        code: "identity_anomaly",
        detail: "New, unverified account with a brand-new payout account.",
        weight: 0.7,
      });
    }
    if ((subject.distinctDevices ?? 0) >= 5) {
      signals.push({
        code: "identity_anomaly",
        detail: `${subject.distinctDevices} distinct devices seen on this account.`,
        weight: 0.4,
      });
    }

    const raw = signals.reduce((sum, signal) => sum + signal.weight, 0);
    const riskScore = Math.min(100, Math.round((1 - Math.exp(-raw)) * 100));
    const band = riskScore >= 65 ? "high" : riskScore >= 35 ? "elevated" : "low";

    return {
      subjectId: subject.subjectId,
      subjectType: subject.subjectType,
      riskScore,
      band,
      signals,
      recommendedAction: band === "high" ? "manual_review" : band === "elevated" ? "monitor" : "none",
    } satisfies FraudAssessment;
  });

  return { assessments: assessments.sort((a, b) => b.riskScore - a.riskScore), clusters };
}

export const fraudProvider: AiProvider<FraudInput, FraudOutput> = {
  id: "earnroom-fraud",
  kind: "llm",
  model: ENGINE_MODEL,
  remote: false,
  capabilities: ["fraud"],
  async run(input) {
    const result = scoreFraudSignals(input);
    const flagged = result.assessments.filter((entry) => entry.band !== "low");
    return {
      result,
      confidence: 0.8,
      explanation: explain({
        reason: flagged.length
          ? `${flagged.length} subject${flagged.length === 1 ? "" : "s"} worth a look. Observations only — no conclusion is drawn.`
          : "Nothing stands out in this batch.",
        confidence: 0.8,
        factors: flagged
          .slice(0, 5)
          .map((entry) => factor(entry.subjectId, `${entry.riskScore}/100 · ${entry.signals.length} signal(s)`, entry.riskScore / 100)),
      }),
    };
  },
};

export function installFraudProvider(): void {
  registerAiProvider(fraudProvider);
}
