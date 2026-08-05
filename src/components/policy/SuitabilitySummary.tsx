/**
 * What the host has said about their space, shown plainly to renters —
 * including the things the host isn't sure about.
 */
import { Home } from "lucide-react";

import { SUITABILITY_QUESTIONS, answeredCount, suitabilityAnswerLabel } from "@/lib/policy/suitability";
import type { SuitabilityProfile } from "@/lib/policy/types";

export function SuitabilitySummary({
  profile,
  className,
}: {
  profile: SuitabilityProfile | null | undefined;
  className?: string;
}) {
  if (!profile) {
    return (
      <section className={"rounded-2xl border border-border bg-card p-5 " + (className ?? "")}>
        <h2 className="flex items-center gap-2 type-h3">
          <Home className="size-5 text-primary" aria-hidden="true" />
          About this space
        </h2>
        <p className="mt-1 type-body-sm text-muted-foreground">
          The host hasn&apos;t described this space in detail yet. Ask them about damp, ventilation
          and access before you book.
        </p>
      </section>
    );
  }

  const answered = answeredCount(profile.attributes);

  return (
    <section className={"rounded-2xl border border-border bg-card p-5 " + (className ?? "")}>
      <h2 className="flex items-center gap-2 type-h3">
        <Home className="size-5 text-primary" aria-hidden="true" />
        About this space
      </h2>
      <p className="mt-1 type-body-sm text-muted-foreground">
        Answered by the host ({answered} of {SUITABILITY_QUESTIONS.length} questions).
      </p>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        {SUITABILITY_QUESTIONS.map((question) => (
          <div key={question.key} className="rounded-xl border border-border bg-background p-3">
            <dt className="type-body-xs text-muted-foreground">{question.label}</dt>
            <dd className="mt-0.5 type-body-sm">
              {suitabilityAnswerLabel(question.key, profile.attributes[question.key])}
            </dd>
          </div>
        ))}
      </dl>
      {profile.host_notes ? (
        <p className="mt-4 type-body-sm text-muted-foreground">{profile.host_notes}</p>
      ) : null}
    </section>
  );
}
