import { Link } from "@tanstack/react-router";

import hostPhoto from "@/assets/host-home-garage.jpg";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/common/Reveal";
import { HostEarningsCard } from "@/components/host/HostEarningsCard";
import { hostSpaceCategories } from "@/data/home";

export function HostSection() {
  return (
    <section className="bg-accent-soft text-accent-foreground">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-2 lg:items-center">
        <Reveal>
          <p className="type-overline">For Hosts</p>
          <h2 className="mt-3 type-h2">
            Got space?
            <br />
            Make it pay.
          </h2>
          <p className="mt-3 max-w-md type-body text-accent-foreground/80">
            Your garage doesn't have to be empty to earn. List the space you're not using and choose
            what you're comfortable storing.
          </p>

          <ul className="mt-6 flex flex-wrap gap-2">
            {hostSpaceCategories.map((c) => (
              <li
                key={c}
                className="rounded-full bg-card/70 px-3 py-1.5 type-badge text-accent-foreground"
              >
                {c}
              </li>
            ))}
          </ul>

          <div className="mt-7 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/list-space">Estimate my earnings</Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link to="/list-space">List my space</Link>
            </Button>
          </div>
        </Reveal>

        <Reveal delay={80}>
          <div className="overflow-hidden rounded-3xl shadow-raised">
            <img
              src={hostPhoto}
              alt="Open single garage attached to a red brick British home with room to spare inside"
              width={1408}
              height={1056}
              loading="lazy"
              className="aspect-[4/3] w-full object-cover"
            />
          </div>
          <HostEarningsCard
            amount={8500}
            className="mt-4 bg-card/70"
            note="Illustrative estimate"
          />
          <p className="mt-3 type-body-sm text-accent-foreground/70">
            Actual earnings depend on location, size, access, demand and other factors.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
