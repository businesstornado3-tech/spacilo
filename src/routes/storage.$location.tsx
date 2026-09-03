import * as React from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Search, MapPin } from "lucide-react";

import { brand } from "@/config/brand";
import { MarketingLayout, PageSection } from "@/components/layout/MarketingLayout";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/States";
import { placeBySlug, listingMatchesPlace } from "@/lib/discovery/locations";
import { listPublishedSpaces } from "@/lib/spaces-api";
import { formatPrice } from "@/lib/format";
import { publicRouteMeta } from "@/lib/seo/meta";
import { breadcrumbJsonLd, jsonLdScript, webPageJsonLd } from "@/lib/seo/structured-data";
import { track } from "@/lib/analytics/tracker";

export const Route = createFileRoute("/storage/$location")({
  loader: async ({ params }) => {
    const place = placeBySlug(params.location);
    if (!place) throw notFound();
    try {
      const spaces = await listPublishedSpaces(100);
      return { place, publishedSpaces: spaces.filter((space) => listingMatchesPlace(space, place)) };
    } catch {
      return { place, publishedSpaces: [] };
    }
  },
  head: ({ params, loaderData }) => {
    const place = loaderData?.place ?? placeBySlug(params.location);
    if (!place) return { ...publicRouteMeta({ title: `Storage — ${brand.name}`, description: "Find published storage.", path: `/storage/${params.location}` }) };
    const path = `/storage/${place.slug}`;
    const title = `Storage in ${place.name} — ${brand.name}`;
    const description = `See published storage spaces in ${place.name}, with approximate location, price and fit information.`;
    const meta = publicRouteMeta({ title, description, path });
    const hasSupply = (loaderData?.publishedSpaces.length ?? 0) > 0;
    return {
      ...meta,
      meta: meta.meta.map((entry) => ("name" in entry && entry.name === "robots" ? { ...entry, content: hasSupply ? "index, follow" : "noindex, follow" } : entry)),
      scripts: [jsonLdScript(webPageJsonLd({ name: title, description, path })), jsonLdScript(breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Storage", path: "/search" }, { name: place.name, path }]))],
    };
  },
  component: LocationPage,
});

function LocationPage() {
  const { place } = Route.useLoaderData();
  const [state, setState] = React.useState<{ status: "loading" | "ready" | "error"; spaces: Awaited<ReturnType<typeof listPublishedSpaces>> }>({ status: "loading", spaces: [] });
  React.useEffect(() => { track("discovery_location_viewed", { props: { location: place.slug } }); let cancelled = false; void listPublishedSpaces(100).then((spaces) => { if (!cancelled) setState({ status: "ready", spaces: spaces.filter((space) => listingMatchesPlace(space, place)) }); }).catch(() => { if (!cancelled) setState((current) => ({ ...current, status: "error" })); }); return () => { cancelled = true; }; }, [place]);
  return <MarketingLayout><PageSection><p className="type-overline text-muted-foreground">Storage in {place.name}</p><h1 className="mt-2 type-h1">Find storage in {place.name}</h1><p className="mt-4 max-w-2xl type-body text-muted-foreground">Published spaces are shown using approximate location only. Exact addresses are shared only after a booking is confirmed.</p>{state.status === "loading" ? <LoadingState className="mt-8" label={`Checking published spaces in ${place.name}…`} /> : state.status === "error" ? <ErrorState className="mt-8" title="Storage availability is temporarily unavailable" description="Try the wider search to see published spaces near your postcode." secondaryAction={<Button asChild variant="secondary"><Link to="/search"><Search />Search storage</Link></Button>} /> : state.spaces.length === 0 ? <EmptyState className="mt-8" icon={MapPin} title={`No published spaces in ${place.name} yet`} description="This page does not claim availability. Search a nearby postcode or check back later as hosts publish space." action={<Button asChild><Link to="/search"><Search />Search nearby storage</Link></Button>} /> : <div className="mt-8 grid gap-4 sm:grid-cols-2">{state.spaces.map((space) => <Link key={space.id} to="/spaces/$spaceId" params={{ spaceId: space.id }} className="rounded-2xl border border-border bg-card p-5 hover:border-primary/50"><h2 className="type-h3">{space.title ?? "Storage space"}</h2><p className="mt-2 type-body-sm text-muted-foreground">{space.approximate_area ?? place.name}</p>{typeof space.monthly_price_pence === "number" ? <p className="mt-4 type-body-lg font-semibold">{formatPrice(space.monthly_price_pence)} a month</p> : null}</Link>)}</div>}<div className="mt-8"><Button asChild variant="secondary"><Link to="/search"><Search />Search all published storage</Link></Button></div></PageSection></MarketingLayout>;
}
