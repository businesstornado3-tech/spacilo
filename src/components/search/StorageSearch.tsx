/**
 * The one storage discovery experience.
 *
 * Rendered by the public /search route and by the renter Search tab. Location
 * ("is it near me?") and SpaceFit ("does it suit my stuff?") stay separate:
 * distance is never folded into the SpaceFit score.
 */
import * as React from "react";
import { Link } from "@tanstack/react-router";
import { ClientOnly } from "@tanstack/react-router";
import { List, Loader2, Map as MapIcon, SearchX } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { controlBase } from "@/components/form/Field";
import { SearchControls } from "@/components/search/SearchControls";
import { SearchFiltersPanel } from "@/components/search/SearchFilters";
import { SearchResultCard } from "@/components/search/SearchResultCard";
import type { MapSpace } from "@/components/search/StorageMap";
import { useStorageSearch, type SearchFilters, type SortKey, type StorageSearchParams } from "@/hooks/useStorageSearch";
import { track } from "@/lib/analytics/tracker";
import { estimateRequiredSpace } from "@/lib/spacefit/requirement";
import { formatVolume } from "@/lib/inventory-model";
import { useAuth } from "@/hooks/useAuth";

const StorageMap = React.lazy(() => import("@/components/search/StorageMap"));

const SORTS_WITH_INVENTORY: { value: SortKey; label: string }[] = [
  { value: "recommended", label: "Recommended" },
  { value: "spacefit", label: "Best fit" },
  { value: "distance", label: "Nearest" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
];

const SORTS_WITHOUT_INVENTORY = SORTS_WITH_INVENTORY.filter((s) => s.value !== "spacefit");

export interface StorageSearchProps {
  params: StorageSearchParams;
  onParamsChange: (next: Partial<StorageSearchParams>) => void;
}

export function StorageSearch({ params, onParamsChange }: StorageSearchProps) {
  const { session } = useAuth();
  const [view, setView] = React.useState<"list" | "map">("list");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const search = useStorageSearch(params);
  const { centre, results, hasInventory, items, geocodeError, nearbyCount, incompatibleCount, isLoading } =
    search;
  // Deterministic requirement, so the renter can size spaces themselves too.
  const requirement = hasInventory ? estimateRequiredSpace(items) : null;

  const mapSpaces: MapSpace[] = React.useMemo(
    () =>
      results
        .filter((r) => r.row.approx_latitude !== null && r.row.approx_longitude !== null)
        .map((r) => ({
          id: r.row.id,
          title: r.row.title ?? "Storage space",
          lat: Number(r.row.approx_latitude),
          lng: Number(r.row.approx_longitude),
          pricePence: r.row.monthly_price_pence,
        })),
    [results],
  );

  const sorts = hasInventory ? SORTS_WITH_INVENTORY : SORTS_WITHOUT_INVENTORY;

  const spaceFitHref = session
    ? { to: "/renter/inventory" }
    : { to: "/signup", search: { mode: "renter" } };

  function handleMarker(id: string) {
    setSelectedId(id);
    track("search_refined", { props: { control: "map_marker" } });
    if (view === "list") {
      document.getElementById(`result-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  const noResults = !isLoading && results.length === 0;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-4 shadow-card sm:p-5">
        <SearchControls
          initialLocation={params.location}
          initialRadius={params.radius}
          layout="inline"
          busy={isLoading}
          error={geocodeError}
          submitLabel="Search"
          onSubmit={({ location, radius }) => onParamsChange({ location, radius })}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="type-body-sm text-muted-foreground" aria-live="polite">
            {isLoading
              ? "Searching…"
              : `${results.length} ${results.length === 1 ? "space" : "spaces"}${
                  centre ? ` within ${params.radius} ${params.radius === 1 ? "mile" : "miles"} of ${centre.label}` : ""
                }`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SearchFiltersPanel
            filters={params.filters}
            onChange={(filters: SearchFilters) => onParamsChange({ filters })}
          />
          <label htmlFor="sort" className="sr-only">
            Sort results
          </label>
          <select
            id="sort"
            className={cn(controlBase, "h-10 w-auto py-0")}
            value={params.sort}
            onChange={(e) => {
              const sort = e.target.value as SortKey;
              track("search_refined", { props: { control: "sort", sort } });
              onParamsChange({ sort });
            }}
          >
            {sorts.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <div className="inline-flex rounded-xl border border-border p-0.5 lg:hidden" role="group" aria-label="Results view">
            <button
              type="button"
              onClick={() => setView("list")}
              aria-pressed={view === "list"}
              className={cn(
                "inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 type-body-sm",
                view === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground",
              )}
            >
              <List className="size-4" aria-hidden="true" />
              List
            </button>
            <button
              type="button"
              onClick={() => setView("map")}
              aria-pressed={view === "map"}
              className={cn(
                "inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 type-body-sm",
                view === "map" ? "bg-primary text-primary-foreground" : "text-muted-foreground",
              )}
            >
              <MapIcon className="size-4" aria-hidden="true" />
              Map
            </button>
          </div>
        </div>
      </div>

      {!hasInventory && results.length > 0 ? (
        <div className="rounded-2xl border border-signal/25 bg-signal-soft/40 p-4">
          <p className="type-label">Not sure how much space you need?</p>
          <p className="mt-1 type-body-sm text-signal-soft-foreground">
            Spacilo AI compares your belongings with each space and shows how well they suit each other. It's an
            estimate, not a guarantee.
          </p>
          <Button asChild size="sm" className="mt-3">
            <Link
              to={spaceFitHref.to}
              search={spaceFitHref.search as never}
              onClick={() => track("cta_clicked", { props: { cta: "scan_stuff", from: "search_banner" } })}
            >
              Get your fit score
            </Link>
          </Button>
        </div>
      ) : null}

      {noResults ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-card">
          <SearchX className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <h2 className="mt-3 type-h3">
            {centre
              ? `No storage spaces found within ${params.radius} ${params.radius === 1 ? "mile" : "miles"} of ${centre.label}.`
              : "No storage spaces found."}
          </h2>
          <p className="mt-2 type-body-sm text-muted-foreground">
            {nearbyCount > 0
              ? `${nearbyCount} ${nearbyCount === 1 ? "space is" : "spaces are"} nearby, but none match your current filters.`
              : "We're starting in Portsmouth, so coverage is still growing."}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Button onClick={() => onParamsChange({ radius: Math.min(params.radius * 2, 20) })}>
              Search within {Math.min(params.radius * 2, 20)} miles
            </Button>
            <Button variant="secondary" onClick={() => onParamsChange({ filters: {} })}>
              Clear filters
            </Button>
          </div>
        </div>
      ) : null}

      {requirement ? (
        <p className="type-body-sm text-muted-foreground">
          Your confirmed stuff needs roughly{" "}
          <strong className="text-foreground">{formatVolume(requirement.requiredVolumeM3)}</strong> of usable
          storage
          {requirement.requiredFloorAreaM2 > 0
            ? ` and about ${requirement.requiredFloorAreaM2.toFixed(1)} m² of floor space`
            : ""}
          . Spaces smaller than that are flagged below.
        </p>
      ) : null}

      {hasInventory && incompatibleCount > 0 ? (
        <p className="type-body-sm text-muted-foreground">
          {incompatibleCount} nearby {incompatibleCount === 1 ? "space is" : "spaces are"} shown but{" "}
          {incompatibleCount === 1 ? "does" : "do"} not currently match all of your confirmed storage needs — open
          "Why this matches" on a card to see why.
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,47fr)_minmax(0,53fr)]">
        <div className={cn("space-y-4", view === "map" && "hidden lg:block")}>
          {isLoading ? (
            <p className="flex items-center gap-2 type-body-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Finding storage near you…
            </p>
          ) : null}
          {results.map((entry) => (
            <SearchResultCard
              key={entry.row.id}
              entry={entry}
              selected={selectedId === entry.row.id}
              fromLabel={centre?.label ?? null}
              onSelect={setSelectedId}
              onHover={(id) => setSelectedId(id)}
              spaceFitHref={spaceFitHref}
            />
          ))}
        </div>

        <div className={cn(view === "list" && "hidden lg:block")}>
          <div className="h-[60vh] min-h-[360px] overflow-hidden rounded-2xl border border-border lg:sticky lg:top-24 lg:h-[calc(100vh-8rem)]">
            <ClientOnly fallback={<div className="size-full bg-muted" />}>
              <React.Suspense fallback={<div className="size-full bg-muted" />}>
                <StorageMap
                  spaces={mapSpaces}
                  selectedSpaceId={selectedId}
                  onSelectSpace={handleMarker}
                  searchCentre={centre}
                  radiusMiles={params.radius}
                />
              </React.Suspense>
            </ClientOnly>
          </div>
          <p className="mt-2 type-body-sm text-muted-foreground">
            Map pins show an approximate area, not a host's exact address.
          </p>
        </div>
      </div>
    </div>
  );
}
