import * as React from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Boxes, Home } from "lucide-react";

import heroPhoto from "@/assets/hero-storage.jpg";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SearchControls } from "@/components/search/SearchControls";
import { SpaceFitSpark } from "@/components/trust/SpaceFitAI";
import { track } from "@/lib/analytics";
import { hostEntryTarget } from "@/lib/host-entry";
import { useAuth } from "@/hooks/useAuth";


type Intent = "renter" | "host";

export function Hero() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [intent, setIntent] = React.useState<Intent>("renter");
  const hostTarget = hostEntryTarget(Boolean(user));


  function choose(next: Intent) {
    setIntent(next);
    track(next === "renter" ? "homepage_need_storage_selected" : "homepage_have_space_selected");
  }

  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 pb-10 pt-8 sm:px-6 sm:pb-14 sm:pt-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center lg:gap-14 lg:pb-20 lg:pt-16">
        <div className="animate-fade min-w-0">
          <p className="type-overline text-muted-foreground">Storage, closer to home.</p>

          <h1 className="mt-3 max-w-[15ch] type-hero">
            Your stuff.
            <br />
            Space nearby.
          </h1>

          <p className="mt-4 max-w-md type-body text-muted-foreground">
            Find trusted storage in unused spaces around your neighbourhood — or earn from the space you
            already have.
          </p>

          <div className="mt-7 rounded-2xl bg-card p-4 shadow-card sm:p-5">
            <div
              role="tablist"
              aria-label="What brings you here?"
              className="grid grid-cols-2 gap-1 rounded-xl bg-surface p-1"
            >
              {[
                { value: "renter" as const, label: "I need storage", icon: Boxes },
                { value: "host" as const, label: "I have space", icon: Home },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="tab"
                  aria-selected={intent === option.value}
                  aria-controls={`hero-panel-${option.value}`}
                  id={`hero-tab-${option.value}`}
                  onClick={() => choose(option.value)}
                  className={cn(
                    "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 type-nav transition-colors",
                    intent === option.value
                      ? "bg-card text-foreground shadow-card"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <option.icon className="size-4" aria-hidden="true" />
                  {option.label}
                </button>
              ))}
            </div>

            {intent === "renter" ? (
              <div id="hero-panel-renter" role="tabpanel" aria-labelledby="hero-tab-renter" className="mt-4">
                <SearchControls
                  submitLabel="Find storage"
                  onSubmit={({ location, radius }) => {
                    track("location_search_submitted", { radius, from: "homepage" });
                    void navigate({ to: "/search", search: { location, radius } });
                  }}
                />
              </div>
            ) : (
              <div id="hero-panel-host" role="tabpanel" aria-labelledby="hero-tab-host" className="mt-4">
                <p className="type-body-sm text-muted-foreground">
                  List a garage, loft, shed, spare room or part of one. You choose who stores with you, and you
                  can pause your listing at any time.
                </p>
                <Button
                  asChild
                  block
                  className="mt-4"
                  onClick={() => track("list_space_selected", { from: "homepage_hero" })}
                >
                  {hostTarget.to === "/host/spaces/new" ? (
                    <Link to="/host/spaces/new">
                      List your space
                      <ArrowRight className="size-4" aria-hidden="true" />
                    </Link>
                  ) : (
                    <Link to="/signup" search={{ mode: "host" }}>
                      List your space
                      <ArrowRight className="size-4" aria-hidden="true" />
                    </Link>
                  )}
                </Button>
              </div>
            )}
          </div>

          {intent === "renter" ? (
            <Link
              to="/how-it-works"
              className="group mt-4 flex items-center gap-3 rounded-2xl border border-signal/25 bg-signal-soft/50 px-4 py-3.5 transition-[background-color,transform] duration-200 hover:-translate-y-0.5 hover:bg-signal-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <SpaceFitSpark className="text-lg" />
              <span className="min-w-0">
                <span className="block type-label text-foreground">
                  Not sure how much space you need?
                </span>
                <span className="block type-body-sm text-signal-soft-foreground">
                  Scan your stuff with SpaceFit AI
                </span>
              </span>
              <ArrowRight
                className="ml-auto size-4 shrink-0 text-signal-soft-foreground transition-transform duration-200 group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </Link>
          ) : null}

        </div>

        <div className="relative overflow-hidden rounded-3xl shadow-raised">
          <img
            src={heroPhoto}
            alt="Household boxes, a bicycle and suitcases stored neatly in a British home garage"
            width={1600}
            height={1200}
            fetchPriority="high"
            className="aspect-[5/4] w-full object-cover sm:aspect-[4/3] lg:aspect-[5/4]"
          />
        </div>
      </div>
    </section>
  );
}
