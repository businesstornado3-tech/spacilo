import * as React from "react";
import { Link } from "@tanstack/react-router";
import { Boxes, MapPin, Ruler } from "lucide-react";

import itemsPhoto from "@/assets/spacefit-items.jpg";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/common/Reveal";
import { useInView } from "@/hooks/use-motion";
import {
  AnimatedSpaceFitScore,
  SpaceFitAiMark,
  SpaceFitSpark,
} from "@/components/trust/SpaceFitAI";

const recognised = [
  { emoji: "🛋", label: "Sofa", qty: 1 },
  { emoji: "🚲", label: "Bicycle", qty: 2 },
  { emoji: "📦", label: "Boxes", qty: 12 },
  { emoji: "🧳", label: "Suitcases", qty: 3 },
];

const results = [
  { icon: Boxes, value: "18 items", label: "identified" },
  { icon: Ruler, value: "5.4 m³", label: "estimated space" },
  { icon: MapPin, value: "11 spaces", label: "suitable nearby" },
];

export function SpaceFitSection() {
  const { ref, inView } = useInView<HTMLDivElement>();
  const [analysed, setAnalysed] = React.useState(false);

  React.useEffect(() => {
    if (!inView) return;
    const id = window.setTimeout(() => setAnalysed(true), 1900);
    return () => window.clearTimeout(id);
  }, [inView]);

  return (
    <section className="bg-surface">
      <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <Reveal>
          <p className="type-overline text-signal-soft-foreground">
            <SpaceFitSpark /> Spacilo AI
          </p>
          <h2 className="mt-3 type-h2">Just show us your stuff.</h2>
          <p className="mt-3 max-w-xl type-body text-muted-foreground">
            Don't know what size storage you need? Upload a photo and we'll help estimate the space
            your belongings require.
          </p>
        </Reveal>

        <div ref={ref} className="mt-9 grid gap-5 lg:grid-cols-2 lg:items-start">
          <div className="overflow-hidden rounded-3xl bg-card shadow-card">
            <img
              src={itemsPhoto}
              alt="Overhead view of a sofa, two bicycles, twelve cardboard boxes and three suitcases ready for storage"
              width={1200}
              height={912}
              loading="lazy"
              className="aspect-[4/3] w-full object-cover"
            />
            <div className="p-5">
              <SpaceFitAiMark size="sm" />
              <ul className="mt-4 flex flex-wrap gap-2">
                {recognised.map((r) => (
                  <li
                    key={r.label}
                    className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 type-badge text-muted-foreground"
                  >
                    <span aria-hidden="true">{r.emoji}</span>
                    {r.label} ×{r.qty}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div
            className="rounded-3xl border border-border bg-card p-5 shadow-card sm:p-6"
            aria-live="polite"
          >
            {!analysed ? (
              <div>
                <p className="type-label text-signal-soft-foreground">
                  Spacilo AI is analysing your items…
                </p>
                <div className="mt-5 space-y-2.5">
                  {[100, 82, 64].map((w) => (
                    <div
                      key={w}
                      className="relative h-3 overflow-hidden rounded-full bg-surface"
                      style={{ width: `${w}%` }}
                    >
                      <div className="animate-sweep absolute inset-y-0 w-1/3 bg-signal/25" />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="animate-rise flex flex-col items-center gap-6 sm:flex-row">
                <AnimatedSpaceFitScore score={96} className="shrink-0" />
                <ul className="grid w-full gap-3">
                  {results.map(({ icon: Icon, value, label }) => (
                    <li
                      key={label}
                      className="flex items-center gap-3 rounded-xl bg-surface px-3 py-2.5"
                    >
                      <Icon
                        className="size-4 shrink-0 text-signal-soft-foreground"
                        aria-hidden="true"
                      />
                      <span className="type-label tabular-nums">{value}</span>
                      <span className="type-body-sm text-muted-foreground">{label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-6 border-t border-border pt-5">
              <Button asChild size="lg">
                <Link to="/how-it-works">Scan my stuff</Link>
              </Button>
              <p className="mt-3 type-body-sm text-muted-foreground">
                AI estimates can always be reviewed and corrected before you search.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
