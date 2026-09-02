/**
 * SpaceFit pricing guidance and the illustrative earnings calculator.
 *
 * Both numbers come from `src/lib/pricing/suggestion.ts`, which derives its
 * guidance from the host's OWN space (size, type, condition, access) and the
 * platform's pricing model. It is NOT a local market valuation, and no
 * generative AI is involved at any point. The host always sets the final price
 * through the normal listing form, which remains the only persisted value.
 */
import * as React from "react";
import { Check, PoundSterling, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/format";
import {
  EARNINGS_NOTE,
  HOST_KEEPS_NOTE,
  projectEarnings,
  suggestPrice,
  type PriceSuggestionInput,
} from "@/lib/pricing/suggestion";

/** Occupancy scenarios. Explicitly illustrative — never a forecast. */
const OCCUPANCY_SCENARIOS = [50, 75, 90, 100] as const;

export const PRICING_GUIDANCE_NOTE =
  "This estimate is based on the characteristics of your space and EarnRoom's current pricing model. It is not a local market valuation.";

export function PricingAssistant({
  input,
  currentPricePence,
  onUseSuggestedPrice,
}: {
  input: PriceSuggestionInput;
  currentPricePence: number | null;
  onUseSuggestedPrice: (pence: number) => void;
}) {
  const [occupancy, setOccupancy] = React.useState<number>(100);
  const suggestion = React.useMemo(() => suggestPrice(input), [input]);

  // Earnings always follow the host's OWN price when they've set one.
  const basisPence = currentPricePence ?? suggestion.suggestedMonthlyPence;
  const projections = React.useMemo(
    () => projectEarnings(basisPence, occupancy),
    [basisPence, occupancy],
  );

  return (
    <section className="mt-5 rounded-2xl border border-signal/25 bg-signal-soft/30 p-5">
      <h3 className="flex items-center gap-2 type-h3">
        <Sparkles className="size-5 text-primary" aria-hidden="true" />
        EarnRoom AI price &amp; earnings
      </h3>

      {suggestion.suggestedMonthlyPence === null ? (
        <p className="mt-2 type-body-sm text-muted-foreground">
          {suggestion.notes[0] ?? "Add your measurements and we can suggest a starting price."}
        </p>
      ) : (
        <>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-background/70 p-3">
              <p className="type-body-sm text-muted-foreground">EarnRoom AI pricing guidance</p>
              <p className="mt-0.5 type-h3 tabular-nums">
                {formatPrice(suggestion.lowMonthlyPence ?? 0)}–
                {formatPrice(suggestion.highMonthlyPence ?? 0)}/month
              </p>
            </div>
            <div className="rounded-xl border border-border bg-background/70 p-3">
              <p className="type-body-sm text-muted-foreground">Recommended starting price</p>
              <p className="mt-0.5 type-h3 tabular-nums">
                {formatPrice(suggestion.suggestedMonthlyPence)}/month
              </p>
            </div>
          </div>

          {suggestion.factors.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-2">
              {suggestion.factors.map((factor) => (
                <li
                  key={factor.label}
                  className="rounded-full bg-secondary px-2.5 py-1 type-body-xs text-muted-foreground"
                >
                  {factor.label} {factor.effect}
                </li>
              ))}
            </ul>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => onUseSuggestedPrice(suggestion.suggestedMonthlyPence!)}
              disabled={currentPricePence === suggestion.suggestedMonthlyPence}
            >
              <Check aria-hidden="true" />
              Use suggested price
            </Button>
            <p className="flex items-center gap-1.5 self-center type-body-sm text-muted-foreground">
              <PoundSterling className="size-4" aria-hidden="true" />
              Or keep your own price — you decide.
            </p>
          </div>

          <p className="mt-3 type-body-sm text-muted-foreground">{PRICING_GUIDANCE_NOTE}</p>
        </>
      )}

      {/* ------------------------------------------------- earnings */}
      {basisPence ? (
        <div className="mt-5 border-t border-border pt-4">
          <h4 className="type-label">Your price</h4>
          <p className="mt-0.5 type-h3 tabular-nums">{formatPrice(basisPence)}/month</p>

          <div className="mt-3">
            <p className="type-body-sm text-muted-foreground">Illustrative occupancy scenario</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {OCCUPANCY_SCENARIOS.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setOccupancy(value)}
                  aria-pressed={occupancy === value}
                  className={
                    occupancy === value
                      ? "rounded-full bg-primary px-3 py-1.5 type-body-sm text-primary-foreground"
                      : "rounded-full border border-border bg-background px-3 py-1.5 type-body-sm text-muted-foreground"
                  }
                >
                  {value}% occupied
                </button>
              ))}
            </div>
          </div>

          <dl className="mt-4 space-y-1.5">
            <p className="type-label">Estimated gross storage earnings</p>
            {projections.map((projection) => (
              <div
                key={projection.months}
                className="flex items-center justify-between border-b border-border py-1.5 last:border-0"
              >
                <dt className="type-body-sm text-muted-foreground">
                  {projection.months} {projection.months === 1 ? "month" : "months"}
                </dt>
                <dd className="type-body-sm tabular-nums">
                  {formatPrice(projection.hostEarningsPence)}
                </dd>
              </div>
            ))}
          </dl>

          <p className="mt-3 type-body-sm text-muted-foreground">{HOST_KEEPS_NOTE}</p>
          <p className="mt-1 type-body-xs text-muted-foreground">{EARNINGS_NOTE}</p>
        </div>
      ) : null}
    </section>
  );
}
