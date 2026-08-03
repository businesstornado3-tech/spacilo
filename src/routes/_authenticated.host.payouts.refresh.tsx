/**
 * Stripe Connect onboarding refresh page.
 *
 * Stripe sends the host here when an onboarding link has expired or the flow
 * needs restarting. A fresh link is created server-side on demand.
 */
import { createFileRoute, Link } from "@tanstack/react-router";

import { brand } from "@/config/brand";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/common/Alert";
import { useStartPayoutOnboarding } from "@/hooks/useHostPayouts";

export const Route = createFileRoute("/_authenticated/host/payouts/refresh")({
  head: () => ({
    meta: [
      { title: "Continue payout setup — Hosting — " + brand.name },
      { name: "description", content: "Restart your Stripe payout setup." },
      { property: "og:title", content: "Continue payout setup — Hosting — " + brand.name },
      { property: "og:description", content: "Restart your Stripe payout setup." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PayoutRefreshPage,
});

function PayoutRefreshPage() {
  const onboarding = useStartPayoutOnboarding();

  const restart = () => {
    onboarding.mutate(undefined, {
      onSuccess: (result) => {
        if (result?.url) window.location.href = result.url;
      },
    });
  };

  return (
    <AppLayout
      mode="host"
      title="Continue payout setup"
      description="Your Stripe setup link expired before it was finished."
    >
      <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
        <p className="max-w-prose type-body-sm text-muted-foreground">
          Nothing was lost — Stripe keeps whatever you already entered. Start again to finish
          verifying your details.
        </p>
        {onboarding.isError ? (
          <Alert tone="warning" title="Couldn't reopen Stripe" className="mt-4">
            {(onboarding.error as Error).message}
          </Alert>
        ) : null}
        <div className="mt-5 flex flex-wrap gap-3">
          <Button onClick={restart} disabled={onboarding.isPending}>
            {onboarding.isPending ? "Opening Stripe…" : "Continue with Stripe"}
          </Button>
          <Button asChild variant="secondary">
            <Link to="/host/earnings">Back to earnings</Link>
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
