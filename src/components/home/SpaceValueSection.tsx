/**
 * SpaceValueSection — the Spacilo Earnings Estimator.
 *
 * Two honest routes to the same answer: answer three quick questions, or let
 * Spacilo AI read a photo of the space. Both are indicative estimates.
 *
 * The two routes rotate gently while the section is on screen so a visitor
 * sees both without clicking — and rotation stops for good the moment they
 * touch anything.
 */
import * as React from "react";

import { cn } from "@/lib/utils";
import { EarningsEstimator } from "@/components/home/HostEarnings";
import { ScanMySpacePanel } from "@/components/vision/ScanMySpacePanel";
import { VALUE_SPACE_TYPES, type ValueSpaceType } from "@/lib/vision";
import { usePrefersReducedMotion, useInView } from "@/hooks/use-motion";
import {
  EARNINGS_DEFAULT_TAB,
  EARNINGS_ROTATION_MS,
  EARNINGS_TRANSITION_MS,
  EARNINGS_TAB_ORDER,
  nextEarningsTab,
  shouldRotateEarnings,
  type EarningsTabId,
} from "@/lib/home/earnings-tab-rotation";

const TAB_LABELS: Record<EarningsTabId, { icon: string; label: string }> = {
  quick: { icon: "⚡", label: "Quick estimate" },
  scan: { icon: "📷", label: "AI space scan" },
};

export function SpaceValueSection() {
  const [route, setRoute] = React.useState<EarningsTabId>(EARNINGS_DEFAULT_TAB);
  const [spaceType, setSpaceType] = React.useState<ValueSpaceType>("garage");
  const [postcode, setPostcode] = React.useState("");
  const [engaged, setEngaged] = React.useState(false);
  const [visible, setVisible] = React.useState(true);

  const reducedMotion = usePrefersReducedMotion();
  const { ref, inView } = useInView<HTMLElement>();

  React.useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const rotating = shouldRotateEarnings({
    inView,
    documentHidden: !visible,
    reducedMotion,
    userEngaged: engaged,
  });

  React.useEffect(() => {
    if (!rotating) return;
    const timer = window.setTimeout(
      () => setRoute((current) => nextEarningsTab(current)),
      EARNINGS_ROTATION_MS,
    );
    return () => window.clearTimeout(timer);
  }, [rotating, route]);

  /** Any deliberate input hands control to the visitor, permanently. */
  const takeControl = React.useCallback(() => setEngaged(true), []);

  const selectTab = (id: EarningsTabId) => {
    takeControl();
    setRoute(id);
  };

  return (
    <section
      ref={ref}
      aria-labelledby="space-value-heading"
      className="py-9 sm:py-12"
      onPointerDown={takeControl}
      onKeyDown={takeControl}
      onInput={takeControl}
    >
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <header className="max-w-xl">
          <p className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 type-badge text-muted-foreground">
            <span aria-hidden="true">💷</span> Spacilo Earnings Estimator
          </p>
          <h2 id="space-value-heading" className="mt-3 type-h2">
            How much could your space earn?
          </h2>
          <p className="mt-2.5 type-body-sm text-muted-foreground">
            Get an instant earning estimate in under 30 seconds, or let Spacilo AI calculate it from
            a photo of your space.
          </p>
        </header>

        <div
          className="mt-5 inline-flex rounded-full border border-border bg-card p-1"
          role="tablist"
          aria-label="Ways to estimate your earnings"
        >
          {EARNINGS_TAB_ORDER.map((id) => (
            <Tab
              key={id}
              id={id}
              active={route === id}
              onSelect={() => selectTab(id)}
            >
              <span aria-hidden="true">{TAB_LABELS[id].icon}</span>
              {TAB_LABELS[id].label}
            </Tab>
          ))}
        </div>

        {/* Both panels share one grid cell: the container keeps the taller
            height, so switching tabs never shifts the page. */}
        <div className="mt-5 grid" aria-live="polite">
          <TabPanel id="quick" active={route === "quick"}>
            <EarningsEstimator />
          </TabPanel>

          <TabPanel id="scan" active={route === "scan"}>
            <div className="space-y-4">
              <div className="flex flex-wrap items-end gap-3">
                <fieldset>
                  <legend className="type-label text-muted-foreground">Space type</legend>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {VALUE_SPACE_TYPES.map((type) => (
                      <button
                        key={type.id}
                        type="button"
                        aria-pressed={spaceType === type.id}
                        onClick={() => {
                          takeControl();
                          setSpaceType(type.id);
                        }}
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
                    onChange={(event) => {
                      takeControl();
                      setPostcode(event.target.value.toUpperCase());
                    }}
                    placeholder="PO1"
                    inputMode="text"
                    autoComplete="postal-code"
                    className="mt-2 h-11 w-36 rounded-full border border-input bg-card px-4 type-body uppercase"
                  />
                </label>
              </div>

              <ScanMySpacePanel spaceType={spaceType} postcode={postcode} />
            </div>
          </TabPanel>
        </div>
      </div>
    </section>
  );
}

/**
 * Both panels stay mounted and stacked in one grid cell, so the container
 * keeps the taller height and nothing shifts as the tabs cross-fade.
 */
function TabPanel({
  id,
  active,
  children,
}: {
  id: EarningsTabId;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      role="tabpanel"
      id={`earnings-panel-${id}`}
      aria-labelledby={`earnings-tab-${id}`}
      aria-hidden={!active}
      {...(active ? {} : { inert: "" })}
      className={cn(
        "col-start-1 row-start-1 transition-opacity ease-out motion-reduce:transition-none",
        active ? "opacity-100" : "pointer-events-none opacity-0",
      )}
      style={{ transitionDuration: `${EARNINGS_TRANSITION_MS}ms` }}
    >
      {children}
    </div>
  );
}

function Tab({
  id,
  active,
  onSelect,
  children,
}: {
  id: EarningsTabId;
  active: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      id={`earnings-tab-${id}`}
      aria-selected={active}
      aria-controls={`earnings-panel-${id}`}
      onClick={onSelect}
      className={cn(
        "inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 type-label transition-colors",
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}
