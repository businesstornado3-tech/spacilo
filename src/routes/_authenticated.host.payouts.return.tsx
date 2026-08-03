/**
 * Stripe Connect onboarding return page.
 *
 * Returning here proves nothing about verification — Stripe redirects on both
 * success and abandonment. So this page asks the server to re-read the account
 * from Stripe and shows the authoritative status.
 */
import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";

import { brand } from "@/config/brand";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { PAYOUT_STATUS_LABEL, PAYOUT_STATUS_NOTE } from "@/lib/payments/payout-policy";
import { useHostPayoutAccount, useRefreshPayoutStatus } from "@/hooks/useHostPayouts";

export const Route = createFileRoute("/_authenticated/host/payouts/return")({
  head: () => ({
    meta: [
      { title: "Payout setup — Hosting — " + brand.name },
      { name: "description", content: "Checking your payout setup with Stripe." },
      { property: "og:title", content: "Payout setup — Hosting — " + brand.name },
      { property: "og:description", content: "Checking your payout setup with Stripe." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PayoutReturnPage,
});

function PayoutReturnPage() {
  const refresh = useRefreshPayoutStatus();
  const { data: account } = useHostPayoutAccount();
  const refreshRef = React.useRef(refresh);
  refreshRef.current = refresh;

  React.useEffect(() => {
    refreshRef.current.mutate();
  }, []);

  const status = account?.status ?? "not_started";

  return (
    <AppLayout mode="host" title="Payout setup" description="Confirming your details with Stripe.">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
        <p className="type-label text-muted-foreground">STATUS</p>
        <h2 className="mt-1 type-h3">
          {refresh.isPending ? "Checking with Stripe…" : PAYOUT_STATUS_LABEL[status]}
        </h2>
        <p className="mt-2 max-w-prose type-body-sm text-muted-foreground">
          {refresh.isPending
            ? "This only takes a moment."
            : PAYOUT_STATUS_NOTE[status]}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button asChild>
            <Link to="/host/earnings">Go to earnings</Link>
          </Button>
          <Button
            variant="secondary"
            onClick={() => refresh.mutate()}
            disabled={refresh.isPending}
          >
            Check again
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
