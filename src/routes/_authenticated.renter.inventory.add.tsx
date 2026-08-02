import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { brand } from "@/config/brand";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/common/Skeletons";
import { QuickAdd } from "@/components/inventory/QuickAdd";
import { ItemDialog } from "@/components/inventory/ItemDialog";
import { useEnsuredInventory, useInventoryItems, useInventoryMutations, useInventorySummary } from "@/hooks/useInventory";
import { formatVolume } from "@/lib/inventory-model";
import type { CatalogueItem } from "@/lib/inventory-catalogue";

const title = "Build my inventory — " + brand.name;
const description = "Add what you're planning to store and we'll estimate the space you need.";

export const Route = createFileRoute("/_authenticated/renter/inventory/add")({
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
  component: AddItemsPage,
});

function AddItemsPage() {
  const { data: inventory, isLoading } = useEnsuredInventory();
  const { data: items } = useInventoryItems(inventory?.id);
  const { add, update, remove } = useInventoryMutations(inventory?.id);
  const { totals } = useInventorySummary(items);
  const [customOpen, setCustomOpen] = React.useState(false);

  const list = items ?? [];

  const handleQuantityChange = (entry: CatalogueItem, quantity: number) => {
    const existing = list.find((item) => item.catalogue_key === entry.key);
    if (!existing) {
      if (quantity <= 0) return;
      add.mutate({
        catalogue_key: entry.key,
        item_name: entry.name,
        category: entry.category,
        quantity,
        length_cm: entry.lengthCm,
        width_cm: entry.widthCm,
        height_cm: entry.heightCm,
        stackable: entry.stackable,
        orientation_flexible: entry.orientationFlexible,
        fragile: entry.fragile ?? false,
        size_source: "catalogue_estimate",
        created_manually: true,
        ai_detected: false,
      });
      return;
    }
    if (quantity <= 0) {
      remove.mutate(existing.id);
      return;
    }
    update.mutate({ id: existing.id, patch: { quantity } });
  };

  return (
    <AppLayout mode="renter" title="What are you storing?" description={description}>
      {isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <>
          <div className="pb-28">
            <QuickAdd
              items={list}
              onQuantityChange={handleQuantityChange}
              onAddCustom={() => setCustomOpen(true)}
            />
          </div>

          <div className="fixed inset-x-0 bottom-16 z-30 border-t border-border bg-background/95 px-4 py-3 backdrop-blur md:bottom-0">
            <div className="mx-auto flex max-w-6xl items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="type-body-sm text-muted-foreground">
                  {totals.itemCount} {totals.itemCount === 1 ? "item" : "items"}
                </p>
                <p className="truncate type-body font-semibold">
                  {formatVolume(totals.storageRequirementM3, { approx: true })} estimated storage
                </p>
              </div>
              <Button asChild>
                <Link to="/renter/inventory">
                  View My Stuff
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </div>

          <ItemDialog
            open={customOpen}
            onOpenChange={setCustomOpen}
            onSubmit={(row) =>
              add.mutateAsync({
                ...row,
                size_source: row.length_cm && row.width_cm && row.height_cm ? "user_measured" : "unknown",
                created_manually: true,
                ai_detected: false,
              }).then(() => undefined)
            }
            saving={add.isPending}
          />
        </>
      )}
    </AppLayout>
  );
}
