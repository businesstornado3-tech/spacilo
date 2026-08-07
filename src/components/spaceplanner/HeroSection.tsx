/**
 * Homepage hero — both marketplace journeys in one screen.
 *
 * Left (≈45%): the proposition, the two actions and the host earning signal.
 * Right (≈55%): <HeroGarageAnimation />, the signature cinematic garage, so a
 * visitor sees the differentiator without reading a paragraph about it.
 */
import { Link } from "@tanstack/react-router";
import { ArrowRight, Check, PlayCircle, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { HostEntryButton } from "@/components/home/HostEntryButton";
import { HeroGarageAnimation } from "@/components/spaceplanner/HeroGarageAnimation";
import { startDemo } from "@/components/spaceplanner/demo-bus";
import { track } from "@/lib/analytics/tracker";
import { EARNING_EXAMPLES, formatEarningsRange } from "@/lib/home/earnings-estimate";

const GARAGE = EARNING_EXAMPLES[0]!;

export function HeroSection() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-48 h-[30rem] bg-[radial-gradient(55%_60%_at_50%_35%,var(--color-signal-soft),transparent_72%)] opacity-80"
      />
      <div className="mx-auto grid w-full max-w-6xl gap-7 px-4 pb-8 pt-6 sm:px-6 sm:pb-11 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)] lg:items-center lg:gap-10 lg:pb-12 lg:pt-9">
        <div className="animate-fade min-w-0">
          <h1 className="max-w-[19ch] text-balance type-hero">
            Turn unused space into income. Find trusted storage nearby.
          </h1>

          <p className="mt-3 flex max-w-md items-start gap-2 type-body text-muted-foreground">
            <Sparkles className="mt-1 size-4 shrink-0 text-signal" aria-hidden="true" />
            <span>
              Rent from trusted local hosts or earn from your spare garage — and{" "}
              <span className="text-foreground">Spacilo AI SpacePlanner™</span> shows how your
              belongings fit before you book.
            </span>
          </p>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Button
              asChild
              size="lg"
              onClick={() =>
                track("cta_clicked", { props: { cta: "browse_spaces", from: "homepage_hero" } })
              }
            >
              <Link to="/find-storage">
                Find storage
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
            <HostEntryButton label="List your space" from="homepage_hero" variant="secondary" />
          </div>

          <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
            {["Find storage near you", "Earn passive income"].map((chip) => (
              <li key={chip} className="inline-flex items-center gap-1.5 type-badge">
                <Check className="size-3.5 text-primary" aria-hidden="true" />
                {chip}
              </li>
            ))}
          </ul>

          {/* Host earning signal, visible without scrolling. */}
          <div className="mt-5 flex max-w-md flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-accent-soft/70 p-4 text-accent-foreground">
            <div className="min-w-0">
              <p className="type-label text-accent-foreground/80">Garages like yours could earn</p>
              <p className="mt-0.5 type-h3 tabular-nums">{formatEarningsRange(GARAGE.range)}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                track("cta_clicked", { props: { cta: "try_spaceplanner", from: "homepage_hero" } });
                startDemo();
              }}
              className="inline-flex min-h-11 items-center gap-2 type-label text-accent-foreground underline-offset-4 transition-opacity hover:underline hover:opacity-80"
            >
              <PlayCircle className="size-4" aria-hidden="true" />
              Watch the AI plan
            </button>
          </div>
          <p className="mt-1.5 max-w-md type-badge text-muted-foreground">
            Estimated range based on location, size and local demand. Not a guarantee.
          </p>
        </div>

        <HeroGarageAnimation className="lg:sticky lg:top-24" />
      </div>
    </section>
  );
}
