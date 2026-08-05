/** Restrained host callout, low on the page. No earnings claims. */
import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/common/Reveal";
import { HostEntryButton } from "@/components/home/HostEntryButton";
import { ScanSpaceButton } from "@/components/home/SpaceFitEntry";

export function HostCallout() {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <Reveal className="rounded-3xl bg-primary-soft p-7 text-primary-soft-foreground sm:p-10">
        <h2 className="max-w-[22ch] type-h2 text-foreground">
          Your unused space could be earning.
        </h2>
        <p className="mt-3 max-w-xl type-body text-muted-foreground">
          Garage, loft, spare room or shed — turn the space you already have into extra monthly
          income.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild size="lg" variant="secondary">
            <Link to="/how-it-works">See how hosting works</Link>
          </Button>
          <HostEntryButton label="Start earning" from="homepage_host_callout" />
          <ScanSpaceButton from="homepage_host_callout" block={false} />
        </div>
      </Reveal>
    </section>
  );
}
