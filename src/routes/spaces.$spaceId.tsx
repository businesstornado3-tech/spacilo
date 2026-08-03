import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import { brand } from "@/config/brand";
import { MarketingLayout, PageSection } from "@/components/layout/MarketingLayout";
import { ErrorState } from "@/components/common/States";
import { Button } from "@/components/ui/button";
import { ListingPreview, type ListingView } from "@/components/host/listing/ListingPreview";
import { publicLocation } from "@/lib/spaces";
import { getPublishedSpace, signedPhotoUrls } from "@/lib/spaces-api";
import { RequestSpaceCta } from "@/components/requests/RequestSpaceCta";
import { ListingSpaceFitPanel } from "@/components/spacefit/ListingSpaceFitPanel";
import { toMatchSpace } from "@/lib/spacefit/adapters";

export const Route = createFileRoute("/spaces/$spaceId")({
  head: () => ({
    meta: [
      { title: "Storage space — " + brand.name },
      { name: "description", content: "See photos, capacity, access and monthly price for this local storage space." },
      { property: "og:title", content: "Storage space — " + brand.name },
      { property: "og:description", content: "See photos, capacity, access and monthly price for this local storage space." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PublicSpacePage,
});

function PublicSpacePage() {
  const { spaceId } = Route.useParams();
  const [state, setState] = React.useState<
    { kind: "loading" } | { kind: "missing" } | { kind: "error" } | { kind: "ready"; view: ListingView; matchSpace: ReturnType<typeof toMatchSpace> }
  >({ kind: "loading" });

  const load = React.useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const row = await getPublishedSpace(spaceId);
      if (!row) return setState({ kind: "missing" });
      const paths: string[] = Array.isArray(row.photo_paths) ? (row.photo_paths as string[]) : [];
      const signed = await signedPhotoUrls(paths);
      setState({
        kind: "ready",
        matchSpace: toMatchSpace(row),
        view: {
          title: row.title ?? "",
          spaceType: row.space_type,
          description: row.description ?? "",
          location: publicLocation(row.approximate_area, row.postcode_district),
          pricePence: row.monthly_price_pence,
          minimumMonths: row.minimum_storage_period_months ?? 1,
          storageMode: row.storage_mode,
          hostAvailablePercentage: row.host_available_percentage,
          floorAreaM2: row.floor_area_m2 === null ? null : Number(row.floor_area_m2),
          totalVolumeM3: row.total_volume_m3 === null ? null : Number(row.total_volume_m3),
          availableVolumeM3:
            row.estimated_available_volume_m3 === null ? null : Number(row.estimated_available_volume_m3),
          features: row.features ?? [],
          acceptedCategories: row.accepted_categories ?? [],
          restrictions: row.host_restrictions ?? [],
          restrictionNotes: row.restriction_notes,
          accessType: row.access_type,
          accessNotes: row.access_notes,
          accessFrequency: row.access_frequency,
          hostName: row.host_display_name ?? "Your host",
          hostPhoneVerified: row.host_phone_verified ?? false,
          photoUrls: paths.map((p) => signed[p]).filter(Boolean) as string[],
        },
      });
    } catch {
      setState({ kind: "error" });
    }
  }, [spaceId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  return (
    <MarketingLayout>
      <PageSection>
        {state.kind === "loading" ? (
          <div className="flex justify-center py-20">
            <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
          </div>
        ) : null}

        {state.kind === "error" ? <ErrorState onRetry={() => void load()} /> : null}

        {state.kind === "missing" ? (
          <div className="mx-auto max-w-md py-16 text-center">
            <h1 className="type-h1">This space isn't available</h1>
            <p className="mt-3 type-body text-muted-foreground">
              It may have been paused or removed by the host.
            </p>
            <Button asChild className="mt-6">
              <Link to="/find-storage">Find storage nearby</Link>
            </Button>
          </div>
        ) : null}

        {state.kind === "ready" ? (
          <>
            <h1 className="sr-only">{state.view.title}</h1>
            <div className="mx-auto max-w-3xl">
              <ListingPreview view={state.view} />
              {state.matchSpace ? <ListingSpaceFitPanel space={state.matchSpace} /> : null}
              <RequestSpaceCta spaceId={spaceId} />
            </div>
          </>
        ) : null}

      </PageSection>
    </MarketingLayout>
  );
}
