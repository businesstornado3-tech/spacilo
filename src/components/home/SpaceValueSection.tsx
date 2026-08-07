/**
 * SpaceValueSection — "what is my unused space worth?"
 *
 * Two honest routes to the same answer: photograph the space and let Spacilo
 * AI estimate it, or answer three quick questions. Both are indicative.
 */
import * as React from "react";
import { Camera, SlidersHorizontal } from "lucide-react";

import { cn } from "@/lib/utils";
import { EarningsEstimator } from "@/components/home/HostEarnings";
import { ScanMySpacePanel } from "@/components/vision/ScanMySpacePanel";
import { VALUE_SPACE_TYPES, type ValueSpaceType } from "@/lib/vision";

type Route = "scan" | "quick";

export function SpaceValueSection() {
  const [route, setRoute] = React.useState<Route>("scan");
  const [spaceType, setSpaceType] = React.useState<ValueSpaceType>("garage");
  const [postcode, setPostcode] = React.useState("");

  return (
    <section aria-labelledby="space-value-heading" className="py-9 sm:py-12">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <header className="max-w-xl">
          <h2 id="space-value-heading" className="type-h2">
            Your empty garage is already earning — for someone else.
          </h2>
          <p className="mt-2.5 type-body-sm text-muted-foreground">
            Show Spacilo AI your space, or answer three quick questions, and see what it could be
            worth each month.
          </p>
        </header>

        <div className="mt-5 inline-flex rounded-full border border-border bg-card p-1" role="tablist">
          <Tab active={route === "scan"} onClick={() => setRoute("scan")}>
            <Camera className="size-4" aria-hidden="true" />
            Scan my space
          </Tab>
          <Tab active={route === "quick"} onClick={() => setRoute("quick")}>
            <SlidersHorizontal className="size-4" aria-hidden="true" />
            Quick estimate
          </Tab>
        </div>

        {route === "scan" ? (
          <div className="mt-5 space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <fieldset>
                <legend className="type-label text-muted-foreground">Space type</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {VALUE_SPACE_TYPES.map((type) => (
                    <button
                      key={type.id}
                      type="button"
                      aria-pressed={spaceType === type.id}
                      onClick={() => setSpaceType(type.id)}
                      className={cn(
                        "inline-flex min-h-11 items-center rounded-full border px-3.5 type-label transition-colors",
                        spaceType === type.id
                          ? "border-primary bg-primary-soft text-primary-soft-foreground"
                          : "border-border bg-card text-muted-foreground hover:border-primary/40",
                      )}
                    >
                      {type.label}
                    </button>
                  ))}
                </div>
              </fieldset>

              <label className="block">
                <span className="type-label text-muted-foreground">Postcode (optional)</span>
                <input
                  value={postcode}
                  onChange={(event) => setPostcode(event.target.value.toUpperCase())}
                  placeholder="PO1"
                  inputMode="text"
                  autoComplete="postal-code"
                  className="mt-2 h-11 w-36 rounded-full border border-input bg-card px-4 type-body uppercase"
                />
              </label>
            </div>

            <ScanMySpacePanel spaceType={spaceType} postcode={postcode} />
          </div>
        ) : (
          <EarningsEstimator />
        )}
      </div>
    </section>
  );
}

function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 type-label transition-colors",
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}
