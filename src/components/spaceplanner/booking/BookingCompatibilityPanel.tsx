/**
 * BookingCompatibilityPanel — "Will my belongings fit?" on a listing page.
 *
 * Reuses the shared planner end to end: the listing's published measurements
 * become the planner's space, a saved inventory becomes its contents, and the
 * usual deterministic engine produces the score. Nothing is stored, nothing is
 * sent to the host, and every figure is presented as an estimate.
 */
import * as React from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Ruler, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePlannerInventories } from "@/hooks/usePlannerLibrary";
import { toLines, toQuantities, liveInventories } from "@/lib/spaceplanner/library";
import {
  listingConstraints,
  listingStorageSpace,
  type ListingSpaceSource,
} from "@/lib/spaceplanner/listing";
import {
  applySuggestions,
  buildBookingConfidence,
  buildSuggestions,
  compareInventories,
} from "@/lib/spaceplanner/booking-confidence";
import {
  SpacePlannerProvider,
  useSpacePlanner,
} from "@/components/spaceplanner/SpacePlannerProvider";
import { AIProgressPanel } from "@/components/spaceplanner/AIProgressPanel";
import { PlannerCanvas } from "@/components/spaceplanner/PlannerCanvas";
import { InventorySelector } from "@/components/spaceplanner/booking/InventorySelector";
import { BookingConfidenceCard } from "@/components/spaceplanner/booking/BookingConfidenceCard";
import { RecommendationSummary } from "@/components/spaceplanner/booking/RecommendationSummary";
import { SpaceComparison } from "@/components/spaceplanner/booking/SpaceComparison";
import type { SavedInventory } from "@/lib/spaceplanner/library";
import type { StorageSpace } from "@/lib/spaceplanner";

export interface BookingCompatibilityPanelProps {
  listing: ListingSpaceSource;
  /** Scrolls the renter to the booking panel when the plan looks good. */
  onBook?: () => void;
  className?: string;
}

