/** Host commercial proposition (1F). Value first, no promised income figures. */
import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/common/Reveal";
import { HostEntryButton } from "@/components/home/HostEntryButton";

const spaces = ["Garage", "Spare room", "Loft", "Shed"];

export function HostCallout() {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <Reveal className="rounded-3xl bg-primary-soft p-7 text-primary-soft-foreground sm:p-10">
        <h2 className="max-w-[16ch] type-h2 text-foreground">
          Got space?
          <br />
          Make it pay.
        </h2>
        <ul className="mt-5 flex flex-wrap gap-2">
          {spaces.map((space) => (
            <li key={space} className="rounded-full bg-card px-3 py-1.5 type-badge text-muted-foreground">
              {space}
            </li>
          ))}
        </ul>
        <p className="mt-5 max-w-xl type-body text-muted-foreground">
          See what your unused space could potentially earn. You set the monthly price, and you
          decide which requests to accept.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <HostEntryButton label="Start earning" from="homepage_host_callout" />
          <Button asChild size="lg" variant="secondary">
            <Link to="/how-it-works">See how hosting works</Link>
          </Button>
        </div>
      </Reveal>
    </section>
  );
}
