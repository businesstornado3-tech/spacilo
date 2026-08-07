/**
 * Closing call to action — both sides of the marketplace, one line each.
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
          Store nearby. Earn at home.
        </h2>
        <p className="mx-auto mt-3 max-w-md type-body text-muted-foreground">
          Find trusted storage near you, or turn your unused space into monthly income.
        </p>

        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <Button
            asChild
            size="lg"
            onClick={() =>
              track("cta_clicked", { props: { cta: "browse_spaces", from: "homepage_final" } })
            }
          >
            <Link to="/find-storage">Find storage</Link>
          </Button>
          <HostEntryButton label="List your space" from="homepage_final" variant="secondary" />
        </div>
      </div>
    </section>
  );
}
