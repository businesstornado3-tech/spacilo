import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Boxes, Plus, Camera, Trash2, ArrowRight, Sparkles } from "lucide-react";

import { brand } from "@/config/brand";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/common/Skeletons";
import { EmptyState } from "@/components/common/States";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { InventorySummary } from "@/components/inventory/InventorySummary";
import { RequirementCard } from "@/components/spacefit/RequirementCard";
import { ItemScreeningPanel } from "@/components/policy/ItemScreeningPanel";

import { ItemRow } from "@/components/inventory/ItemRow";
import { ItemDialog } from "@/components/inventory/ItemDialog";
import {
  useActiveInventory,
  useInventoryItems,
  useInventoryMutations,
  useInventorySummary,
} from "@/hooks/useInventory";
import { usePendingDetections } from "@/hooks/useSpaceFitVision";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  type InventoryItem,
  type ItemCategory,
} from "@/lib/inventory-model";

const title = "My Stuff — " + brand.name;
const description = "Everything you're planning to store.";

export const Route = createFileRoute("/_authenticated/renter/inventory/")({
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
  component: MyStuffPage,
});

function MyStuffPage() {
  const { data: inventory, isLoading } = useActiveInventory();
  const { data: items } = useInventoryItems(inventory?.id);
  const { update, remove, clear } = useInventoryMutations(inventory?.id);
  const { totals, largest, readiness } = useInventorySummary(items);

  const [editing, setEditing] = React.useState<InventoryItem | null>(null);
  const [clearOpen, setClearOpen] = React.useState(false);

  const list = items ?? [];

  const grouped = React.useMemo(() => {
    const map = new Map<ItemCategory, InventoryItem[]>();
    for (const item of list) {
      const bucket = map.get(item.category) ?? [];
      bucket.push(item);
      map.set(item.category, bucket);
    }
    return CATEGORY_ORDER.filter((category) => map.has(category)).map((category) => ({
      category,
      items: map.get(category)!,
    }));
  }, [list]);

  return (
    <AppLayout
      mode="renter"
      title="My Stuff"
      description={description}
      actions={
        <Button asChild variant="secondary" size="sm">
          <Link to="/renter/inventory/add">
            <Plus aria-hidden="true" />
            Add items
          </Link>
        </Button>
      }
    >
      {isLoading ? (
        <Skeleton className="h-72 w-full" />
      ) : list.length === 0 ? (
        <div className="space-y-4">
          <EmptyState
            icon={Boxes}
            title="You haven't added anything yet."
            description="Tell us what you need to store and we'll estimate the space required."
          />
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild>
              <Link to="/renter/inventory/add">Build my inventory</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link to="/renter/inventory/photos">
                <Camera aria-hidden="true" />
                Upload photos
              </Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-8 pb-28">
          <PendingSuggestionsBanner inventoryId={inventory?.id} />
          <InventorySummary totals={totals} largest={largest} readiness={readiness} />

          <RequirementCard items={list} />

          <ItemScreeningPanel inventoryId={inventory?.id} />




          <div className="space-y-6">
            {grouped.map((group) => (
              <section key={group.category}>
                <h2 className="type-label uppercase tracking-wide text-muted-foreground">
                  {CATEGORY_LABELS[group.category]}
                </h2>
                <ul className="mt-3 space-y-3">
                  {group.items.map((item) => (
                    <li key={item.id}>
                      <ItemRow
                        item={item}
                        onQuantityChange={(quantity) =>
                          quantity <= 0
                            ? remove.mutate(item.id)
                            : update.mutate({ id: item.id, patch: { quantity } })
                        }
                        onEdit={() => setEditing(item)}
                        onDelete={() => remove.mutate(item.id)}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button asChild variant="secondary">
              <Link to="/renter/inventory/add">
                <Plus aria-hidden="true" />
                Add more items
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link to="/renter/inventory/photos">
                <Camera aria-hidden="true" />
                Inventory photos
              </Link>
            </Button>
            <Button variant="ghost" onClick={() => setClearOpen(true)}>
              <Trash2 aria-hidden="true" />
              Clear My Stuff
            </Button>
          </div>

          <div className="fixed inset-x-0 bottom-16 z-30 border-t border-border bg-background/95 px-4 py-3 backdrop-blur md:bottom-0">
            <div className="mx-auto flex max-w-6xl items-center gap-3">
              <p className="hidden min-w-0 flex-1 type-body-sm text-muted-foreground sm:block">
                We&apos;ll use your inventory to help identify suitable nearby storage.
              </p>
              <Button asChild className="ml-auto">
                <Link to="/renter/matches">
                  Find matching spaces
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      )}

      <ItemDialog
        open={Boolean(editing)}
        onOpenChange={(open) => !open && setEditing(null)}
        item={editing ?? undefined}
        saving={update.isPending}
        onSubmit={(row, dimensionsChanged) => {
          if (!editing) return;
          update.mutate({
            id: editing.id,
            patch: {
              ...row,
              size_source: dimensionsChanged
                ? row.length_cm && row.width_cm && row.height_cm
                  ? "user_measured"
                  : "unknown"
                : editing.size_source,
            },
          });
        }}
      />

      <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear My Stuff?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the items you&apos;ve added. Uploaded inventory photos will also be
              removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep my inventory</AlertDialogCancel>
            <AlertDialogAction onClick={() => clear.mutate()}>Clear everything</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}

/** Nudge back into the review screen when AI suggestions are still waiting. */
function PendingSuggestionsBanner({ inventoryId }: { inventoryId: string | undefined }) {
  const { data } = usePendingDetections(inventoryId);
  const count = data?.length ?? 0;
  if (count === 0) return null;

  return (
    <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-signal/25 bg-signal-soft/40 p-4">
      <Sparkles className="size-5 text-primary" aria-hidden="true" />
      <p className="min-w-0 flex-1 type-body-sm">
        EarnRoom AI has {count} {count === 1 ? "suggestion" : "suggestions"} waiting for you to
        check.
      </p>
      <Button asChild size="sm">
        <Link to="/renter/inventory/review">Review suggestions</Link>
      </Button>
    </section>
  );
}
