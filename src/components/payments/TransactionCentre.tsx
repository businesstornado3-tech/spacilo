/**
 * Transaction Centre UI.
 *
 * Presentation only: every figure comes from the immutable payment ledger via
 * `@/lib/payments/transactions`. Nothing here can change money, status or
 * refund state.
 */
import { useMemo, useState } from "react";
import { ChevronDown, Download, FileText, Receipt } from "lucide-react";

import { brand } from "@/config/brand";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/common/Skeletons";
import { cn } from "@/lib/utils";
import { formatDate, formatDateTime, formatPrice } from "@/lib/format";
import type { PaymentRow } from "@/lib/payments/history";
import {
  TRANSACTION_FILTERS,
  filterTransactions,
  transactionSummary,
  transactionTimeline,
  type TransactionFilter,
  type TransactionSummary,
  type TransactionView,
} from "@/lib/payments/transactions";
import { buildStorageDocument, downloadStorageDocument } from "@/lib/payments/documents";

const TONE_CLASS: Record<TransactionView["tone"], string> = {
  success: "bg-success-soft text-success-soft-foreground",
  warning: "bg-warning-soft text-warning-soft-foreground",
  danger: "bg-destructive-soft text-destructive-soft-foreground",
  neutral: "bg-muted text-muted-foreground",
};

export function TransactionSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      {[0, 1, 2].map((row) => (
        <div key={row} className="rounded-2xl border border-border bg-card p-5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-3 h-6 w-48" />
          <Skeleton className="mt-4 h-4 w-full" />
        </div>
      ))}
    </div>
  );
}

export function TransactionTotals({ summary }: { summary: TransactionSummary }) {
  const cards = [
    { label: "Total paid", value: formatPrice(summary.paidPence) },
    { label: "Storage", value: formatPrice(summary.storagePence) },
    { label: `${brand.name} fees`, value: formatPrice(summary.serviceFeePence) },
    { label: "Refunded", value: formatPrice(summary.refundedPence) },
  ];
  return (
    <section aria-label="Transaction totals" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className="rounded-2xl border border-border bg-card p-4 shadow-card">
          <p className="type-label text-muted-foreground">{card.label.toUpperCase()}</p>
          <p className="mt-1 type-price tabular-nums">{card.value}</p>
        </div>
      ))}
    </section>
  );
}

export function TransactionFilters({
  value,
  onChange,
}: {
  value: TransactionFilter;
  onChange: (next: TransactionFilter) => void;
}) {
  return (
    <div role="tablist" aria-label="Filter transactions" className="flex flex-wrap gap-2">
      {TRANSACTION_FILTERS.map((filter) => (
        <button
          key={filter.value}
          type="button"
          role="tab"
          aria-selected={value === filter.value}
          onClick={() => onChange(filter.value)}
          className={cn(
            "min-h-11 rounded-full border px-4 type-body-sm transition-colors",
            value === filter.value
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card text-foreground hover:bg-muted",
          )}
        >
          {filter.label}
        </button>
      ))}
    </div>
  );
}

function DocumentButtons({
  transaction,
  party,
}: {
  transaction: TransactionView;
  party: { name: string; email: string };
}) {
  if (!transaction.documentsAvailable) {
    return (
      <p className="type-body-sm text-muted-foreground">
        A receipt and invoice appear here once the payment settles.
      </p>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => downloadStorageDocument(buildStorageDocument("receipt", transaction, party))}
      >
        <Receipt className="size-4" aria-hidden="true" />
        <span>Download receipt</span>
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => downloadStorageDocument(buildStorageDocument("invoice", transaction, party))}
      >
        <FileText className="size-4" aria-hidden="true" />
        <span>Download invoice</span>
      </Button>
    </div>
  );
}

