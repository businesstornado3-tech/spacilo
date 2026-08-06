import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import { brand } from "@/config/brand";
import { MarketingLayout, PageSection } from "@/components/layout/MarketingLayout";
import { ErrorState } from "@/components/common/States";
import { Button } from "@/components/ui/button";
import { ListingPreview, type ListingView } from "@/components/host/listing/ListingPreview";
import { publicLocation, spaceTypeLabel, type SpaceTypeValue } from "@/lib/spaces";
import { formatPrice } from "@/lib/format";
import { publicRouteMeta } from "@/lib/seo/meta";
import { breadcrumbJsonLd, jsonLdScript, listingJsonLd } from "@/lib/seo/structured-data";
import { getPublishedSpace, signedPhotoUrls } from "@/lib/spaces-api";
import { RequestSpaceCta } from "@/components/requests/RequestSpaceCta";
import { AskHostPanel } from "@/components/messages/AskHostPanel";
import { ListingSpaceFitPanel } from "@/components/spacefit/ListingSpaceFitPanel";
import { toMatchSpace } from "@/lib/spacefit/adapters";
import { SpaceReviews } from "@/components/reviews/SpaceReviews";
import { TrustSignals } from "@/components/trust/TrustSignals";
import { buildTrustSummary } from "@/lib/trust/signals";
import { useSpaceReviewSummary } from "@/hooks/useReviews";
import { track } from "@/lib/analytics/tracker";

/** Facts about a listing, sourced only from the published row and finished bookings. */
function SpaceTrustPanel({
  spaceId,
  listing,
}: {
  spaceId: string;
  listing: Awaited<ReturnType<typeof getPublishedSpace>>;
}) {
  const { data: summary } = useSpaceReviewSummary(spaceId);
  if (!listing) return null;
  return (
    <TrustSignals
      summary={buildTrustSummary(listing, {
        review_count: summary?.review_count ?? 0,
        average_rating: summary?.average_rating ?? null,
        completed_bookings: summary?.completed_bookings ?? 0,
      })}
    />
  );
}


export const Route = createFileRoute("/spaces/$spaceId")({
  /**
   * Meta-only loader: crawlers and social scrapers need a real title,
   * description and canonical for each listing. Failures are swallowed so a
   * transient backend error never blocks the page — the component owns the
   * real data fetch and its own error state.
   */
  loader: async ({ params }) => {
    try {
      return { row: await getPublishedSpace(params.spaceId) };
    } catch {
      return { row: null };
    }
  },
  head: ({ params, loaderData }) => {
    const row = loaderData?.row ?? null;
    const path = `/spaces/${params.spaceId}`;
    if (!row) {
      return publicRouteMeta({
        title: "Storage space — " + brand.name,
        description:
          "See photos, capacity, access and the monthly price for this local storage space.",
        path,
      });
    }
    const area = publicLocation(row.approximate_area, row.postcode_district);
    const type = spaceTypeLabel(row.space_type as SpaceTypeValue);
    const title = `${row.title ?? type} in ${area} — ${brand.name}`;
    const price =
      typeof row.monthly_price_pence === "number"
        ? ` from ${formatPrice(row.monthly_price_pence)} a month`
        : "";
    const description =
      `${type} storage in ${area}${price}. See photos, capacity, access and what this host accepts.`.slice(
        0,
        158,
      );
    return {
      ...publicRouteMeta({ title: title.slice(0, 70), description, path, ogType: "product" }),
      scripts: [
        jsonLdScript(
          listingJsonLd({
            id: row.id,
            title: row.title ?? `${type} in ${area}`,
            description: row.description ?? null,
            approximateArea: row.approximate_area ?? null,
            postcodeDistrict: row.postcode_district ?? null,
            monthlyPricePence: row.monthly_price_pence ?? null,
          }),
        ),
        jsonLdScript(
          breadcrumbJsonLd([
            { name: "Home", path: "/" },
            { name: "Search storage", path: "/search" },
            { name: row.title ?? type, path },
          ]),
        ),
      ],
    };
  },
  component: PublicSpacePage,
});

function PublicSpacePage() {
  const { spaceId } = Route.useParams();
  const [state, setState] = React.useState<
    { kind: "loading" } | { kind: "missing" } | { kind: "error" } | {
        kind: "ready";
        view: ListingView;
        matchSpace: ReturnType<typeof toMatchSpace>;
        /** Raw published row — geometry for the SpaceFit packing preview. */
        listing: Awaited<ReturnType<typeof getPublishedSpace>>;
      }
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
        listing: row,
        view: {
          title: row.title ?? "",
          spaceType: row.space_type,
          description: row.description ?? "",
          location: publicLocation(row.approximate_area, row.postcode_district),
          pricePence: row.monthly_price_pence,
          minimumStayDays: row.minimum_stay_days ?? null,
          availabilityMode: row.availability_mode ?? null,
          availableFrom: row.available_from ?? null,
          availableUntil: row.available_until ?? null,
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

  React.useEffect(() => {
    if (state.kind === "ready") track("listing_viewed", { props: { space_id: spaceId } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.kind, spaceId]);

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
              <div className="mt-6">
                <SpaceTrustPanel spaceId={spaceId} listing={state.listing} />
              </div>
              {state.matchSpace ? (
                <ListingSpaceFitPanel
                  space={state.matchSpace}
                  {...(state.listing ? { listing: state.listing } : {})}
                />
              ) : null}

              <div className="mt-6">
                <SpaceReviews spaceId={spaceId} />
              </div>
              <RequestSpaceCta spaceId={spaceId} />
              <AskHostPanel spaceId={spaceId} spaceTitle={state.view.title} />
            </div>
          </>
        ) : null}

      </PageSection>
    </MarketingLayout>
  );
}
