/**
 * Chapter 6 — the final call to action.
 *
 * Both sides of the marketplace in one line each. Nothing more.
 */
import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { startDemo } from "@/components/spaceplanner/demo-bus";
import { track } from "@/lib/analytics/tracker";

export function FinalCta() {
  return (
    <section aria-labelledby="final-cta-heading" className="py-14 sm:py-20">
      <div className="mx-auto w-full max-w-3xl px-4 text-center sm:px-6">
        <h2 id="final-cta-heading" className="type-h1">
          Make the space work harder.
        </h2>
        <p className="mx-auto mt-3 max-w-md type-body text-muted-foreground">
          Plan what you're storing, or earn from the space you're not using.
        </p>

        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <Button
            size="lg"
            onClick={() => {
              track("cta_clicked", { props: { cta: "try_spaceplanner", from: "homepage_final" } });
              startDemo();
            }}
          >
            Try SpacePlanner™
          </Button>
          <Button
            asChild
            size="lg"
            variant="secondary"
            onClick={() =>
              track("cta_clicked", { props: { cta: "list_space", from: "homepage_final" } })
            }
          >
            <Link to="/list-space">List your space</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