export function TransactionCard({
  transaction,
  payment,
  party,
}: {
  transaction: TransactionView;
  payment: PaymentRow;
  party: { name: string; email: string };
}) {
  const [open, setOpen] = useState(false);
  const timeline = useMemo(() => transactionTimeline(payment), [payment]);
  const panelId = `transaction-${transaction.id}`;

  return (
    <article className="rounded-2xl border border-border bg-card p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="type-label text-muted-foreground">
            {transaction.kindLabel.toUpperCase()} · {transaction.reference}
          </p>
          <h3 className="mt-1 type-h3">{transaction.title}</h3>
          <p className="mt-1 type-body-sm text-muted-foreground">
            {transaction.periodStart && transaction.periodEnd
              ? `${formatDate(transaction.periodStart)} – ${formatDate(transaction.periodEnd)}`
              : `Booking ${transaction.bookingReference}`}
          </p>
        </div>
        <div className="text-right">
          <span
            className={cn(
              "inline-block rounded-full px-3 py-1 type-label",
              TONE_CLASS[transaction.tone],
            )}
          >
            {transaction.statusLabel}
          </span>
          <p className="mt-2 type-price tabular-nums">{formatPrice(transaction.totalPence)}</p>
        </div>
      </div>

      {transaction.refundedTotalPence > 0 ? (
        <p className="mt-3 type-body-sm tabular-nums text-muted-foreground">
          {transaction.refundLabel} · {formatPrice(transaction.refundedTotalPence)} returned · Net{" "}
          {formatPrice(transaction.netPence)}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={panelId}
        className="mt-4 flex min-h-11 items-center gap-2 type-body-sm font-semibold text-primary"
      >
        <span>{open ? "Hide details" : "View details"}</span>
        <ChevronDown
          className={cn("size-4 transition-transform", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <div id={panelId} className="mt-4 space-y-5 border-t border-border pt-4">
          <dl className="space-y-2">
            <Line label="Storage" pence={transaction.storagePence} />
            <Line label={`${brand.name} service fee`} pence={transaction.serviceFeePence} />
            <div className="flex items-baseline justify-between gap-3 border-t border-border pt-2">
              <dt className="type-body-sm font-semibold">Total</dt>
              <dd className="type-body tabular-nums">{formatPrice(transaction.totalPence)}</dd>
            </div>
          </dl>

          {timeline.length > 0 ? (
            <div>
              <p className="type-label text-muted-foreground">TIMELINE</p>
              <ol className="mt-3 space-y-3">
                {timeline.map((event) => (
                  <li key={event.id} className="flex gap-3">
                    <span
                      className="mt-1.5 size-2 shrink-0 rounded-full bg-primary"
                      aria-hidden="true"
                    />
                    <div>
                      <p className="type-body-sm font-semibold">{event.label}</p>
                      <p className="type-body-sm text-muted-foreground">
                        {formatDateTime(event.at)}
                        {event.detail ? ` · ${event.detail}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          <div>
            <p className="type-label text-muted-foreground">DOCUMENTS</p>
            <div className="mt-3">
              <DocumentButtons transaction={transaction} party={party} />
            </div>
          </div>

          <p className="type-body-sm text-muted-foreground">
            Booking reference {transaction.bookingReference}
            {transaction.providerReference ? ` · Payment ${transaction.providerReference}` : ""}
          </p>
        </div>
      ) : null}
    </article>
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

export function TransactionCentre({
  payments,
  titles,
  party,
  transactions,
}: {
  payments: PaymentRow[];
  titles: Record<string, string>;
  party: { name: string; email: string };
  transactions: TransactionView[];
}) {
  const [filter, setFilter] = useState<TransactionFilter>("all");
  const summary = useMemo(() => transactionSummary(transactions), [transactions]);
  const visible = useMemo(
    () => filterTransactions(transactions, filter),
    [transactions, filter],
  );
  const byId = useMemo(() => {
    const map: Record<string, PaymentRow> = {};
    for (const payment of payments) map[payment.id] = payment;
    return map;
  }, [payments]);
  void titles;

  return (
    <div className="space-y-6">
      <TransactionTotals summary={summary} />
      <TransactionFilters value={filter} onChange={setFilter} />

      {visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border-strong bg-card px-6 py-10 text-center type-body-sm text-muted-foreground">
          No transactions match this filter.
        </p>
      ) : (
        <div className="space-y-4">
          {visible.map((transaction) => {
            const payment = byId[transaction.id];
            if (!payment) return null;
            return (
              <TransactionCard
                key={transaction.id}
                transaction={transaction}
                payment={payment}
                party={party}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
