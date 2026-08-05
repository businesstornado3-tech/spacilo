import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Camera, Info, ScanSearch, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { brand } from "@/config/brand";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/common/Skeletons";
import { EmptyState } from "@/components/common/States";
import { DetectionCard, type DetectionDraft } from "@/components/inventory/DetectionCard";
import { useEnsuredInventory, useInventoryPhotos } from "@/hooks/useInventory";
import {
  useDetectionMutations,
  useLatestAnalysisRun,
  usePendingDetections,
} from "@/hooks/useSpaceFitVision";
import { signedInventoryPhotoUrls } from "@/lib/inventory-api";
import type { ItemCategory } from "@/lib/inventory-model";

const title = "Review Spacilo AI results — " + brand.name;
const description = "Check what Spacilo AI spotted in your photos before adding it to My Stuff.";

export const Route = createFileRoute("/_authenticated/renter/inventory/review")({
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
  component: ReviewPage,
});

function ReviewPage() {
  const navigate = useNavigate();
  const { data: inventory, isLoading } = useEnsuredInventory();
  const { data: detections, isLoading: loadingDetections } = usePendingDetections(inventory?.id);
  const { data: run } = useLatestAnalysisRun(inventory?.id);
  const { data: photos } = useInventoryPhotos(inventory?.id);
  const { confirm, discardAll } = useDetectionMutations(inventory?.id);

  const [drafts, setDrafts] = React.useState<Record<string, DetectionDraft>>({});
  const [urls, setUrls] = React.useState<Record<string, string>>({});

  const list = React.useMemo(() => detections ?? [], [detections]);

  React.useEffect(() => {
    setDrafts((current) => {
      const next = { ...current };
      for (const detection of list) {
        if (next[detection.id]) continue;
        next[detection.id] = {
          keep: detection.inventory_intent !== "likely_environment",
          label: detection.detected_label,
          quantity: detection.suggested_quantity,
          category: detection.suggested_category as ItemCategory,
          catalogueKey: detection.suggested_catalogue_key,
          edited: false,
        };
      }
      return next;
    });
  }, [list]);

  React.useEffect(() => {
    const paths = (photos ?? []).map((photo) => photo.storage_path);
    if (paths.length === 0) return;
    let active = true;
    void signedInventoryPhotoUrls(paths).then((map) => {
      if (active) setUrls(map);
    });
    return () => {
      active = false;
    };
  }, [photos]);

  const pathById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const photo of photos ?? []) map.set(photo.id, photo.storage_path);
    return map;
  }, [photos]);

  // Environment objects (garage shelving, fixed cupboards, doors) are kept in
  // the run for debugging but never presented as ordinary suggestions.
  const suggestions = list.filter((d) => d.inventory_intent !== "likely_environment");
  const environment = list.filter((d) => d.inventory_intent === "likely_environment");

  const kept = list.filter((detection) => drafts[detection.id]?.keep);
  const totalItems = kept.reduce((sum, d) => sum + (drafts[d.id]?.quantity ?? 0), 0);

  const onConfirm = async () => {
    if (!inventory) return;
    const decisions = kept.map((detection) => {
      const draft = drafts[detection.id]!;
      return {
        detection,
        itemName: draft.label.trim() || detection.detected_label,
        category: draft.category,
        catalogueKey: draft.catalogueKey,
        quantity: draft.quantity,
        edited: draft.edited,
      };
    });

    const rejected = list.filter((detection) => !drafts[detection.id]?.keep);
    const added = await confirm.mutateAsync(decisions);
    await Promise.all(
      rejected.map((detection) =>
        confirmRejection(detection.id).catch(() => undefined),
      ),
    );
    toast.success(
      added > 0 ? `${added} ${added === 1 ? "item" : "items"} added to My Stuff.` : "Results reviewed.",
    );
    void navigate({ to: "/renter/inventory" });
  };

  return (
    <AppLayout
      mode="renter"
      title="Here's what we think you're storing."
      description="These are suggestions, not measurements. Edit anything that isn't right — nothing is added until you confirm."
    >
      {isLoading || loadingDetections ? (
        <Skeleton className="h-72 w-full" />
      ) : list.length === 0 ? (
        <div className="space-y-4">
          <EmptyState
            icon={ScanSearch}
            title="Nothing to review right now."
            description={
              run?.status === "failed"
                ? "The last scan didn't complete. You can try analysing your photos again."
                : "Upload photos and run Spacilo AI to see suggestions here."
            }
          />
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild>
              <Link to="/renter/inventory/photos">
                <Camera aria-hidden="true" />
                Inventory photos
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link to="/renter/inventory">View My Stuff</Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-6 pb-28">
          <section className="rounded-2xl border border-border bg-secondary/60 p-4">
            <h2 className="flex items-center gap-2 type-h3">
              <Sparkles className="size-4 text-primary" aria-hidden="true" />
              {suggestions.length} {suggestions.length === 1 ? "suggestion" : "suggestions"} from
              your photos
            </h2>
            <p className="mt-2 flex gap-2 type-body-sm text-muted-foreground">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              Sizes come from our UK item catalogue, not from your photos, so they&apos;re typical
              estimates you can adjust at any time.
            </p>
          </section>

          <ul className="space-y-3">
            {suggestions.map((detection) => {
              const draft = drafts[detection.id];
              if (!draft) return null;
              const thumbnails = detection.photo_ids
                .map((id) => pathById.get(id))
                .map((path) => (path ? urls[path] : undefined))
                .filter((value): value is string => Boolean(value));
              return (
                <DetectionCard
                  key={detection.id}
                  detection={detection}
                  draft={draft}
                  thumbnails={thumbnails}
                  onChange={(next) => setDrafts((current) => ({ ...current, [detection.id]: next }))}
                />
              );
            })}
          </ul>

          {environment.length > 0 ? (
            <details className="rounded-2xl border border-border bg-secondary/40 p-4">
              <summary className="cursor-pointer type-body-sm font-medium">
                {environment.length} {environment.length === 1 ? "thing" : "things"} we think are
                part of the room
              </summary>
              <p className="mt-2 type-body-sm text-muted-foreground">
                These look like fixtures such as shelving, doors or fitted cupboards, so we
                haven&apos;t added them. If one is actually yours to store, tap &ldquo;Keep
                it&rdquo;.
              </p>
              <ul className="mt-3 space-y-3">
                {environment.map((detection) => {
                  const draft = drafts[detection.id];
                  if (!draft) return null;
                  const thumbnails = detection.photo_ids
                    .map((id) => pathById.get(id))
                    .map((path) => (path ? urls[path] : undefined))
                    .filter((value): value is string => Boolean(value));
                  return (
                    <DetectionCard
                      key={detection.id}
                      detection={detection}
                      draft={draft}
                      thumbnails={thumbnails}
                      onChange={(next) =>
                        setDrafts((current) => ({ ...current, [detection.id]: next }))
                      }
                    />
                  );
                })}
              </ul>
            </details>
          ) : null}

          <Button
            variant="ghost"
            onClick={() => {
              void discardAll.mutateAsync().then(() => {
                toast.success("Suggestions discarded.");
                void navigate({ to: "/renter/inventory" });
              });
            }}
          >
            Discard all suggestions
          </Button>

          <div className="fixed inset-x-0 bottom-16 z-30 border-t border-border bg-background/95 px-4 py-3 backdrop-blur md:bottom-0">
            <div className="mx-auto flex max-w-6xl items-center gap-3">
              <p className="hidden min-w-0 flex-1 type-body-sm text-muted-foreground sm:block">
                {kept.length} of {suggestions.length} kept · {totalItems}{" "}
                {totalItems === 1 ? "item" : "items"} will be added
              </p>
              <Button className="ml-auto" onClick={() => void onConfirm()} disabled={confirm.isPending}>
                {confirm.isPending ? "Adding…" : "Confirm my inventory"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}

async function confirmRejection(id: string) {
  const { rejectDetection } = await import("@/lib/detections-api");
  await rejectDetection(id);
}
