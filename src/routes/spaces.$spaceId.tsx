import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import { brand } from "@/config/brand";
import { MarketingLayout, PageSection } from "@/components/layout/MarketingLayout";
import { ErrorState } from "@/components/common/States";
import { Button } from "@/components/ui/button";
import { publicLocation, spaceTypeLabel, type SpaceTypeValue } from "@/lib/spaces";
import { formatPrice } from "@/lib/format";
import { publicRouteMeta } from "@/lib/seo/meta";
import {
  breadcrumbJsonLd,
  faqJsonLd,
  jsonLdScript,
  listingJsonLd,
} from "@/lib/seo/structured-data";
import { getPublishedSpace, listPublishedSpaces, signedPhotoUrls } from "@/lib/spaces-api";
import { RequestSpaceCta } from "@/components/requests/RequestSpaceCta";
import { AskHostPanel } from "@/components/messages/AskHostPanel";
import { ListingSpaceFitPanel } from "@/components/spacefit/ListingSpaceFitPanel";
import { toMatchSpace } from "@/lib/spacefit/adapters";
import { SpaceReviews } from "@/components/reviews/SpaceReviews";
import { TrustSignals } from "@/components/trust/TrustSignals";
import { buildTrustSummary } from "@/lib/trust/signals";
import { useSpaceReviewSummary } from "@/hooks/useReviews";
import { useSuitabilityProfile } from "@/hooks/usePolicy";
import { SuitabilitySummary } from "@/components/policy/SuitabilitySummary";
import { HostTrustProfile } from "@/components/trust/HostTrustProfile";
import { AvailabilityCalendar } from "@/components/marketplace/AvailabilityCalendar";
import { usePublicHostProfile, useSpaceAvailability } from "@/hooks/useListingPublic";
import { track } from "@/lib/analytics/tracker";
import { ListingGallery } from "@/components/listing/ListingGallery";
import { BookingPanel } from "@/components/listing/BookingPanel";
import {
  ListingAbout,
  ListingFacts,
  ListingFaq,
  ListingHost,
  ListingLocation,
  SimilarListings,
  type SimilarListing,
} from "@/components/listing/ListingSections";
import { buildListingFaq } from "@/lib/marketplace/listing-faq";
import { availabilityLabel } from "@/lib/spaces";

type PublishedSpace = NonNullable<Awaited<ReturnType<typeof getPublishedSpace>>>;

