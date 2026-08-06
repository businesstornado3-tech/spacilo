/**
 * Deterministic listing FAQ.
 *
 * Every question is answered from a field the host actually filled in, or from
 * platform policy that is true for every booking (fees, payment, cancellation).
 * Nothing is generated, guessed or softened: if the underlying fact is missing,
 * the question is not asked. The same builder feeds the on-page accordion and
 * the FAQPage JSON-LD, so the two can never disagree.
 */
import { brand } from "@/config/brand";
import { accessFrequencyLabel, accessTypeLabel, availabilityLabel, formatStay } from "@/lib/spaces";
import type { AccessFrequencyValue, AccessTypeValue } from "@/lib/spaces";
import { formatPrice } from "@/lib/format";
import { serviceFeePence } from "@/lib/payments/fees";
import { minimumStaySummary, type ListingFactsRow } from "@/lib/marketplace/listing-facts";

export interface ListingFaqRow extends ListingFactsRow {
  access_notes?: string | null;
  access_frequency?: string | null;
  availability_mode?: string | null;
  available_from?: string | null;
  available_until?: string | null;
  monthly_price_pence?: number | null;
  restriction_notes?: string | null;
}

export interface FaqEntry {
  question: string;
  answer: string;
}

export function buildListingFaq(row: ListingFaqRow): FaqEntry[] {
  const entries: FaqEntry[] = [];

  if (row.access_type) {
    const frequencyLabel = accessFrequencyLabel(row.access_frequency as AccessFrequencyValue | null);
    const frequency = frequencyLabel
      ? ` The host is comfortable with ${frequencyLabel.toLowerCase()} visits.`
      : "";
    const notes = row.access_notes ? ` ${row.access_notes}` : "";
    entries.push({
      question: "How do I get access to this space?",
      answer: `${accessTypeLabel(row.access_type as AccessTypeValue)}.${frequency}${notes}`.trim(),
    });
  }

  const minimum = minimumStaySummary(row);
  if (minimum) {
    entries.push({
      question: "Is there a minimum storage period?",
      answer: `Yes. This host asks for ${formatStay(
        row.minimum_stay_days ?? (row.minimum_storage_period_months ?? 1) * 30,
      )} as a minimum booking. You can ask about a longer stay before you book.`,
    });
  }

  if (row.availability_mode || row.available_from || row.available_until) {
    entries.push({
      question: "When can I move my things in?",
      answer: `${availabilityLabel({
        availability_mode: row.availability_mode ?? null,
        available_from: row.available_from ?? null,
        available_until: row.available_until ?? null,
      })}. You agree the exact handover time with the host after they accept your request.`,
    });
  }

  if (typeof row.monthly_price_pence === "number") {
    const fee = serviceFeePence(row.monthly_price_pence);
    entries.push({
      question: "What will I pay?",
      answer: `The host's storage price is ${formatPrice(
        row.monthly_price_pence,
      )} a month, plus a ${brand.name} service fee of ${formatPrice(
        fee,
      )} on that amount. Your final total is calculated by ${brand.name} for your exact dates before you pay — sending a request never takes payment.`,
    });
  }

  entries.push({
    question: "How is payment handled?",
    answer: `Payment is taken through ${brand.name} once the host accepts your request and you confirm the booking. Paying the host directly isn't supported and isn't covered by ${brand.name}.`,
  });

  entries.push({
    question: "Can I cancel?",
    answer: `You can withdraw a request at any time before it becomes a booking, at no cost. After a booking starts, cancellation and early-termination terms are shown in your booking before you confirm.`,
  });

  if (row.restriction_notes) {
    entries.push({
      question: "Is there anything this host won't store?",
      answer: row.restriction_notes,
    });
  }

  entries.push({
    question: "Is my stuff insured?",
    answer: `${brand.name} isn't an insurer and doesn't provide cover. Check whether your own contents policy covers items stored away from home, and review the space and the host's declarations before booking.`,
  });

  return entries;
}
