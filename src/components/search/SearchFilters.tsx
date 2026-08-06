/**
 * Search filters.
 *
 * Mobile-first: on small screens the panel opens as a full-height drawer with
 * a sticky action bar; from `sm` up it stays an inline popover card. Every
 * filter maps to a field a host actually fills in — nothing is inferred.
 */
import * as React from "react";
import { SlidersHorizontal, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/form/Controls";
import { controlBase } from "@/components/form/Field";
import { SPACE_TYPES, ACCESS_TYPES, SPACE_FEATURES, ITEM_CATEGORIES } from "@/lib/spaces";
import { track } from "@/lib/analytics/tracker";
import type { SearchFilters } from "@/hooks/useStorageSearch";

const FILTERABLE_FEATURES = ["indoor", "dry", "lockable"];

const FACT_FILTERS: {
  key: "groundFloor" | "vehicleAccess" | "liftAvailable" | "verifiedHost";
  label: string;
}[] = [
  { key: "groundFloor", label: "Ground floor access" },
  { key: "vehicleAccess", label: "Vehicle can park close" },
  { key: "liftAvailable", label: "Lift available" },
  { key: "verifiedHost", label: "Phone-verified host" },
];

export interface SearchFiltersPanelProps {
  filters: SearchFilters;
  onChange: (next: SearchFilters) => void;
}

function toggle(list: string[] | undefined, value: string): string[] | undefined {
  const set = new Set(list ?? []);
  if (set.has(value)) set.delete(value);
  else set.add(value);
  return set.size ? [...set] : undefined;
}

export function countActiveFilters(filters: SearchFilters): number {
  return (
    (filters.maxPricePence ? 1 : 0) +
    (filters.spaceTypes?.length ?? 0) +
    (filters.features?.length ?? 0) +
    (filters.accessTypes?.length ?? 0) +
    (filters.categories?.length ?? 0) +
    (filters.minVolumeM3 ? 1 : 0) +
    FACT_FILTERS.filter((f) => filters[f.key] === true).length
  );
}

export function SearchFiltersPanel({ filters, onChange }: SearchFiltersPanelProps) {
  const [open, setOpen] = React.useState(false);
  const activeCount = countActiveFilters(filters);

  React.useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function apply(next: SearchFilters, name: string) {
    track("search_refined", { props: { control: "filter", filter: name } });
    onChange(next);
  }

  const body = (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="filter-price" className="block type-label">
            Maximum monthly price (£)
          </label>
          <input
            id="filter-price"
            type="number"
            min={0}
            step={5}
            inputMode="numeric"
            className={controlBase}
            value={filters.maxPricePence ? filters.maxPricePence / 100 : ""}
            onChange={(e) => {
              const pounds = Number(e.target.value);
              apply(
                {
                  ...filters,
                  maxPricePence:
                    Number.isFinite(pounds) && pounds > 0 ? Math.round(pounds * 100) : undefined,
                },
                "price",
              );
            }}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="filter-volume" className="block type-label">
            Minimum available capacity (m³)
          </label>
          <input
            id="filter-volume"
            type="number"
            min={0}
            step={0.5}
            inputMode="decimal"
            className={controlBase}
            value={filters.minVolumeM3 ?? ""}
            onChange={(e) => {
              const value = Number(e.target.value);
              apply(
                {
                  ...filters,
                  minVolumeM3: Number.isFinite(value) && value > 0 ? value : undefined,
                },
                "min_volume",
              );
            }}
          />
        </div>
      </div>

      <fieldset>
        <legend className="type-label">Space type</legend>
        <div className="mt-2 grid gap-1.5 sm:grid-cols-3">
          {SPACE_TYPES.map((type) => (
            <CheckboxField
              key={type.value}
              id={`filter-type-${type.value}`}
              label={type.label}
              checked={filters.spaceTypes?.includes(type.value) ?? false}
              onChange={() =>
                apply(
                  { ...filters, spaceTypes: toggle(filters.spaceTypes, type.value) },
                  "space_type",
                )
              }
            />
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="type-label">Conditions</legend>
        <div className="mt-2 grid gap-1.5 sm:grid-cols-3">
          {SPACE_FEATURES.filter((f) => FILTERABLE_FEATURES.includes(f.value)).map((feature) => (
            <CheckboxField
              key={feature.value}
              id={`filter-feature-${feature.value}`}
              label={feature.label}
              checked={filters.features?.includes(feature.value) ?? false}
              onChange={() =>
                apply({ ...filters, features: toggle(filters.features, feature.value) }, "feature")
              }
            />
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="type-label">Access</legend>
        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {ACCESS_TYPES.map((access) => (
            <CheckboxField
              key={access.value}
              id={`filter-access-${access.value}`}
              label={access.label}
              checked={filters.accessTypes?.includes(access.value) ?? false}
              onChange={() =>
                apply(
                  { ...filters, accessTypes: toggle(filters.accessTypes, access.value) },
                  "access",
                )
              }
            />
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="type-label">Getting your things in</legend>
        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {FACT_FILTERS.map((fact) => (
            <CheckboxField
              key={fact.key}
              id={`filter-fact-${fact.key}`}
              label={fact.label}
              checked={filters[fact.key] === true}
              onChange={() =>
                apply(
                  { ...filters, [fact.key]: filters[fact.key] === true ? undefined : true },
                  fact.key,
                )
              }
            />
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="type-label">Accepts these item types</legend>
        <div className="mt-2 grid gap-1.5 sm:grid-cols-3">
          {ITEM_CATEGORIES.map((category) => (
            <CheckboxField
              key={category.value}
              id={`filter-category-${category.value}`}
              label={category.label}
              checked={filters.categories?.includes(category.value) ?? false}
              onChange={() =>
                apply(
                  { ...filters, categories: toggle(filters.categories, category.value) },
                  "category",
                )
              }
            />
          ))}
        </div>
      </fieldset>
    </div>
  );

  const actions = (
    <div className="flex items-center justify-between gap-3">
      <button
        type="button"
        className="type-body-sm text-muted-foreground underline-offset-4 hover:underline"
        onClick={() => apply({}, "clear_all")}
        disabled={activeCount === 0}
      >
        Clear all
      </button>
      <Button type="button" size="sm" onClick={() => setOpen(false)}>
        Show results
      </Button>
    </div>
  );

  return (
    <div>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <SlidersHorizontal className="size-4" aria-hidden="true" />
        Filters{activeCount ? ` (${activeCount})` : ""}
      </Button>

      {open ? (
        <>
          {/* Mobile: full-height drawer */}
          <div className="fixed inset-0 z-50 sm:hidden">
            <div
              className="absolute inset-0 bg-foreground/40"
              onClick={() => setOpen(false)}
              aria-hidden="true"
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Search filters"
              className="absolute inset-x-0 bottom-0 top-12 flex flex-col rounded-t-2xl border border-border bg-card shadow-card"
            >
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <h2 className="type-h3">Filters</h2>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Close filters"
                  className="min-h-11 min-w-11"
                  onClick={() => setOpen(false)}
                >
                  <X className="size-5" aria-hidden="true" />
                </Button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{body}</div>
              <div className="border-t border-border px-4 py-3">{actions}</div>
            </div>
          </div>

          {/* Desktop / tablet: inline card */}
          <div className="mt-3 hidden space-y-5 rounded-2xl border border-border bg-card p-4 shadow-card sm:block">
            {body}
            {actions}
          </div>
        </>
      ) : null}
    </div>
  );
}
