/**
 * Homepage hero — both marketplace journeys in one screen.
 *
 * Left (≈40%): the proposition, the two actions and the host earning signal.
 * Right (≈60%): the signature Spacilo AI transformation, so a visitor sees the
 * differentiator without reading a paragraph about it.
 */
import { Link } from "@tanstack/react-router";
import { ArrowRight, Check, PlayCircle, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { HostEntryButton } from "@/components/home/HostEntryButton";
import { TransformationScene } from "@/components/spaceplanner/TransformationScene";
import { startDemo } from "@/components/spaceplanner/demo-bus";
import { track } from "@/lib/analytics/tracker";
import { EARNING_EXAMPLES, formatEarningsRange } from "@/lib/home/earnings-estimate";

const GARAGE = EARNING_EXAMPLES[0]!;

export function HeroSection() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-48 h-[32rem] bg-[radial-gradient(55%_60%_at_50%_35%,var(--color-signal-soft),transparent_72%)] opacity-80"
      />
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 pb-10 pt-8 sm:px-6 sm:pb-14 lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1fr)] lg:items-center lg:gap-12 lg:pb-16 lg:pt-12">
        <div className="animate-fade min-w-0">
          <h1 className="max-w-[18ch] type-hero">
            Turn unused space into income. Find trusted storage nearby.
          </h1>

          <p className="mt-4 max-w-md type-body text-muted-foreground">
            Rent storage from trusted local hosts, or earn money by listing your unused garage,
            loft, driveway or spare room.
          </p>

          <p className="mt-3 flex max-w-md items-start gap-2 type-body-sm text-muted-foreground">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-signal" aria-hidden="true" />
            <span>
              Powered by <span className="text-foreground">Spacilo AI SpacePlanner™</span> — see
              exactly how your belongings fit before you book.
            </span>
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
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

          <button
            type="button"
            onClick={() => {
              track("cta_clicked", { props: { cta: "try_spaceplanner", from: "homepage_hero" } });
              startDemo();
            }}
            className="mt-4 inline-flex min-h-11 items-center gap-2 type-label text-foreground underline-offset-4 hover:underline"
          >
            <PlayCircle className="size-4 text-signal" aria-hidden="true" />
            Watch SpacePlanner™ organise a real garage
          </button>

          {/* Host earning signal, visible without scrolling. */}
          <div className="mt-6 max-w-sm rounded-2xl border border-border bg-accent-soft/70 p-4 text-accent-foreground">
            <p className="type-label text-accent-foreground/80">Garages like yours could earn</p>
            <p className="mt-1 type-h2 tabular-nums">{formatEarningsRange(GARAGE.range)}</p>
            <p className="mt-1 type-badge text-accent-foreground/70">
              Estimated range based on location, size and local demand. Not a guarantee.
            </p>
          </div>
        </div>

        <TransformationScene className="lg:sticky lg:top-24" />
      </div>
    </section>
  );
}
