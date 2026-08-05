import { Link } from "@tanstack/react-router";
import { MapPin } from "lucide-react";

import { brand } from "@/config/brand";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/common/Reveal";

export function LaunchArea() {
  return (
    <section className="bg-primary-soft text-primary-soft-foreground">
      <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-16">
        <Reveal className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-center">
          <div>
            <p className="type-overline">Starting local</p>
            <h2 className="mt-3 type-h2 text-foreground">Hello, Portsmouth.</h2>
            <p className="mt-3 max-w-lg type-body text-muted-foreground">
              We're starting in Portsmouth and nearby neighbourhoods before expanding across the UK.
            </p>
            <ul className="mt-6 flex flex-wrap gap-2">
              {brand.pilotAreas.map((area) => (
                <li
                  key={area}
                  className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 type-badge text-muted-foreground"
                >
                  <MapPin className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
                  {area}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-3xl bg-card p-6 shadow-card">
            <h3 className="type-h3 text-foreground">Be one of the first.</h3>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" block>
                <Link to="/find-storage">Find space near me</Link>
              </Button>
              <Button asChild size="lg" variant="secondary" block>
                <Link to="/list-space">Put my space to work</Link>
              </Button>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
