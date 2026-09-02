/**
 * The host's honest description of their space.
 *
 * These answers are the host's own — EarnRoom AI never fills them in. "Not
 * sure" is always allowed and stays visible to renters, because an unknown is
 * more useful than a guess.
 */
import * as React from "react";
import { Home, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, NativeSelect, TextArea } from "@/components/form/Field";
import { CheckboxField } from "@/components/form/Controls";
import { Alert } from "@/components/common/Alert";
import { SUITABILITY_QUESTIONS, emptySuitability } from "@/lib/policy/suitability";
import type { SuitabilityAttributes, SuitabilityProfile } from "@/lib/policy/types";

export interface SuitabilityDraft {
  attributes: SuitabilityAttributes;
  notes: string;
  authority: boolean;
  compliance: boolean;
  accuracy: boolean;
}

export function draftFromProfile(profile: SuitabilityProfile | null): SuitabilityDraft {
  return {
    attributes: { ...emptySuitability(), ...(profile?.attributes ?? {}) },
    notes: profile?.host_notes ?? "",
    authority: profile?.declaration_authority ?? false,
    compliance: profile?.declaration_compliance ?? false,
    accuracy: profile?.declaration_accuracy ?? false,
  };
}

export function draftComplete(draft: SuitabilityDraft): boolean {
  return draft.authority && draft.compliance && draft.accuracy;
}

export function SpaceSuitabilityForm({
  value,
  onChange,
  onSave,
  saving,
  saved,
  embedded,
}: {
  value: SuitabilityDraft;
  onChange: (next: SuitabilityDraft) => void;
  onSave?: () => void;
  saving?: boolean;
  saved?: boolean;
  /** Inside the listing wizard the card chrome is supplied by the step. */
  embedded?: boolean;
}) {
  const setAttribute = (key: string, answer: string) =>
    onChange({ ...value, attributes: { ...value.attributes, [key]: answer } });

  const body = (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        {SUITABILITY_QUESTIONS.map((question) => (
          <Field key={question.key} label={question.label} htmlFor={`suit-${question.key}`} hint={question.help}>
            <NativeSelect
              id={`suit-${question.key}`}
              value={value.attributes[question.key] ?? "unknown"}
              onChange={(event: React.ChangeEvent<HTMLSelectElement>) =>
                setAttribute(question.key, event.target.value)
              }
            >
              {question.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
        ))}
      </div>

      <Field
        label="Anything else renters should know? (optional)"
        htmlFor="suit-notes"
        hint="Access times, a step up into the space, a shared hallway — anything you'd want to be told."
        className="mt-4"
      >
        <TextArea
          id="suit-notes"
          value={value.notes}
          maxLength={400}
          onChange={(event) => onChange({ ...value, notes: event.target.value })}
          placeholder="Dry garage, single step up at the door, access any day before 8pm."
        />
      </Field>

      <div className="mt-4 space-y-1">
        <CheckboxField
          id="host-declare-authority"
          label="I'm allowed to let this space"
          description="I own it, or my tenancy, lease or freeholder permits it."
          checked={value.authority}
          onChange={(event) => onChange({ ...value, authority: event.target.checked })}
        />
        <CheckboxField
          id="host-declare-compliance"
          label="I'll follow the storage policy"
          description="I won't accept prohibited items, and I'll flag anything that concerns me."
          checked={value.compliance}
          onChange={(event) => onChange({ ...value, compliance: event.target.checked })}
        />
        <CheckboxField
          id="host-declare-accuracy"
          label="These answers are accurate"
          description="I've described the space as it really is, including anything I'm unsure about."
          checked={value.accuracy}
          onChange={(event) => onChange({ ...value, accuracy: event.target.checked })}
        />
      </div>

      {onSave ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button type="button" onClick={onSave} disabled={saving || !draftComplete(value)}>
            {saving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            Save space details
          </Button>
          {saved ? <span className="type-body-sm text-success">Saved.</span> : null}
        </div>
      ) : null}

      {!draftComplete(value) ? (
        <Alert tone="info" className="mt-4" title="All three confirmations are needed">
          Renters see these answers before they request your space.
        </Alert>
      ) : null}
    </>
  );

  if (embedded) return body;

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
      <h2 className="flex items-center gap-2 type-h3">
        <Home className="size-5 text-primary" aria-hidden="true" />
        About this space
      </h2>
      <p className="mt-1 mb-4 type-body-sm text-muted-foreground">
        Honest answers help renters bring the right things — and protect you from storing something
        that doesn&apos;t suit your space.
      </p>
      {body}
    </section>
  );
}
