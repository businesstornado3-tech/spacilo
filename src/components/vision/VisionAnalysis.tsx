/**
 * VisionAnalysis — the premium "AI is thinking" moment.
 *
 * Purely presentational: the stages describe real work the engine is doing, in
 * order, so the wait explains itself.
 */
import { Check, Loader2, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import type { VisionStage } from "@/lib/vision";

export function VisionAnalysis({
  stages,
  stageIndex,
  complete = false,
  title = "EarnRoom AI is analysing your photos",
}: {
  stages: VisionStage[];
  stageIndex: number;
  complete?: boolean;
  title?: string;
}) {
  const progress = complete ? 100 : Math.round(((stageIndex + 0.5) / stages.length) * 100);

  return (
    <section
      aria-live="polite"
      className="rounded-2xl border border-border bg-card p-5 shadow-card sm:p-6"
    >
      <p className="inline-flex items-center gap-2 rounded-full bg-signal-soft px-3 py-1 type-badge text-signal-soft-foreground">
        <Sparkles className="size-3.5" aria-hidden="true" />
        EarnRoom Vision AI
      </p>
      <h3 className="mt-3 type-h4">{title}</h3>

      <div
        className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      <ol className="mt-4 space-y-2">
        {stages.map((stage, index) => {
          const done = complete || index < stageIndex;
          const active = !complete && index === stageIndex;
          return (
            <li
              key={stage.id}
              className={cn(
                "flex items-center gap-2 type-body-sm transition-opacity",
                done ? "text-foreground" : active ? "text-foreground" : "text-muted-foreground/60",
              )}
            >
              {done ? (
                <Check className="size-4 text-success" aria-hidden="true" />
              ) : active ? (
                <Loader2 className="size-4 animate-spin text-primary" aria-hidden="true" />
              ) : (
                <span className="size-4 rounded-full border border-border" aria-hidden="true" />
              )}
              {stage.label}
            </li>
          );
        })}
        {complete ? (
          <li className="flex items-center gap-2 type-body-sm">
            <Check className="size-4 text-success" aria-hidden="true" />
            Complete.
          </li>
        ) : null}
      </ol>
    </section>
  );
}