export function BookingCompatibilityPanel({
  listing,
  onBook,
  className,
}: BookingCompatibilityPanelProps) {
  const { data: all } = usePlannerInventories();
  const inventories = React.useMemo(() => liveInventories(all ?? []), [all]);
  const geometry = React.useMemo(() => listingStorageSpace(listing), [listing]);
  const constraints = React.useMemo(
    () => listingConstraints(listing, geometry),
    [listing, geometry],
  );

  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [launched, setLaunched] = React.useState(false);

  const usable = React.useMemo(
    () => inventories.filter((inventory) => toLines(inventory.lines).length > 0),
    [inventories],
  );
  const selected = usable.find((inventory) => inventory.id === selectedId) ?? usable[0] ?? null;

  const comparison = React.useMemo(
    () =>
      geometry
        ? compareInventories(
            usable.map((inventory) => ({
              id: inventory.id,
              name: inventory.name,
              lines: toLines(inventory.lines),
            })),
            geometry.space,
          )
        : [],
    [usable, geometry],
  );

  const choose = (id: string) => {
    setSelectedId(id);
    setLaunched(false);
  };

  return (
    <section
      aria-labelledby="will-it-fit"
      className={cn(
        "rounded-3xl border border-border bg-gradient-to-b from-primary/5 to-card p-5 shadow-card sm:p-6",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="type-overline text-primary">EarnRoom AI</p>
          <h2 id="will-it-fit" className="mt-1 type-h2">
            Will my belongings fit?
          </h2>
          <p className="mt-1 type-body-sm text-muted-foreground">
            Check your saved stuff against this host&apos;s published measurements before you
            request it.
          </p>
        </div>
      </div>

      {constraints.length ? (
        <ul className="mt-4 flex flex-wrap gap-2">
          {constraints.slice(0, 6).map((constraint) => (
            <li
              key={constraint.id}
              className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 type-badge text-muted-foreground"
            >
              <Ruler className="size-3.5" aria-hidden="true" />
              {constraint.label}: {constraint.value}
            </li>
          ))}
        </ul>
      ) : null}

      {!geometry ? (
        <p className="mt-4 rounded-xl bg-surface p-3 type-body-sm text-muted-foreground">
          This host hasn&apos;t published enough measurements yet for EarnRoom AI to plan the space.
          Ask them for the internal size and door width and we&apos;ll check the fit for you.
        </p>
      ) : (
        <>
          <div className="mt-4">
            <InventorySelector
              inventories={usable}
              selectedId={selected?.id ?? null}
              onSelect={choose}
            />
          </div>

          {selected ? (
            <>
              {!launched ? (
                <Button className="mt-4" size="lg" onClick={() => setLaunched(true)}>
                  <Sparkles className="size-4" aria-hidden="true" />
                  Launch EarnRoom AI
                </Button>
              ) : null}

              {launched ? (
                <SpacePlannerProvider
                  key={`${selected.id}-${geometry.space.id}`}
                  mode="renter"
                  initialSpace={geometry.space}
                  initialQuantities={toQuantities(selected.lines)}
                >
                  <CompatibilityRun
                    space={geometry.space}
                    inventory={selected}
                    {...(onBook ? { onBook } : {})}
                  />
                </SpacePlannerProvider>
              ) : null}

              <SpaceComparison
                className="mt-4"
                results={comparison}
                selectedId={selected.id}
                onSelect={choose}
              />
            </>
          ) : null}
        </>
      )}
    </section>
  );
}

/** Inside the provider: runs automatically, then shows the confidence layer. */
function CompatibilityRun({
  space,
  inventory,
  onBook,
}: {
  space: StorageSpace;
  inventory: SavedInventory;
  onBook?: () => void;
}) {
  const { phase, run, plan, score, lines } = useSpacePlanner();
  const [applied, setApplied] = React.useState<string[]>([]);
  const suggestionsRef = React.useRef<HTMLDivElement>(null);

  // Launching the planner means running it — no second click.
  React.useEffect(() => {
    run();
  }, [run]);

  const base = plan && score ? { plan, score } : null;
  const suggestions = React.useMemo(
    () => (base ? buildSuggestions(base.plan, base.score) : []),
    [base],
  );
  const adjusted = React.useMemo(
    () => applySuggestions(lines, space, suggestions, applied),
    [lines, space, suggestions, applied],
  );

  if (phase !== "plan" || !base) {
    return <AIProgressPanel />;
  }

  const activePlan = adjusted.plan ?? base.plan;
  const activeScore = adjusted.score ?? base.score;
  const confidence = buildBookingConfidence(activePlan, activeScore);

  const toggle = (id: string) =>
    setApplied((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );

  return (
    <div className="mt-4 grid gap-4">
      <BookingConfidenceCard
        confidence={confidence}
        spaceName={space.name}
        delta={adjusted.delta}
      />

      <PlannerCanvas view="after" interactive={false} />

      <div ref={suggestionsRef}>
        <RecommendationSummary
          suggestions={suggestions}
          applied={applied}
          onToggle={toggle}
          explanations={activePlan.explanations}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {confidence.cta.intent === "book" ? (
          <Button size="lg" onClick={onBook}>
            {confidence.cta.label}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        ) : null}
        {confidence.cta.intent === "review" ? (
          <Button
            size="lg"
            variant="secondary"
            onClick={() =>
              suggestionsRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
            }
          >
            {confidence.cta.label}
          </Button>
        ) : null}
        {confidence.cta.intent === "browse" ? (
          <Button asChild size="lg" variant="secondary">
            <Link to="/find-storage">{confidence.cta.label}</Link>
          </Button>
        ) : null}
        <p className="type-body-sm text-muted-foreground">{confidence.cta.helper}</p>
      </div>

      <p className="type-badge text-muted-foreground">
        Planned from “{inventory.name}”. Nothing is saved to this listing and your host
        doesn&apos;t see your inventory.
      </p>
    </div>
  );
}
