/**
 * Closing call to action — both journeys, one line each.
 */
import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { HostEntryButton } from "@/components/home/HostEntryButton";
import { track } from "@/lib/analytics/tracker";

export function FinalCta() {
  return (
    <section aria-labelledby="final-cta-heading" className="py-10 sm:py-12">
      <div className="mx-auto w-full max-w-3xl px-4 text-center sm:px-6">
        <h2 id="final-cta-heading" className="type-h2">
          Ready to reclaim your space?
        </h2>
        <p className="mx-auto mt-3 max-w-lg type-body text-muted-foreground">
          Whether you're looking for storage or have unused space to earn from, EarnRoom makes it
          simple.
        </p>

        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <Button
            asChild
            size="lg"
            onClick={() =>
              track("cta_clicked", { props: { cta: "browse_spaces", from: "homepage_final" } })
            }
          >
            <Link to="/search">Find storage</Link>
          </Button>
          <HostEntryButton label="List your space" from="homepage_final" variant="secondary" />
        </div>
      </div>
    </section>
  );
}
