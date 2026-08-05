import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { brand } from "@/config/brand";
import { AppLayout } from "@/components/layout/AppLayout";
import { StorageSearch } from "@/components/search/StorageSearch";
import {
  filtersFromUrl,
  filtersToUrl,
  validateSearchParams,
  type SearchUrlState,
} from "@/lib/search-params";
import type { StorageSearchParams } from "@/hooks/useStorageSearch";

export const Route = createFileRoute("/_authenticated/renter/search")({
  validateSearch: validateSearchParams,
  head: () => ({
    meta: [
      { title: "Search — Renting — " + brand.name },
      { name: "description", content: "Find storage near you and compare fit matches." },
      { property: "og:title", content: "Search — Renting — " + brand.name },
      { property: "og:description", content: "Find storage near you and compare fit matches." },
    ],
  }),
  component: RenterSearchPage,
});

function RenterSearchPage() {
  const state = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

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
    <AppLayout
      mode="renter"
      title="Search"
      description="Find storage near you and compare fit matches."
    >
      <StorageSearch params={params} onParamsChange={handleChange} />
    </AppLayout>
  );
}
