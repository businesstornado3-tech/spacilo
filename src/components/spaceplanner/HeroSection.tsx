/**
 * Homepage hero.
 *
 * The product leads: one proposition, three clearly ranked actions, and a live
 * looping demonstration of the planner beside it. No stock photography.
 */
import { Link } from "@tanstack/react-router";
import { ArrowRight, PlayCircle, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { HeroAnimation } from "@/components/spaceplanner/HeroAnimation";
import { scrollToDemo, startDemo } from "@/components/spaceplanner/demo-bus";
import { track } from "@/lib/analytics/tracker";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-48 h-[32rem] bg-[radial-gradient(55%_60%_at_50%_35%,var(--color-signal-soft),transparent_72%)] opacity-80"
      />
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 pb-12 pt-8 sm:px-6 sm:pb-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center lg:gap-14 lg:pb-20 lg:pt-14">
        <div className="animate-fade min-w-0">
          <span className="inline-flex items-center gap-2 rounded-full border border-signal/30 bg-signal-soft/60 px-3 py-1 type-badge text-signal-soft-foreground">
            <Sparkles className="size-3.5" aria-hidden="true" />
            Spacilo AI SpacePlanner™
          </span>

          <h1 className="mt-4 max-w-[15ch] type-hero">Store Smarter with AI.</h1>

          <p className="mt-4 max-w-md type-body text-muted-foreground">
            Watch Spacilo AI organise a real garage — then try it on yours.
          </p>


          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Button
              size="lg"
              onClick={() => {
                track("cta_clicked", { props: { cta: "try_spaceplanner", from: "homepage_hero" } });
                startDemo();
              }}
            >
              Try SpacePlanner™ Free
              <ArrowRight className="size-4" aria-hidden="true" />
            </Button>

            <Button
              asChild
              size="lg"
              variant="secondary"
              onClick={() =>
                track("cta_clicked", { props: { cta: "browse_spaces", from: "homepage_hero" } })
              }
            >
              <Link to="/find-storage">Browse storage spaces</Link>
            </Button>
          </div>

          <button
            type="button"
            className="mt-4 inline-flex items-center gap-2 rounded-md underline underline-offset-4 type-body-sm text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => {
              track("cta_clicked", { props: { cta: "watch_demo", from: "homepage_hero_demo" } });
              scrollToDemo();
            }}
          >
            <PlayCircle className="size-4" aria-hidden="true" />
            Watch live demo
          </button>

          <p className="mt-6 max-w-md type-badge text-muted-foreground">
            No account needed. Spacilo AI produces estimates you review.
          </p>

        </div>

        <HeroAnimation className="lg:sticky lg:top-24" />
      </div>
    </section>
  );
}
