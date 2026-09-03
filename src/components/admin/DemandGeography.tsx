/**
 * Founder console — "Visitor & demand geography" (internal only).
 *
 * This is deliberately NOT presented as a map of where visitors are. EarnRoom
 * collects no IP geolocation, so the only honest geographic signal is
 * *declared location intent*: the places people typed into search, discovery
 * and location pages. That is stated in the UI, not just in this comment.
 *
 * Presentation only — every figure arrives from `admin_demand_geography`,
 * a SECURITY DEFINER RPC that re-checks `is_platform_admin(auth.uid())`.
 */
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/common/States";
import { formatCount } from "@/lib/admin/dashboard";
import {
  GEOGRAPHY_LIMITATIONS,
  SUPPLY_STATE_LABEL,
  type GeographyPlace,
} from "@/lib/admin/geography";

const SUPPLY_TONE: Record<GeographyPlace["supplyState"], "success" | "warning" | "neutral"> = {
  NO_SUPPLY: "warning",
  THIN_SUPPLY: "warning",
  BALANCED: "success",
  SURPLUS_SUPPLY: "neutral",
};

const TREND_LABEL: Record<GeographyPlace["trend"], string> = {
  RISING: "Rising",
  STEADY: "Steady",
  FALLING: "Falling",
  NEW: "New",
  UNKNOWN: "No baseline",
};

function trendText(place: GeographyPlace): string {
  if (place.trendPercent === null) return TREND_LABEL[place.trend];
  const sign = place.trendPercent > 0 ? "+" : "";
  return `${TREND_LABEL[place.trend]} ${sign}${Math.round(place.trendPercent)}%`;
}

const DemandMap = React.lazy(() => import("@/components/admin/DemandMap"));

export type GeographyFilterId =
  | "ALL"
  | "NO_SUPPLY"
  | "THIN_SUPPLY"
  | "SUPPLY_AVAILABLE"
  | "SUPPLY_AHEAD"
  | "REQUESTED"
  | "BOOKED";

export const GEOGRAPHY_FILTERS: ReadonlyArray<{ id: GeographyFilterId; label: string }> = [
  { id: "ALL", label: "All demand" },
  { id: "NO_SUPPLY", label: "No supply" },
  { id: "THIN_SUPPLY", label: "Thin supply" },
  { id: "SUPPLY_AVAILABLE", label: "Supply available" },
  { id: "SUPPLY_AHEAD", label: "Supply ahead of demand" },
  { id: "REQUESTED", label: "Reached a storage request" },
  { id: "BOOKED", label: "Reached a booking" },
];

/** Filters operate only on figures that genuinely exist in production rows. */
export function applyGeographyFilter(
  places: readonly GeographyPlace[],
  filter: GeographyFilterId,
): GeographyPlace[] {
  switch (filter) {
    case "NO_SUPPLY":
      return places.filter((p) => p.supplyState === "NO_SUPPLY");
    case "THIN_SUPPLY":
      return places.filter((p) => p.supplyState === "THIN_SUPPLY");
    case "SUPPLY_AVAILABLE":
      return places.filter((p) => p.publishedSpaces > 0);
    case "SUPPLY_AHEAD":
      return places.filter((p) => p.supplyState === "SURPLUS_SUPPLY");
    case "REQUESTED":
      return places.filter((p) => p.storageRequests > 0);
    case "BOOKED":
      return places.filter((p) => p.bookings > 0);
    default:
      return [...places];
  }
}

function MapPanel({
  places,
  selected,
  onSelect,
}: {
  places: GeographyPlace[];
  selected: string | null;
  onSelect: (slug: string) => void;
}) {
  const plotted = places.filter((place) => place.point !== null);

  return (
    <div className="rounded-2xl border border-border bg-card p-3 sm:p-4">
      <h3 className="type-label">Where demand is being expressed</h3>
      <p className="mt-1 type-body-xs text-muted-foreground">
        Showing locations people explicitly named in searches, discovery or location intent — not
        inferred visitor GPS/IP locations. Bubbles sit on the approximate centre of each named town
        or city and are sized by how much location intent it attracted.
      </p>
      <div className="mt-3 h-[360px] w-full overflow-hidden rounded-2xl">
        {plotted.length === 0 ? (
          <div className="flex size-full items-center justify-center rounded-2xl border border-dashed border-border p-6 text-center type-body-sm text-muted-foreground">
            No sufficient geographic demand data yet for this view.
          </div>
        ) : (
          <React.Suspense
            fallback={<div className="size-full animate-pulse rounded-2xl bg-muted" />}
          >
            <DemandMap places={plotted} selectedSlug={selected} onSelectPlace={onSelect} />
          </React.Suspense>
        )}
      </div>
      <p className="mt-2 type-body-xs text-muted-foreground">
        Amber marks places with no or thin supply — real demand EarnRoom currently cannot serve.
        {places.length > plotted.length
          ? ` ${places.length - plotted.length} named place(s) have no catalogue coordinate and appear in the table only.`
          : ""}
      </p>
    </div>
  );
}

