import { createFileRoute, Link } from "@tanstack/react-router";
import { Sparkles, ArrowLeft } from "lucide-react";

import { brand } from "@/config/brand";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/common/Skeletons";
import { useActiveInventory, useInventoryItems, useInventorySummary } from "@/hooks/useInventory";
import { formatVolume } from "@/lib/inventory-model";

const title = "Your inventory is ready — " + brand.name;
const description = "Your belongings are recorded and ready for space matching.";

export const Route = createFileRoute("/_authenticated/renter/inventory/matching")({
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
  component: MatchingPage,
});

function MatchingPage() {
  const { data: inventory, isLoading } = useActiveInventory();
  const { data: items } = useInventoryItems(inventory?.id);
  const { totals } = useInventorySummary(items);

  return (
    <AppLayout mode="renter" title="Your inventory is ready." description={description}>
      {isLoading ? (
        <Skeleton className="h-56 w-full" />
      ) : (
        <div className="rounded-2xl border border-border bg-card p-6">
          <span className="grid size-11 place-items-center rounded-xl bg-primary-soft text-primary-soft-foreground">
            <Sparkles className="size-5" aria-hidden="true" />
          </span>
          <h2 className="mt-4 type-h2">SpaceFit matching is coming in the next build.</h2>
          <p className="mt-2 max-w-prose type-body text-muted-foreground">
            We&apos;ve saved everything you plan to store. Once matching is live, we&apos;ll use it
            to help identify suitable nearby storage.
          </p>

          <dl className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-secondary/60 p-4">
              <dt className="type-body-sm text-muted-foreground">Items</dt>
              <dd className="type-h3">{totals.itemCount}</dd>
            </div>
            <div className="rounded-xl border border-border bg-secondary/60 p-4">
              <dt className="type-body-sm text-muted-foreground">Estimated storage requirement</dt>
              <dd className="type-h3">
                {formatVolume(totals.storageRequirementM3, { approx: true })}
              </dd>
            </div>
          </dl>

          <Button asChild className="mt-6">
            <Link to="/renter/inventory">
              <ArrowLeft aria-hidden="true" />
              Return to My Stuff
            </Link>
          </Button>
        </div>
      )}
    </AppLayout>
  );
}
