/**
 * Authoritative price review gate (Prompt 23, items 14–15).
 *
 * The server prices the request. If the price moved since the renter reviewed
 * it, commitment is blocked here AND in `create_booking_from_request` — this
 * panel only explains the difference and captures the explicit re-review.
 */
import { AlertCircle, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatPence } from "@/lib/format";
import {
  PRICE_REVIEW_COPY,
  commitDecision,
  type RequestPriceState,
} from "@/lib/pricing/commitment";

export function PriceReviewGate({
  price,
  onReview,
  reviewing,
}: {
  price: RequestPriceState | null | undefined;
  onReview: () => void;
  reviewing?: boolean;
}) {
  const decision = commitDecision(price);
  if (!price || decision.kind === "commit") return null;

  if (decision.kind === "blocked") {
    return (
      <section className="flex items-start gap-3 rounded-2xl border border-border bg-warning-soft p-4">
        <AlertCircle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
        <p className="type-body-sm">{PRICE_REVIEW_COPY.unavailable}</p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-warning/40 bg-warning-soft p-5">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
        <div className="min-w-0">
          <h2 className="type-h3">The price for these dates has changed</h2>
          <p className="mt-1 type-body-sm">{PRICE_REVIEW_COPY[decision.direction]}</p>
        </div>
      </div>

      <dl className="mt-4 space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="type-body-sm text-muted-foreground">Price you reviewed</dt>
          <dd className="type-body-sm tabular-nums line-through">
            {formatPence(price.reviewedTotalAmountPence)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="type-body-sm font-semibold">Storage</dt>
          <dd className="type-body-sm tabular-nums">
            {formatPence(price.currentStorageAmountPence)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="type-body-sm font-semibold">Service fee</dt>
          <dd className="type-body-sm tabular-nums">
            {formatPence(price.currentServiceFeePence)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 border-t border-border pt-2">
          <dt className="type-body font-semibold">New total to pay now</dt>
          <dd className="type-price tabular-nums">{formatPence(price.currentTotalAmountPence)}</dd>
        </div>
      </dl>

      <p className="mt-3 type-body-sm text-muted-foreground">{PRICE_REVIEW_COPY.frozen}</p>

      <Button className="mt-4" onClick={onReview} disabled={reviewing}>
        <Check className="size-4" aria-hidden="true" />
        {reviewing ? "Saving…" : PRICE_REVIEW_COPY.reviewedCta}
      </Button>
    </section>
  );
}
