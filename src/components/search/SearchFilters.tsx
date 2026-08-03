/**
 * Search filters. Every filter maps to a field that hosts actually fill in.
 */
import * as React from "react";
import { SlidersHorizontal, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/form/Controls";
import { controlBase } from "@/components/form/Field";
import { SPACE_TYPES, ACCESS_TYPES, SPACE_FEATURES } from "@/lib/spaces";
import { ITEM_CATEGORIES } from "@/lib/inventory-model";
import { track } from "@/lib/analytics";
import type { SearchFilters } from "@/hooks/useStorageSearch";

const FILTERABLE_FEATURES = ["indoor", "dry", "lockable"];

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

export function SearchFiltersPanel({ filters, onChange }: SearchFiltersPanelProps) {
  const [open, setOpen] = React.useState(false);
  const activeCount =
    (filters.maxPricePence ? 1 : 0) +
    (filters.spaceTypes?.length ?? 0) +
    (filters.features?.length ?? 0) +
    (filters.accessTypes?.length ?? 0) +
    (filters.categories?.length ?? 0) +
    (filters.minVolumeM3 ? 1 : 0);

  function apply(next: SearchFilters, name: string) {
    track("filter_applied", { filter: name });
    onChange(next);
  }

  return (
    <div>
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <SlidersHorizontal className="size-4" aria-hidden="true" />
        Filters{activeCount ? ` (${activeCount})` : ""}
      </Button>

      {open ? (
        <div className="mt-3 space-y-5 rounded-2xl border border-border bg-card p-4 shadow-card">
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
                      maxPricePence: Number.isFinite(pounds) && pounds > 0 ? Math.round(pounds * 100) : undefined,
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
                    { ...filters, minVolumeM3: Number.isFinite(value) && value > 0 ? value : undefined },
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
                  onChange={() => apply({ ...filters, spaceTypes: toggle(filters.spaceTypes, type.value) }, "space_type")}
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
                  onChange={() => apply({ ...filters, features: toggle(filters.features, feature.value) }, "feature")}
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
                    apply({ ...filters, accessTypes: toggle(filters.accessTypes, access.value) }, "access")
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
                    apply({ ...filters, categories: toggle(filters.categories, category.value) }, "category")
                  }
                />
              ))}
            </div>
          </fieldset>

          {activeCount ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => apply({}, "clear")}>
              <X className="size-4" aria-hidden="true" />
              Clear filters
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
