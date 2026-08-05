import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { brand } from "@/config/brand";
import { MarketingLayout } from "@/components/layout/MarketingLayout";
import { StorageSearch } from "@/components/search/StorageSearch";
import {
  filtersFromUrl,
  filtersToUrl,
  validateSearchParams,
  type SearchUrlState,
} from "@/lib/search-params";
import type { StorageSearchParams } from "@/hooks/useStorageSearch";
import { track } from "@/lib/analytics/tracker";
import * as React from "react";

const title = "Search storage near you — " + brand.name;
const description =
  "Search verified garages, lofts, sheds and spare rooms near your postcode. See distance, price and fit suitability on a map or in a list.";

export const Route = createFileRoute("/search")({
  validateSearch: validateSearchParams,
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SearchPage,
});

function SearchPage() {
  const state = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  // Fires once per distinct location search — a calm proxy for "a search happened".
  React.useEffect(() => {
    if (state.location) track("storage_search_started", { has_location: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.location]);

  const params: StorageSearchParams = {
    location: state.location,
    radius: state.radius,
    sort: state.sort,
    filters: filtersFromUrl(state),
  };

  function handleChange(next: Partial<StorageSearchParams>) {
    void navigate({
      search: (prev: SearchUrlState) => ({
        ...prev,
        ...(next.location !== undefined ? { location: next.location } : {}),
        ...(next.radius !== undefined ? { radius: next.radius } : {}),
        ...(next.sort !== undefined ? { sort: next.sort } : {}),
        ...(next.filters !== undefined ? filtersToUrl(next.filters) : {}),
      }),
      replace: true,
    });
  }

  return (
    <MarketingLayout>
      <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="type-h1">Storage near you</h1>
        <p className="mt-2 max-w-prose type-body text-muted-foreground">
          Enter a UK postcode or area to see published spaces nearby, with approximate distance and price.
        </p>
        <div className="mt-6">
          <StorageSearch params={params} onParamsChange={handleChange} />
        </div>
      </section>
    </MarketingLayout>
  );
}
