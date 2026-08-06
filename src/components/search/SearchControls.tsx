/**
 * Canonical location search controls: postcode/area + radius.
 * Used by the homepage hero and the search page — never re-implemented.
 */
import * as React from "react";
import { MapPin, Loader2, LocateFixed } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { controlBase } from "@/components/form/Field";
import {
  DEFAULT_RADIUS_MILES,
  RADIUS_OPTIONS_MILES,
  normaliseLocationInput,
} from "@/lib/location/schema";
import { track } from "@/lib/analytics/tracker";
import {
  POPULAR_SEARCHES,
  readRecentSearches,
  suggestLocations,
  writeRecentSearch,
  type RecentSearch,
} from "@/lib/search/recent-searches";

export interface SearchControlsProps {
  initialLocation?: string;
  initialRadius?: number;
  submitLabel?: string;
  busy?: boolean;
  error?: string | null;
  layout?: "stacked" | "inline";
  className?: string;
  onSubmit: (value: { location: string; radius: number }) => void;
}

export function SearchControls({
  initialLocation = "",
  initialRadius = DEFAULT_RADIUS_MILES,
  submitLabel = "Find storage",
  busy = false,
  error = null,
  layout = "stacked",
  className,
  onSubmit,
}: SearchControlsProps) {
  const id = React.useId();
  const [location, setLocation] = React.useState(initialLocation);
  const [radius, setRadius] = React.useState(initialRadius);
  const [localError, setLocalError] = React.useState<string | null>(null);
  const [locating, setLocating] = React.useState(false);
  const [recents, setRecents] = React.useState<RecentSearch[]>([]);

  // Recents live on this device only; read after mount so SSR output matches.
  React.useEffect(() => setRecents(readRecentSearches()), []);

  const suggestions = React.useMemo(() => suggestLocations(recents, location), [recents, location]);
  const quickPicks = React.useMemo(() => {
    const seen = new Set<string>();
    return [...recents.map((r) => r.location), ...POPULAR_SEARCHES]
      .filter((value) => {
        const key = value.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 5);
  }, [recents]);

  function submit(value: string, nextRadius: number) {
    setLocalError(null);
    setLocation(value);
    setRecents(writeRecentSearch({ location: value, radius: nextRadius }));
    track("storage_search_started", { props: { radius: nextRadius, has_location: true } });
    onSubmit({ location: value, radius: nextRadius });
  }

  React.useEffect(() => setLocation(initialLocation), [initialLocation]);
  React.useEffect(() => setRadius(initialRadius), [initialRadius]);

  const message = localError ?? error;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const value = normaliseLocationInput(location);
    if (value.length < 2) {
      setLocalError("Enter a UK postcode or area, for example PO4 8LB.");
      return;
    }
    submit(value, radius);
  }

  function handleUseMyLocation() {
    if (!("geolocation" in navigator)) {
      setLocalError("Your browser can't share your location. Enter a postcode instead.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        const value = `${position.coords.latitude.toFixed(5)},${position.coords.longitude.toFixed(5)}`;
        setLocalError(null);
        track("storage_search_started", { props: { radius, used_browser_location: true } });
        onSubmit({ location: value, radius });
      },
      () => {
        setLocating(false);
        setLocalError("We couldn't get your location. Enter a postcode instead.");
      },
      { timeout: 8000, maximumAge: 5 * 60 * 1000 },
    );
  }

  return (
    <form
      role="search"
      onSubmit={handleSubmit}
      className={cn("space-y-3", className)}
      aria-label="Search storage by location"
    >
      <div
        className={cn(
          "gap-3",
          layout === "inline" ? "flex flex-col sm:flex-row sm:items-end" : "grid",
        )}
      >
        <div className={cn("min-w-0 space-y-1.5", layout === "inline" && "flex-1")}>
          <label htmlFor={`${id}-location`} className="block type-label">
            Where do you need storage?
          </label>
          <div className="relative">
            <MapPin
              className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              id={`${id}-location`}
              name="location"
              type="text"
              inputMode="text"
              autoComplete="postal-code"
              spellCheck={false}
              placeholder="Enter postcode or area"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              aria-invalid={message ? true : undefined}
              aria-describedby={message ? `${id}-error` : undefined}
              list={`${id}-suggestions`}
              className={cn(
                controlBase,
                "pl-10",
                message && "border-destructive focus-visible:ring-destructive",
              )}
            />
            <datalist id={`${id}-suggestions`}>
              {suggestions.map((value) => (
                <option key={value} value={value} />
              ))}
            </datalist>
          </div>
        </div>

        <div className={cn("space-y-1.5", layout === "inline" && "sm:w-40")}>
          <label htmlFor={`${id}-radius`} className="block type-label">
            Within
          </label>
          <select
            id={`${id}-radius`}
            name="radius"
            value={radius}
            onChange={(e) => {
              const next = Number(e.target.value);
              setRadius(next);
              track("search_refined", { props: { control: "radius", radius: next } });
            }}
            className={controlBase}
          >
            {RADIUS_OPTIONS_MILES.map((option) => (
              <option key={option} value={option}>
                {option} {option === 1 ? "mile" : "miles"}
              </option>
            ))}
          </select>
        </div>

        <Button
          type="submit"
          size="lg"
          disabled={busy}
          className={cn(layout === "inline" && "sm:w-auto")}
        >
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          {submitLabel}
        </Button>
      </div>

      {quickPicks.length ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="type-body-sm text-muted-foreground">
            {recents.length ? "Recent and popular:" : "Popular:"}
          </span>
          {quickPicks.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => submit(value, radius)}
              className="inline-flex min-h-9 items-center rounded-full border border-border px-3 type-body-sm text-foreground hover:bg-muted/60"
            >
              {value}
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={handleUseMyLocation}
          className="inline-flex items-center gap-1.5 type-body-sm text-primary underline-offset-4 hover:underline"
        >
          <LocateFixed className="size-4" aria-hidden="true" />
          {locating ? "Finding you…" : "Use my location"}
        </button>
      </div>

      {message ? (
        <p id={`${id}-error`} role="alert" className="type-body-sm text-destructive">
          {message}
        </p>
      ) : null}
    </form>
  );
}
