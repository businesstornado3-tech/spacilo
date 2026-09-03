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

/**
 * A plain SVG outline-free scatter of UK places. No tiles, no third-party map
 * library and no coordinates for anything except the canonical place list, so
 * nothing about an individual can be inferred from it.
 */
function UkScatter({ places }: { places: GeographyPlace[] }) {
  const plotted = places.filter((place) => place.plot !== null);
  if (plotted.length === 0) return null;
  const maxDemand = Math.max(...plotted.map((place) => place.demandEvents), 1);

  return (
    <div className="rounded-2xl border border-border bg-card p-3 sm:p-4">
      <h3 className="type-label">Where demand is being expressed</h3>
      <p className="mt-1 type-body-xs text-muted-foreground">
        Positions are the approximate centre of each named town or city, sized by how much location
        intent it attracted. It is not a map of visitor locations.
      </p>
      <svg
        viewBox="0 0 100 130"
        className="mx-auto mt-3 h-72 w-full max-w-xs"
        role="img"
        aria-label={`Scatter plot of ${plotted.length} UK places by declared location intent`}
      >
        <rect x="0" y="0" width="100" height="130" rx="4" className="fill-secondary" />
        {plotted.map((place) => {
          const radius = 1.6 + (place.demandEvents / maxDemand) * 4.4;
          return (
            <circle
              key={place.slug}
              cx={place.plot!.x}
              cy={place.plot!.y}
              r={radius}
              className={
                place.supplyState === "NO_SUPPLY" || place.supplyState === "THIN_SUPPLY"
                  ? "fill-warning/70"
                  : "fill-primary/70"
              }
            >
              <title>{`${place.name}: ${formatCount(place.demandEvents)} location-intent events, ${formatCount(place.publishedSpaces)} published spaces`}</title>
            </circle>
          );
        })}
      </svg>
      <p className="mt-2 type-body-xs text-muted-foreground">
        Amber marks places with no or thin supply — real demand EarnRoom currently cannot serve.
      </p>
    </div>
  );
}

export function DemandGeography({ places }: { places: GeographyPlace[] }) {
  const ranked = React.useMemo(
    () => [...places].sort((a, b) => b.opportunityScore - a.opportunityScore),
    [places],
  );
  const priority = ranked.filter((place) => place.priority === "HIGH").slice(0, 5);

  if (places.length === 0) {
    return (
      <EmptyState
        title="No location intent recorded yet"
        description="Nobody named a place in search, discovery or a location page in this period. No location has been inferred."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-2">
        <UkScatter places={ranked} />

        <div className="rounded-2xl border border-border bg-card p-3 sm:p-4">
          <h3 className="type-label">Top locations by demand</h3>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full type-body-xs">
              <caption className="sr-only">
                Declared location intent, supply and opportunity score by place
              </caption>
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1 pr-2 font-medium">Place</th>
                  <th className="py-1 pr-2 text-right font-medium">Intent</th>
                  <th className="py-1 pr-2 text-right font-medium">Spaces</th>
                  <th className="py-1 pr-2 text-right font-medium">Bookings</th>
                  <th className="py-1 pr-2 text-right font-medium">Score</th>
                  <th className="py-1 font-medium">Trend</th>
                </tr>
              </thead>
              <tbody>
                {ranked.slice(0, 12).map((place) => (
                  <tr key={place.slug} className="border-t border-border">
                    <td className="py-1.5 pr-2">
                      <span className="block font-medium">{place.name}</span>
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
