/**
 * First-month payment breakdown.
 *
 * Every figure comes from the booking's immutable financial snapshot, which
 * the server wrote. The browser never computes an authoritative amount — this
 * is presentation of stored integer pence.
 */
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/format";
import { brand } from "@/config/brand";
import { FIRST_MONTH_LABEL, FIRST_MONTH_NOTE, SERVICE_FEE_NOTE } from "@/lib/payments/fees";

export interface PaymentAmounts {
  storageAmountPence: number;
  serviceFeeAmountPence: number;
  renterTotalAmountPence: number;
}

export function PaymentBreakdown({
  amounts,
  totalLabel = "Total due now",
  className,
  showNotes = true,
}: {
  amounts: PaymentAmounts;
  totalLabel?: string;
  className?: string;
  showNotes?: boolean;
}) {
  return (
    <div className={cn("rounded-2xl border border-border bg-card p-5 shadow-card", className)}>
      <p className="type-label text-muted-foreground">{FIRST_MONTH_LABEL.toUpperCase()}</p>

      <dl className="mt-3 space-y-2">
        <Line label="Storage" pence={amounts.storageAmountPence} />
        <Line label={`${brand.name} service fee`} pence={amounts.serviceFeeAmountPence} />
        <div className="flex items-baseline justify-between gap-3 border-t border-border pt-3">
          <dt className="type-body font-semibold">{totalLabel}</dt>
          <dd className="type-price tabular-nums">
            {formatPrice(amounts.renterTotalAmountPence)}
          </dd>
        </div>
      </dl>

      {showNotes ? (
        <div className="mt-4 space-y-1">
          <p className="type-body-sm text-muted-foreground">{FIRST_MONTH_NOTE}</p>
          <p className="type-body-sm text-muted-foreground">{SERVICE_FEE_NOTE}</p>
        </div>
      ) : null}
    </div>
  );
}

function Line({ label, pence }: { label: string; pence: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="type-body-sm text-muted-foreground">{label}</dt>
      <dd className="type-body tabular-nums">{formatPrice(pence)}</dd>
    </div>
  );
}
