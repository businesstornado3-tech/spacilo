import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/common/Reveal";

export function FinalCta() {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
      <Reveal className="rounded-3xl bg-primary p-8 text-primary-foreground sm:p-12">
        <h2 className="max-w-[18ch] type-h1">Make room for what matters.</h2>
        <div className="mt-7 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="type-overline text-primary-foreground/70">Need space?</p>
            <Button asChild size="lg" variant="secondary" className="mt-3">
              <Link to="/find-storage">Find storage</Link>
            </Button>
          </div>
          <div>
            <p className="type-overline text-primary-foreground/70">Have space?</p>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="mt-3 border-primary-foreground/40 text-primary-foreground hover:bg-primary-foreground/10"
            >
              <Link to="/list-space">Start earning</Link>
            </Button>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
