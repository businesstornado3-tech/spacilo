import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Check, Info } from "lucide-react";

import { brand } from "@/config/brand";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/common/Skeletons";
import { InventoryPhotoManager } from "@/components/inventory/InventoryPhotoManager";
import { AnalysePhotosPanel } from "@/components/inventory/AnalysePhotosPanel";
import { useEnsuredInventory, useInventoryPhotos } from "@/hooks/useInventory";


const title = "Inventory photos — " + brand.name;
const description = "Upload photos of the belongings you want to store.";

export const Route = createFileRoute("/_authenticated/renter/inventory/photos")({
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
  component: InventoryPhotosPage,
});

const GUIDANCE = [
  "Use good lighting",
  "Try to show whole items",
  "Take another photo if items overlap heavily",
  "Photograph large items from a useful angle",
  "You can review everything before searching",
];

function InventoryPhotosPage() {
  const navigate = useNavigate();
  const { data: inventory, isLoading } = useEnsuredInventory();
  const { data: photos } = useInventoryPhotos(inventory?.id);
  const list = photos ?? [];


  return (
    <AppLayout
      mode="renter"
      title="Show us what you want to store."
      description="Upload clear photos of your belongings. SpaceFit AI will be able to analyse these in the next stage."
    >
      {isLoading || !inventory ? (
        <Skeleton className="h-72 w-full" />
      ) : (
        <div className="space-y-8">
          <section className="rounded-2xl border border-border bg-secondary/60 p-4">
            <h2 className="type-h3">For better results later:</h2>
            <ul className="mt-3 space-y-2">
              {GUIDANCE.map((line) => (
                <li key={line} className="flex gap-2 type-body-sm text-muted-foreground">
                  <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                  {line}
                </li>
              ))}
            </ul>
          </section>

          <InventoryPhotoManager inventoryId={inventory.id} photos={list} />

          {list.length > 0 ? (
            <section className="rounded-2xl border border-border bg-card p-5">
              <h2 className="type-h2">Photos ready</h2>
              <p className="mt-1 type-body text-muted-foreground">
                {list.length} {list.length === 1 ? "photo" : "photos"} uploaded.
              </p>
              <p className="mt-3 flex gap-2 type-body-sm text-muted-foreground">
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                Automatic item detection is coming in the SpaceFit AI build. Your photos are stored
                privately until then.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button asChild>
                  <Link to="/renter/inventory/add">Add items manually</Link>
                </Button>
                <Button asChild variant="secondary">
                  <Link to="/renter/inventory">View my inventory</Link>
                </Button>
              </div>
            </section>
          ) : null}
        </div>
      )}
    </AppLayout>
  );
}