export function DemandGeography({ places }: { places: GeographyPlace[] }) {
  const [filter, setFilter] = React.useState<GeographyFilterId>("ALL");
  const [selected, setSelected] = React.useState<string | null>(null);

  const ranked = React.useMemo(
    () =>
      applyGeographyFilter(places, filter).sort(
        (a, b) => b.opportunityScore - a.opportunityScore,
      ),
    [places, filter],
  );
  const priority = ranked.filter((place) => place.priority === "HIGH").slice(0, 5);

  if (places.length === 0) {
    return (
      <EmptyState
        title="No sufficient geographic demand data yet"
        description="Nobody named a place in search, discovery or a location page in this period. No location has been inferred and none has been substituted."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {GEOGRAPHY_FILTERS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setFilter(option.id)}
            aria-pressed={filter === option.id}
            className={`min-h-9 rounded-full border px-3 type-body-xs transition-colors ${
              filter === option.id
                ? "border-primary bg-primary-soft text-primary-soft-foreground"
                : "border-border text-muted-foreground hover:bg-secondary"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="type-body-xs text-muted-foreground">
        Filters run on real production rows only. EarnRoom does not currently record a renter,
        host, business or student breakdown per named place, so no such filter is offered rather
        than inventing one.
      </p>

      {ranked.length === 0 ? (
        <EmptyState
          title="No places match this filter"
          description="There is not enough production data for this view yet."
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          <MapPanel places={ranked} selected={selected} onSelect={setSelected} />

        <div className="rounded-2xl border border-border bg-card p-3 sm:p-4">
          <h3 className="type-label">Top locations by declared intent</h3>
          <p className="mt-1 type-body-xs text-muted-foreground">
            &ldquo;Intent&rdquo; means declared location-intent signals — not a count of physical
            visitors.
          </p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full type-body-xs">
              <caption className="sr-only">
                Declared location intent, supply and opportunity score by place
              </caption>
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1 pr-2 font-medium">Place</th>
                  <th className="py-1 pr-2 text-right font-medium">Intent signals</th>
                  <th className="py-1 pr-2 text-right font-medium">Spaces</th>
                  <th className="py-1 pr-2 text-right font-medium">Bookings</th>
                  <th className="py-1 pr-2 text-right font-medium">Score</th>
                  <th className="py-1 font-medium">Trend</th>
                </tr>
              </thead>
              <tbody>
                {ranked.slice(0, 12).map((place) => (
                  <tr
                    key={place.slug}
                    className={`border-t border-border ${place.slug === selected ? "bg-secondary/60" : ""}`}
                  >
                    <td className="py-1.5 pr-2">
                      <button
                        type="button"
                        onClick={() => setSelected(place.slug)}
                        className="block text-left font-medium underline-offset-4 hover:underline"
                      >
                        {place.name}
                      </button>
                      <Badge variant={SUPPLY_TONE[place.supplyState]} className="mt-0.5">
                        {SUPPLY_STATE_LABEL[place.supplyState]}
                      </Badge>
                    </td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">
                      {formatCount(place.demandEvents)}
                    </td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">
                      {formatCount(place.publishedSpaces)}
                    </td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">
                      {formatCount(place.bookings)}
                    </td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">
                      {Math.round(place.opportunityScore)}
                    </td>
                    <td className="py-1.5 text-muted-foreground">{trendText(place)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        </div>
      )}

      {priority.length > 0 ? (
        <div className="rounded-2xl border border-border bg-card p-3 sm:p-4">
          <h3 className="type-label">Where to campaign first</h3>
          <p className="mt-1 type-body-xs text-muted-foreground">
            Ordered by demand against scarcity. This is a prioritisation score out of 100, not a
            revenue forecast and not a prediction that a campaign will convert.
          </p>
          <ul className="mt-2 space-y-1.5">
            {priority.map((place) => (
              <li key={place.slug} className="flex justify-between gap-3 type-body-sm">
                <span className="min-w-0 truncate">
                  {place.name} — {SUPPLY_STATE_LABEL[place.supplyState].toLowerCase()}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {Math.round(place.opportunityScore)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <details className="rounded-xl border border-border bg-card p-3">
        <summary className="type-body-sm font-medium">
          What this geography cannot tell you
        </summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 type-body-xs text-muted-foreground">
          {GEOGRAPHY_LIMITATIONS.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}
