/**
 * Renter payment history for one booking.
 *
 * Each row is an immutable transaction: the amount and the dates it bought.
 * The booking's current period can move on; these never do. Totals are summed
 * from successful payments only.
 */
import { brand } from "@/config/brand";
import { cn } from "@/lib/utils";
import { formatDate, formatPrice } from "@/lib/format";
import type { PaymentHistoryEntry, PaymentTotals } from "@/lib/payments/history";

export function PaymentHistory({
  entries,
  totals,
  className,
}: {
  entries: PaymentHistoryEntry[];
  totals: PaymentTotals;
  className?: string;
}) {
  if (entries.length === 0) return null;
  const multiple = entries.length > 1;

  return (
    <section
      className={cn("rounded-2xl border border-border bg-card p-5 shadow-card", className)}
      aria-label="Payment history"
    >
      <p className="type-label text-muted-foreground">PAYMENT HISTORY</p>

      <ul className="mt-4 space-y-5">
        {entries.map((entry) => (
          <li key={entry.id}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="type-body font-semibold">{entry.label}</p>
              {entry.periodStart && entry.periodEnd ? (
                <p className="type-body-sm text-muted-foreground">
                  {formatDate(entry.periodStart)} – {formatDate(entry.periodEnd)}
                </p>
              ) : null}
            </div>
            <dl className="mt-2 space-y-2">
              <Line label={entry.storageLabel} pence={entry.storagePence} />
              <Line label={`${brand.name} service fee`} pence={entry.serviceFeePence} />
              <div className="flex items-baseline justify-between gap-3 border-t border-border pt-2">
                <dt className="type-body-sm font-semibold">Total paid</dt>
                <dd className="type-body tabular-nums">{formatPrice(entry.totalPence)}</dd>
              </div>
            </dl>
            {entry.paidAt ? (
              <p className="mt-1 type-body-sm text-muted-foreground">
                Paid on {formatDate(entry.paidAt)}
                {entry.reference ? ` · Reference ${entry.reference}` : ""}
              </p>
            ) : null}
          </li>
        ))}
      </ul>

      {multiple ? (
        <dl className="mt-6 space-y-2 border-t border-border pt-4">
          <Line label="Total storage paid" pence={totals.storagePence} />
          <Line label={`Total ${brand.name} fees`} pence={totals.serviceFeePence} />
          <div className="flex items-baseline justify-between gap-3 border-t border-border pt-3">
            <dt className="type-body font-semibold">Total paid</dt>
            <dd className="type-price tabular-nums">{formatPrice(totals.totalPence)}</dd>
          </div>
        </dl>
      ) : null}
    </section>
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
