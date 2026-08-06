import * as React from "react";

import { cn } from "@/lib/utils";
import { SpaceFitAiMark } from "@/components/trust/SpaceFitAI";
import { usePrefersReducedMotion } from "@/hooks/use-motion";
import {
  HERO_DEFAULT_EXAMPLE,
  HERO_TRANSITION_MS,
  heroRotationDelay,
  nextHeroExample,
  shouldAutoRotate,
  type HeroExampleId,
} from "@/lib/home/hero-preview-rotation";

interface ExampleRow {
  label: string;
  value: string;
}

const EXAMPLES: Record<HeroExampleId, { rows: ExampleRow[]; note: string }> = {
  renter: {
    rows: [
      { label: "Items identified", value: "14 items" },
      { label: "Estimated storage requirement", value: "~3.1 m³" },
      { label: "Potential fit", value: "94%" },
    ],
    note: "Illustrative example — not your result.",
  },
  host: {
    rows: [
      { label: "Estimated usable space", value: "~8.4 m³" },
      { label: "Potentially suitable for", value: "Boxes · luggage · small furniture" },
      { label: "Estimated monthly range", value: "£45–£65*" },
    ],
    note: "Illustrative example — actual results depend on your space and listing.",
  },
};

const TABS: { id: HeroExampleId; label: string }[] = [
  { id: "renter", label: "Renter example" },
  { id: "host", label: "Host example" },
];

function ExamplePanel({ id, active }: { id: HeroExampleId; active: boolean }) {
  const example = EXAMPLES[id];
  return (
    <div
      id={`hero-example-${id}`}
      role="tabpanel"
      aria-labelledby={`hero-example-tab-${id}`}
      aria-hidden={!active}
      className={cn(
        "col-start-1 row-start-1 transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none",
        active
          ? "opacity-100 translate-y-0"
          : "pointer-events-none opacity-0 translate-y-1 motion-reduce:translate-y-0",
      )}
      style={{ transitionDuration: `${HERO_TRANSITION_MS}ms` }}
    >
      <dl className="space-y-1.5">
        {example.rows.map((row) => (
          <div
            key={row.label}
            className="flex items-baseline justify-between gap-3 rounded-xl bg-card px-3 py-2"
          >
            <dt className="type-body-sm text-muted-foreground">{row.label}</dt>
            <dd className="type-label tabular-nums text-right">{row.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 type-body-sm text-muted-foreground">{example.note}</p>
    </div>
  );
}

/**
 * Static, presentational preview of the kind of information Spacilo AI can
 * offer. No scan, no inference, no data fetching — purely illustrative copy
 * that alternates between the renter and host perspective, and that the
 * visitor can also switch manually.
 */
export function HeroAiPreview({ className }: { className?: string | undefined }) {
  const [active, setActive] = React.useState<HeroExampleId>(HERO_DEFAULT_EXAMPLE);
  const [hovered, setHovered] = React.useState(false);
  const [hidden, setHidden] = React.useState(false);
  const [manual, setManual] = React.useState(false);
  const reducedMotion = usePrefersReducedMotion();

  React.useEffect(() => {
    const onVisibility = () => setHidden(document.visibilityState === "hidden");
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  React.useEffect(() => {
    if (!shouldAutoRotate({ hovered, documentHidden: hidden, reducedMotion })) return;
    const id = window.setTimeout(() => {
      setManual(false);
      setActive(nextHeroExample(active));
    }, heroRotationDelay(manual));
    return () => window.clearTimeout(id);
  }, [active, hovered, hidden, manual, reducedMotion]);

  const select = (id: HeroExampleId) => {
    setManual(true);
    setActive(id);
  };

  return (
    <div
      className={cn("border-t border-border bg-surface p-4 sm:p-5", className)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SpaceFitAiMark size="sm" />
        <div
          role="tablist"
          aria-label="Illustrative Spacilo AI examples"
          className="flex rounded-full bg-muted p-0.5"
        >
          {TABS.map((tab) => (
            <button
              key={tab.id}
              id={`hero-example-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={active === tab.id}
              aria-controls={`hero-example-${tab.id}`}
              onClick={() => select(tab.id)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                active === tab.id
                  ? "bg-card text-foreground shadow-card"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Both states share one grid cell, so the panel height never jumps. */}
      <div className="mt-3 grid">
        {TABS.map((tab) => (
          <ExamplePanel key={tab.id} id={tab.id} active={active === tab.id} />
        ))}
      </div>
    </div>
  );
}
