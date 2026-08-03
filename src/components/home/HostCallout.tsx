/** Restrained host callout, low on the page. No earnings claims. */
import { brand } from "@/config/brand";
import { Reveal } from "@/components/common/Reveal";
import { HostEntryButton } from "@/components/home/HostEntryButton";

export function HostCallout() {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <Reveal className="rounded-3xl bg-primary-soft p-7 text-primary-soft-foreground sm:p-10">
        <h2 className="max-w-[20ch] type-h2 text-foreground">
          Your unused space could be useful to someone nearby.
        </h2>
        <p className="mt-3 max-w-xl type-body text-muted-foreground">
          Garage sitting empty? Spare room you don't use? {brand.name} lets you offer suitable unused
          space and set your own monthly price.
        </p>
        <div className="mt-6">
          <HostEntryButton label="Start hosting" from="homepage_host_callout" />
        </div>
      </Reveal>
    </section>
  );
}
