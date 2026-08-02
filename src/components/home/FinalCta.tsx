import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/common/Reveal";

export function FinalCta() {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
      <Reveal className="rounded-3xl bg-primary p-8 text-primary-foreground sm:p-12">
        <h2 className="max-w-[18ch] type-h1">Make room for what matters.</h2>
        <p className="mt-4 max-w-lg type-body text-primary-foreground/80">
          Find storage nearby — or start earning from space you're not using.
        </p>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg" variant="secondary">
            <Link to="/find-storage">Find storage</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="border-primary-foreground/40 text-primary-foreground hover:bg-primary-foreground/10">
            <Link to="/list-space">List my space</Link>
          </Button>
        </div>
      </Reveal>
    </section>
  );
}
