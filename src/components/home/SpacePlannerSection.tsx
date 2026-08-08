/**
 * Homepage — Spacilo AI SpacePlanner™.
 *
 * The studio itself is code-split and only loaded once someone starts it, so
 * the homepage stays fast while the deeper AI capability sits one tap away.
 */
import * as React from "react";
import { Camera, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/common/Reveal";
import { track } from "@/lib/analytics/tracker";

const SpacePlannerStudio = React.lazy(() =>
  import("@/components/spaceplanner/photo/SpacePlannerStudio").then((module) => ({
    default: module.SpacePlannerStudio,
  })),
);

export function SpacePlannerSection() {
  const [started, setStarted] = React.useState(false);

  return (
    <section aria-labelledby="spaceplanner-heading" className="py-10 sm:py-14">
      <div className="mx-auto w-full max-w-5xl px-4 sm:px-6">
        <Reveal>
          <div className="rounded-[2rem] border border-signal-soft bg-card p-5 shadow-card sm:p-8">
            <p className="type-overline text-muted-foreground">Spacilo AI SpacePlanner™</p>
            <h2 id="spaceplanner-heading" className="mt-2 text-balance type-h2">
              Show us your stuff. Show us your space. We&apos;ll show you how it fits.
            </h2>
            <p className="mt-2.5 max-w-2xl type-body text-muted-foreground">
              Take photos of your belongings and the space you&apos;re considering. Spacilo AI
              analyses both and shows you how your belongings could fit, how much space you may
              need, and how much room could remain.
            </p>

            {started ? (
              <div className="mt-6">
                <React.Suspense
                  fallback={
                    <p role="status" className="type-body-sm text-muted-foreground">
                      Starting SpacePlanner…
                    </p>
                  }
                >
                  <SpacePlannerStudio />
                </React.Suspense>
              </div>
            ) : (
              <div className="mt-6 flex flex-wrap gap-3">
                <Button
                  size="lg"
                  onClick={() => {
                    track("spaceplanner_started", { props: { from: "homepage" } });
                    setStarted(true);
                  }}
                >
                  <Camera aria-hidden="true" />
                  Start SpacePlanner
                </Button>
                <span className="inline-flex items-center gap-1.5 type-badge text-muted-foreground">
                  <Sparkles className="size-3.5" aria-hidden="true" />
                  Estimates only — you review everything
                </span>
              </div>
            )}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
