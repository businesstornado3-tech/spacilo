/**
 * Transaction Centre — every payment, refund and document for a renter.
 *
 * Read-only over the payment ledger. Stripe logic is untouched: this route
 * presents what the server already recorded.
 */
import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ReceiptText } from "lucide-react";

import { brand } from "@/config/brand";
import { AppLayout } from "@/components/layout/AppLayout";
import { EmptyState, ErrorState } from "@/components/common/States";
import { TransactionCentre, TransactionSkeleton } from "@/components/payments/TransactionCentre";
import { useAuth } from "@/hooks/useAuth";
import { useMyBookings } from "@/hooks/useBookings";
import { useMyPayments } from "@/hooks/usePayments";
import { transactionList } from "@/lib/payments/transactions";

const description = "Payments, refunds, receipts and invoices for your storage bookings.";
const title = `Transactions — Renting — ${brand.name}`;

export const Route = createFileRoute("/_authenticated/renter/payments/")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TransactionsPage,
});

function TransactionsPage() {
  const { user } = useAuth();
  const { data: payments, isLoading, error, refetch } = useMyPayments();
  const { data: bookings } = useMyBookings();

  const titles = useMemo(() => {
    const map: Record<string, string> = {};
    for (const booking of bookings ?? []) {
      map[booking.id] = booking.space_title_snapshot ?? "Storage booking";
    }
    return map;
  }, [bookings]);

  const rows = payments ?? [];
  const transactions = useMemo(() => transactionList(rows, titles), [rows, titles]);

  const party = {
    name:
      (user?.user_metadata?.["full_name"] as string | undefined) ??
      user?.email?.split("@")[0] ??
      "Renter",
    email: user?.email ?? "",
  };

  return (
    <AppLayout mode="renter" title="Transactions" description={description}>
      {isLoading ? <TransactionSkeleton /> : null}

      {error ? <ErrorState onRetry={() => void refetch()} /> : null}

      {!isLoading && !error && transactions.length === 0 ? (
        <EmptyState
          icon={ReceiptText}
          title="No transactions yet"
          description="Once you pay for a booking, your payments, refunds and downloadable receipts appear here."
        />
      ) : null}

      {!isLoading && !error && transactions.length > 0 ? (
        <TransactionCentre
          payments={rows}
          titles={titles}
          party={party}
          transactions={transactions}
        />
      ) : null}
    </AppLayout>
  );
}
