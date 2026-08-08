import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus,  Warehouse } from "lucide-react";

import { brand } from "@/config/brand";
import { AppLayout } from "@/components/layout/AppLayout";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/States";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PriceDisplay } from "@/components/marketplace/PriceDisplay";
import { toast } from "@/components/overlay/toast";
import {
  LISTING_STATUS_LABEL,
  formatM3,
  publicLocation,
  remainingVolume,
  spaceTypeLabel,
} from "@/lib/spaces";
import {
  listMySpaces,
  listSpacePhotos,
  pauseSpace,
  publishSpace,
  signedPhotoUrls,
  type Space,
} from "@/lib/spaces-api";

export const Route = createFileRoute("/_authenticated/host/spaces/")({
  head: () => ({
    meta: [
      { title: "My Spaces — Hosting — " + brand.name },
      { name: "description", content: "Manage the spaces you list, their status, capacity and pricing." },
      { property: "og:title", content: "My Spaces — Hosting — " + brand.name },
      { property: "og:description", content: "Manage the spaces you list, their status, capacity and pricing." },
    ],
  }),
  component: HostSpacesPage,
});

function HostSpacesPage() {
  const [spaces, setSpaces] = React.useState<Space[] | null>(null);
  const [covers, setCovers] = React.useState<Record<string, string>>({});
  const [failed, setFailed] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setFailed(false);
    try {
      const rows = await listMySpaces();
      setSpaces(rows);
      const paths: Record<string, string> = {};
      await Promise.all(
        rows.map(async (space) => {
          const photos = await listSpacePhotos(space.id);
          const first = photos[0];
          if (first) paths[space.id] = first.storage_path;
        }),
      );
      const signed = await signedPhotoUrls(Object.values(paths));
      const map: Record<string, string> = {};
      Object.entries(paths).forEach(([id, path]) => {
        const url = signed[path];
        if (url) map[id] = url;
      });
      setCovers(map);
    } catch {
      setFailed(true);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function toggleStatus(space: Space) {
    setBusyId(space.id);
    try {
      if (space.listing_status === "published") {
        await pauseSpace(space.id);
        toast.success("Listing paused", "Renters can no longer see it.");
      } else {
        await publishSpace(space.id);
        toast.success("Listing published", "Your space is live again.");
      }
      await load();
    } catch (error) {
      toast.error("Couldn't update the listing", error instanceof Error ? error.message : undefined);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AppLayout
      mode="host"
      title="My Spaces"
      description="Manage the spaces you list and their availability."
      actions={
        <Button asChild>
          <Link to="/host/spaces/new">
            <Plus className="size-4" aria-hidden="true" />
            Add another space
          </Link>
        </Button>
      }
    >
      {failed ? <ErrorState onRetry={() => void load()} /> : null}

      {!failed && spaces === null ? (
        <LoadingState label="Loading your spaces…" />
      ) : null}

      {!failed && spaces?.length === 0 ? (
        <EmptyState
          icon={Warehouse}
          title="You haven't listed a space yet."
          description="List your first space and we'll guide you through it, one question at a time."
        />
      ) : null}

      <ul className="grid gap-4 sm:grid-cols-2">
        {(spaces ?? []).map((space) => {
          const capacity = remainingVolume(
            space.estimated_available_volume_m3 === null ? null : Number(space.estimated_available_volume_m3),
            Number(space.reserved_volume_m3),
            Number(space.occupied_volume_m3),
          );
          return (
            <li
              key={space.id}
              className="overflow-hidden rounded-2xl border border-border bg-card shadow-card"
            >
              <div className="aspect-16/9 bg-muted">
                {covers[space.id] ? (
                  <img
                    src={covers[space.id]}
                    alt={`${space.title || "Storage space"} — cover photo`}
                    className="size-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="grid size-full place-items-center type-body-sm text-muted-foreground">
                    No photo yet
                  </div>
                )}
              </div>

              <div className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate type-h3">{space.title || "Untitled space"}</h2>
                    <p className="type-body-sm text-muted-foreground">
                      {spaceTypeLabel(space.space_type)} ·{" "}
                      {publicLocation(space.approximate_area, space.postcode_district, space.postcode)}
                    </p>
                  </div>
                  <Badge variant={space.listing_status === "published" ? "success" : "neutral"}>
                    {LISTING_STATUS_LABEL[space.listing_status]}
                  </Badge>
                </div>

                {space.monthly_price_pence ? <PriceDisplay amount={space.monthly_price_pence} /> : null}

                <dl className="grid grid-cols-2 gap-2 type-body-sm text-muted-foreground">
                  <div>
                    <dt>Estimated capacity</dt>
                    <dd className="tabular-nums text-foreground">{formatM3(capacity)}</dd>
                  </div>
                  <div>
                    <dt>Bookings</dt>
                    <dd className="tabular-nums text-foreground">0</dd>
                  </div>
                </dl>

                <div className="flex flex-wrap gap-2 pt-1">
                  {space.listing_status === "published" ? (
                    <Button asChild size="sm" variant="secondary">
                      <Link to="/spaces/$spaceId" params={{ spaceId: space.id }}>
                        View
                      </Link>
                    </Button>
                  ) : null}
                  <Button asChild size="sm" variant="secondary">
                    <Link to="/host/spaces/$spaceId/edit" params={{ spaceId: space.id }}>
                      Edit
                    </Link>
                  </Button>
                  {space.listing_status !== "draft" ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busyId === space.id}
                      onClick={() => void toggleStatus(space)}
                    >
                      {space.listing_status === "published" ? "Pause" : "Republish"}
                    </Button>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </AppLayout>
  );
}
