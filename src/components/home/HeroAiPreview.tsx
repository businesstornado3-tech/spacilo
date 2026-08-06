import * as React from "react";

import { cn } from "@/lib/utils";
import { SpaceFitAiMark } from "@/components/trust/SpaceFitAI";

type ExampleId = "renter" | "host";

interface ExampleRow {
  label: string;
  value: string;
}

const EXAMPLES: Record<ExampleId, { rows: ExampleRow[]; note: string }> = {
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

const TABS: { id: ExampleId; label: string }[] = [
  { id: "renter", label: "Renter example" },
  { id: "host", label: "Host example" },
];

/**
 * Static, presentational preview of the kind of information Spacilo AI can
 * offer. No scan, no inference, no data fetching — purely illustrative copy
 * that a visitor can toggle between the renter and host perspective.
 */
export function HeroAiPreview({ className }: { className?: string | undefined }) {
  const [active, setActive] = React.useState<ExampleId>("renter");
  const example = EXAMPLES[active];

  return (
    <div className={cn("border-t border-border bg-surface p-4 sm:p-5", className)}>
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
              type="button"
              role="tab"
              aria-selected={active === tab.id}
              onClick={() => setActive(tab.id)}
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

      <dl className="mt-3 space-y-1.5">
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