/** Facts about a listing, sourced only from the published row and finished bookings. */
function SpaceTrustPanel({ spaceId, listing }: { spaceId: string; listing: PublishedSpace }) {
  const { data: summary } = useSpaceReviewSummary(spaceId);
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

/** Host-declared suitability, read through the public projection. */
function SpaceSuitabilityPanel({ spaceId }: { spaceId: string }) {
  const { data: profile } = useSuitabilityProfile(spaceId);
  if (!profile) return null;
  return <SuitabilitySummary profile={profile} />;
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
        jsonLdScript(faqJsonLd(buildListingFaq(row))),
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

interface ReadyState {
  kind: "ready";
  listing: PublishedSpace;
  photoUrls: string[];
  matchSpace: ReturnType<typeof toMatchSpace>;
}

function PublicSpacePage() {
  const { spaceId } = Route.useParams();
  const [state, setState] = React.useState<
    { kind: "loading" } | { kind: "missing" } | { kind: "error" } | ReadyState
  >({ kind: "loading" });
  const [similar, setSimilar] = React.useState<SimilarListing[]>([]);
  const askRef = React.useRef<HTMLDivElement | null>(null);

  const load = React.useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const row = await getPublishedSpace(spaceId);
      if (!row) return setState({ kind: "missing" });
      const paths: string[] = Array.isArray(row.photo_paths) ? (row.photo_paths as string[]) : [];
      const signed = await signedPhotoUrls(paths);
      setState({
        kind: "ready",
        listing: row,
        matchSpace: toMatchSpace(row),
        photoUrls: paths.map((p) => signed[p]).filter(Boolean) as string[],
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
  }, [state.kind, spaceId]);

  /** Other published spaces, preferring the same postcode district. */
  const district = state.kind === "ready" ? state.listing.postcode_district : null;
  React.useEffect(() => {
    let cancelled = false;
    if (state.kind !== "ready") return;
    void (async () => {
      try {
        const rows = await listPublishedSpaces(24);
        const others = rows.filter((r) => r.id !== spaceId);
        const nearby = others.filter((r) => r.postcode_district === district);
        const picked = (nearby.length ? nearby : others).slice(0, 4);
        const covers = await signedPhotoUrls(
          picked.map((r) => r.cover_path).filter(Boolean) as string[],
        );
        if (cancelled) return;
        setSimilar(
          picked.map((r) => ({
            id: r.id,
            title: r.title ?? spaceTypeLabel(r.space_type as SpaceTypeValue),
            area: publicLocation(r.approximate_area, r.postcode_district),
            pricePence: r.monthly_price_pence ?? null,
            volumeM3:
              r.estimated_available_volume_m3 === null
                ? null
                : Number(r.estimated_available_volume_m3),
            photoUrl: r.cover_path ? covers[r.cover_path] : undefined,
          })),
        );
      } catch {
        if (!cancelled) setSimilar([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state.kind, spaceId, district]);

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
            <h1 className="type-h1">This space isn&apos;t available</h1>
            <p className="mt-3 type-body text-muted-foreground">
              It may have been paused or removed by the host.
            </p>
            <Button asChild className="mt-6">
              <Link to="/find-storage">Find storage nearby</Link>
            </Button>
          </div>
        ) : null}

        {state.kind === "ready" ? (
          <ListingDetail
            spaceId={spaceId}
            listing={state.listing}
            photoUrls={state.photoUrls}
            matchSpace={state.matchSpace}
            similar={similar}
            askRef={askRef}
          />
        ) : null}
      </PageSection>
    </MarketingLayout>
  );
}

function ListingDetail({
  spaceId,
  listing,
  photoUrls,
  matchSpace,
  similar,
  askRef,
}: {
  spaceId: string;
  listing: PublishedSpace;
  photoUrls: string[];
  matchSpace: ReturnType<typeof toMatchSpace>;
  similar: SimilarListing[];
  askRef: React.RefObject<HTMLDivElement | null>;
}) {
  const area = publicLocation(listing.approximate_area, listing.postcode_district);
  const type = spaceTypeLabel(listing.space_type as SpaceTypeValue);
  const heading = listing.title ?? `${type} in ${area}`;
  const availability = availabilityLabel({
    availability_mode: listing.availability_mode ?? null,
    available_from: listing.available_from ?? null,
    available_until: listing.available_until ?? null,
  });

  return (
    <div className="mx-auto max-w-6xl">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 pb-4 sm:flex sm:flex-wrap sm:justify-between">
        <div className="min-w-0">
          <p className="type-overline text-muted-foreground">{type}</p>
          <h1 className="mt-1 type-h1">{heading}</h1>
          <p className="mt-1 type-body-sm text-muted-foreground">{area}</p>
        </div>
      </header>

      <ListingGallery photoUrls={photoUrls} title={heading} />

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start">
        <div className="min-w-0 space-y-6">
          <ListingAbout
            description={listing.description ?? null}
            spaceType={listing.space_type ?? null}
            location={area}
          />
          <ListingFacts row={listing} />
          <SpaceTrustPanel spaceId={spaceId} listing={listing} />
          {matchSpace ? <ListingSpaceFitPanel space={matchSpace} listing={listing} /> : null}
          <SpaceSuitabilityPanel spaceId={spaceId} />
          <ListingHost
            hostName={listing.host_display_name ?? "Your host"}
            phoneVerified={listing.host_phone_verified ?? false}
            publishedAt={listing.published_at ?? null}
            onAsk={() => askRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
          />
          <ListingLocation
            approximateArea={listing.approximate_area ?? null}
            postcodeDistrict={listing.postcode_district ?? null}
          />
          <HostProfilePanel spaceId={spaceId} />
          <AvailabilityPanel spaceId={spaceId} />
          <SpaceReviews spaceId={spaceId} />
          <ListingFaq entries={buildListingFaq(listing)} />
          <div ref={askRef}>
            <AskHostPanel spaceId={spaceId} spaceTitle={heading} />
          </div>
          <SimilarListings listings={similar} />
        </div>

        <div className="min-w-0 lg:sticky lg:top-24">
          <BookingPanel
            spaceId={spaceId}
            monthlyPricePence={listing.monthly_price_pence ?? null}
            weeklyPricePence={listing.weekly_price_pence ?? null}
            dailyPricePence={listing.daily_price_pence ?? null}
            minimumStayDays={listing.minimum_stay_days ?? null}
            availabilityNote={availability}
          />
        </div>
      </div>
    </div>
  );
}

/** Public host facts, read through the SECURITY DEFINER projection. */
function HostProfilePanel({ spaceId }: { spaceId: string }) {
  const { data, isLoading } = usePublicHostProfile(spaceId);
  return <HostTrustProfile profile={data} isLoading={isLoading} />;
}

/** Booked and out-of-window dates. Open dates indicate, they don't reserve. */
function AvailabilityPanel({ spaceId }: { spaceId: string }) {
  const { data, isLoading } = useSpaceAvailability(spaceId);
  return <AvailabilityCalendar ranges={data} isLoading={isLoading} />;
}
