import { useNavigate } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import heroPhoto from "@/assets/hero-storage.jpg";
import { PostcodeSearch } from "@/components/form/SearchFields";
import { SpaceFitSpark } from "@/components/trust/SpaceFitAI";

export function Hero() {
  const navigate = useNavigate();

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
            Find trusted storage in unused spaces around your neighbourhood — garages, spare rooms,
            lofts and sheds.
          </p>

          <div className="mt-7 rounded-2xl bg-card p-4 shadow-card sm:p-5">
            <PostcodeSearch
              label="Enter your postcode"
              buttonLabel="Find storage"
              onSearch={() => navigate({ to: "/find-storage" })}
            />
          </div>

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

          <Link
            to="/list-space"
            className="mt-4 inline-flex items-center gap-1.5 type-nav text-primary underline-offset-4 hover:underline"
          >
            Got unused space? Start earning
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>

        <div className="relative order-first overflow-hidden rounded-3xl shadow-raised lg:order-none">
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
