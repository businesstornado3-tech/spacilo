/**
 * Spacilo AI for hosts, introduced once and only after the commercial
 * proposition. Routes to the existing host scan flow; manual measurement
 * remains available inside the listing wizard.
 */
import { Reveal } from "@/components/common/Reveal";
import { SpaceFitAiMark } from "@/components/trust/SpaceFitAI";
import { ScanSpaceButton } from "@/components/home/SpaceFitEntry";

export function HostAiSection() {
  return (
    <section className="bg-surface">
      <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <Reveal>
          <SpaceFitAiMark size="sm" />
          <h2 className="mt-3 type-h2">No tape measure required.</h2>
          <p className="mt-3 max-w-xl type-body text-muted-foreground">
            Show Spacilo AI the space you're considering listing and it can help estimate usable
            capacity before you create the listing. You review and confirm every measurement, and
            you can enter dimensions by hand instead.
          </p>
          <div className="mt-6">
            <ScanSpaceButton from="homepage_host_ai" block={false} variant="default">
              Measure my space with Spacilo AI
            </ScanSpaceButton>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
