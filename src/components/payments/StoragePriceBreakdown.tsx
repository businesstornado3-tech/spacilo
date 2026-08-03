/**
 * Renter-facing explanation of a priced storage period.
 *
 * Everything here comes from the deterministic pricing engine
 * (`storage-duration-v1`): the same dates and the same host rates always
 * produce the same lines. Nothing is estimated, discounted or personalised.
 */
import { formatPrice } from "@/lib/format";
import { componentLabel, formatDuration, type StoragePrice } from "@/lib/pricing/duration";
import { serviceFeePence } from "@/lib/payments/fees";

export function StoragePriceBreakdown({
  price,
  showServiceFee = true,
}: {
  price: StoragePrice;
  showServiceFee?: boolean;
}) {
  const fee = serviceFeePence(price.storageAmountPence);
  const total = price.storageAmountPence + fee;

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="type-h3">Your price</h3>
        <p className="type-body-sm text-muted-foreground">{formatDuration(price.durationDays)}</p>
      </div>

      <dl className="mt-4 space-y-2">
        {price.components.map((component) => (
          <div
            key={`${component.unit}-${component.quantity}`}
            className="flex items-baseline justify-between gap-4"
          >
            <dt className="type-body-sm text-muted-foreground">{componentLabel(component)}</dt>
            <dd className="type-body tabular-nums">{formatPrice(component.amountPence)}</dd>
          </div>
        ))}

        <div className="flex items-baseline justify-between gap-4 border-t border-border pt-2">
          <dt className="type-body-sm text-muted-foreground">Storage</dt>
          <dd className="type-body tabular-nums">{formatPrice(price.storageAmountPence)}</dd>
        </div>

        {showServiceFee ? (
          <>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="type-body-sm text-muted-foreground">Service fee</dt>
              <dd className="type-body tabular-nums">{formatPrice(fee)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 border-t border-border pt-2">
              <dt className="type-body font-medium">Total</dt>
              <dd className="type-h3 tabular-nums">{formatPrice(total)}</dd>
            </div>
          </>
        ) : null}
      </dl>

      <p className="mt-4 type-body-sm text-muted-foreground">
        You&apos;re charged the cheapest combination of the host&apos;s daily, weekly and monthly
        rates for your exact dates. Sending a request doesn&apos;t take payment.
      </p>
    </div>
  );
}
