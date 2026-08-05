import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ScanLine, Search, Warehouse } from "lucide-react";

import { brand } from "@/config/brand";
import { MarketingLayout, PageSection } from "@/components/layout/MarketingLayout";
import { Reveal } from "@/components/common/Reveal";
import { Button } from "@/components/ui/button";
import { JourneySteps } from "@/components/marketing/JourneySteps";
import { FaqAccordion } from "@/components/marketing/FaqAccordion";
import {
  aiExplanation,
  hostJourney,
  howItWorksFaq,
  renterJourney,
} from "@/data/how-it-works";

const title = "How it works — " + brand.name;
const description =
  "How neighbourhood storage works on " +
  brand.name +
  ": the renter journey, the host journey, and how " +
  brand.ai +
  " helps both sides.";

export const Route = createFileRoute("/how-it-works")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
    ],
  }),
  component: HowItWorksPage,
});

function HowItWorksPage() {
  return (
    <MarketingLayout>
      <PageSection>
        <Reveal>
          <p className="type-overline text-muted-foreground">How {brand.name} works</p>
          <h1 className="mt-2 type-h1">
            Storage nearby.
            <br />
            Value from space you're not using.
          </h1>
          <p className="mt-4 max-w-prose type-body text-muted-foreground">
            {brand.name} connects people who need storage with people who have useful space
            nearby. {brand.ai} helps both sides understand belongings, available space and
            possible fit — you always review and confirm the details yourself.
          </p>
        </Reveal>
      </PageSection>

      <PageSection className="pt-0">
        <JourneySteps
          heading="The renter journey"
          intro="From showing us what you need to store, through to a booked space."
          steps={renterJourney}
        />
      </PageSection>

      <PageSection className="pt-0">
        <JourneySteps
          heading="The host journey"
          intro="From showing us your space, through to earning from a completed booking."
          steps={hostJourney}
        />
      </PageSection>

      <PageSection className="pt-0">
        <Reveal>
          <div className="rounded-2xl border border-border bg-surface p-6 sm:p-8">
            <h2 className="type-h2">{aiExplanation.heading}</h2>
            <p className="mt-2 max-w-prose type-body text-muted-foreground">{aiExplanation.intro}</p>
            <div className="mt-6 grid gap-6 sm:grid-cols-2">
              <div>
                <h3 className="type-card-title">For renters, it may help propose</h3>
                <ul className="mt-2 space-y-1.5 type-body-sm text-muted-foreground">
                  {aiExplanation.forRenters.map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="type-card-title">For hosts, it may help with</h3>
                <ul className="mt-2 space-y-1.5 type-body-sm text-muted-foreground">
                  {aiExplanation.forHosts.map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
              </div>
            </div>
            <ul className="mt-6 space-y-1.5 border-t border-border pt-5 type-body-sm text-muted-foreground">
              {aiExplanation.disclaimers.map((item) => (
                <li key={item}>• {item}</li>
              ))}
            </ul>
          </div>
        </Reveal>
      </PageSection>

      <PageSection className="pt-0">
        <Reveal>
          <h2 className="type-h2">Frequently asked questions</h2>
          <FaqAccordion items={howItWorksFaq} />
        </Reveal>
      </PageSection>

      <PageSection className="pt-0">
        <div className="grid gap-6 sm:grid-cols-2">
          <Reveal className="rounded-2xl border border-border bg-card p-6 sm:p-8">
            <Warehouse className="size-6 text-primary" aria-hidden="true" />
            <h2 className="mt-3 type-h3">Need storage?</h2>
            <p className="mt-1.5 type-body-sm text-muted-foreground">
              Show us your stuff, or search what's available nearby.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button asChild>
                <Link to="/spacefit/stuff">
                  <ScanLine aria-hidden="true" />
                  Scan my stuff
                </Link>
              </Button>
              <Button asChild variant="secondary">
                <Link to="/search">
                  <Search aria-hidden="true" />
                  Find storage
                </Link>
              </Button>
            </div>
          </Reveal>

          <Reveal delay={60} className="rounded-2xl border border-border bg-card p-6 sm:p-8">
            <ArrowRight className="size-6 text-primary" aria-hidden="true" />
            <h2 className="mt-3 type-h3">Have space?</h2>
            <p className="mt-1.5 type-body-sm text-muted-foreground">
              Show us your space and see what it could be worth.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button asChild>
                <Link to="/spacefit/space">
                  <ScanLine aria-hidden="true" />
                  Scan my space
                </Link>
              </Button>
              <Button asChild variant="secondary">
                <Link to="/list-space">List your space</Link>
              </Button>
            </div>
          </Reveal>
        </div>
      </PageSection>
    </MarketingLayout>
  );
}
