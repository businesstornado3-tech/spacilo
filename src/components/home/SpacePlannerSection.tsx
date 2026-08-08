/**
 * Homepage — Spacilo AI SpacePlanner™.
 *
 * The section has to earn the tap, so it shows the product doing its job as a
 * story: your stuff → your space → arranged by Spacilo AI. One curated
 * demonstration set is used throughout — the same belongings appear in every
 * frame — and it is a static asset, so the homepage never triggers the
 * analysis pipeline. The studio is code-split and only loaded once someone
 * starts it.
 */
import * as React from "react";
import { ArrowRight, Camera, Maximize2, Ruler } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/common/Reveal";
import { ImageLightbox } from "@/components/common/ImageLightbox";
import { track } from "@/lib/analytics/tracker";
import stuffPhoto from "@/assets/spaceplanner/demo-stuff.jpg";
import spacePhoto from "@/assets/spaceplanner/demo-space.jpg";
import arrangedPhoto from "@/assets/spaceplanner/demo-arranged.jpg";

const SpacePlannerStudio = React.lazy(() =>
  import("@/components/spaceplanner/photo/SpacePlannerStudio").then((module) => ({
    default: module.SpacePlannerStudio,
  })),
);

const INPUTS = [
  {
    src: stuffPhoto,
    step: "1",
    label: "Your stuff",
    alt: "Two sage suitcases, a navy duffel bag, labelled boxes, woven baskets and folded bedding",
  },
  {
    src: spacePhoto,
    step: "2",
    label: "Your space",
    alt: "An empty white single garage photographed from the door",
  },
] as const;

const READOUTS = [
  { label: "Space used", value: "38%" },
  { label: "Room remaining", value: "62%" },
  { label: "Walkway kept", value: "0.9m" },
] as const;

const ARRANGED_ALT =
  "The same garage with the same belongings consolidated against the left wall and a clear walkway to the rear";

export function SpacePlannerSection() {
  const [started, setStarted] = React.useState(false);
  const [zoomed, setZoomed] = React.useState(false);

  return (
    <section
      id="spaceplanner"
      aria-labelledby="spaceplanner-preview-heading"
      className="scroll-mt-20 py-10 sm:py-14"
    >
      <div className="mx-auto w-full max-w-5xl px-4 sm:px-6">
        <Reveal>
          <div className="overflow-hidden rounded-[2rem] border border-signal-soft bg-gradient-to-b from-accent-soft/70 to-card shadow-card">
            <div className="p-5 sm:p-8">
              <p className="type-overline text-signal">Spacilo AI SpacePlanner™</p>
              <h2 id="spaceplanner-preview-heading" className="mt-2 text-balance type-h2">
                Show us your stuff. Show us your space. We&apos;ll show you how it fits.
              </h2>
              <p className="mt-2.5 max-w-2xl type-body text-muted-foreground">
                See how your belongings could fit before you book. Spacilo AI reads both sets of
                photos, works out where every item can physically go, and shows you the result in
                your actual space.
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
                <>
                  {/* One curated example, told as a journey. */}
                  <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,0.55fr)_minmax(0,1fr)] lg:items-start">
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
                      {INPUTS.map((input) => (
                        <figure key={input.label} className="min-w-0">
                          <div className="relative">
                            <img
                              src={input.src}
                              alt={input.alt}
                              loading="lazy"
                              width={1280}
                              height={960}
                              className="aspect-4/3 w-full rounded-xl border border-border object-cover"
                            />
                            <span className="absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-full bg-card/90 px-2.5 py-1 type-badge text-foreground shadow-card">
                              <span className="text-signal">{input.step}</span>
                              {input.label}
                            </span>
                          </div>
                        </figure>
                      ))}
                    </div>

                    <figure className="min-w-0">
                      <div className="relative">
                        <img
                          src={arrangedPhoto}
                          alt={ARRANGED_ALT}
                          loading="lazy"
                          width={1200}
                          height={900}
                          className="w-full rounded-xl border border-signal-soft object-cover shadow-card"
                        />
                        <span className="absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-full bg-signal px-2.5 py-1 type-badge text-signal-foreground shadow-card">
                          3 Arranged by Spacilo AI
                        </span>
                        <button
                          type="button"
                          onClick={() => setZoomed(true)}
                          className="absolute right-2 top-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full bg-card/90 text-foreground shadow-card transition-opacity hover:opacity-80"
                        >
                          <Maximize2 className="size-4" aria-hidden="true" />
                          <span className="sr-only">Enlarge the arranged space</span>
                        </button>
                      </div>
                      <figcaption className="mt-1.5 type-badge text-muted-foreground">
                        Same belongings, same space — consolidated against one wall with the
                        walkway kept clear.
                      </figcaption>
                    </figure>
                  </div>

                  <dl className="mt-5 grid grid-cols-3 gap-3">
                    {READOUTS.map((readout) => (
                      <div
                        key={readout.label}
                        className="rounded-xl border border-signal-soft bg-card p-3"
                      >
                        <dt className="type-badge text-muted-foreground">{readout.label}</dt>
                        <dd className="mt-0.5 type-h3 tabular-nums text-signal">{readout.value}</dd>
                      </div>
                    ))}
                  </dl>

                  <div className="mt-6 flex flex-wrap items-center gap-3">
                    <Button
                      size="lg"
                      onClick={() => {
                        track("spaceplanner_started", { props: { from: "homepage" } });
                        setStarted(true);
                      }}
                    >
                      <Camera aria-hidden="true" />
                      Try SpacePlanner
                      <ArrowRight aria-hidden="true" />
                    </Button>
                    <span className="inline-flex items-center gap-1.5 type-badge text-muted-foreground">
                      <Ruler className="size-3.5" aria-hidden="true" />
                      Example plan. Estimates only — you review everything
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        </Reveal>
      </div>

      <ImageLightbox
        open={zoomed}
        src={arrangedPhoto}
        alt={ARRANGED_ALT}
        caption="Example plan — belongings consolidated against one wall, walkway kept clear"
        onClose={() => setZoomed(false)}
      />
    </section>
  );
}
