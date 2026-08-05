/**
 * "Report a problem" form (Prompt 18).
 *
 * Creating a case never touches the booking, the handover evidence or the
 * inventory snapshot. When it is opened from an existing Prompt 15 handover
 * issue, the case simply REFERENCES that issue — the original row is left
 * exactly as the participant recorded it.
 */
import * as React from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, NativeSelect, TextArea, TextInput } from "@/components/form/Field";
import { toast } from "@/components/overlay/toast";
import { useOpenSupportCase, useUploadCaseEvidence } from "@/hooks/useSupportCases";
import { evidenceFileProblem } from "@/lib/support-cases";
import {
  CASE_CATEGORIES,
  CASE_CATEGORY_LABEL,
  CASE_STAGES,
  CASE_STAGE_LABEL,
  SUPPORT_CASE_DISCLAIMER,
  type CaseParty,
  type SupportCase,
  type SupportCaseCategory,
  type SupportCaseStage,
} from "@/lib/support-cases";

export function ReportProblemForm({
  bookingId,
  role,
  defaultCategory,
  defaultStage,
  handoverIssueId,
  relatedIssueText,
  onCreated,
  onCancel,
}: {
  bookingId: string;
  role: CaseParty;
  defaultCategory?: SupportCaseCategory;
  defaultStage?: SupportCaseStage;
  handoverIssueId?: string | null;
  relatedIssueText?: string | null;
  onCreated: (kase: SupportCase) => void;
  onCancel: () => void;
}) {
  const create = useOpenSupportCase(bookingId);
  const [category, setCategory] = React.useState<SupportCaseCategory>(defaultCategory ?? "other");
  const [stage, setStage] = React.useState<SupportCaseStage>(defaultStage ?? "during_storage");
  const [summary, setSummary] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const upload = useUploadCaseEvidence("pending");

  const pending = create.isPending || upload.isPending;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (summary.trim().length < 3) {
      setError("Add a brief summary.");
      return;
    }
    if (description.trim().length < 10) {
      setError("Tell us a little more about what happened.");
      return;
    }
    if (file) {
      const problem = evidenceFileProblem(file);
      if (problem) {
        setError(problem);
        return;
      }
    }

    try {
      const kase = await create.mutateAsync({
        bookingId,
        category,
        stage,
        summary,
        description,
        handoverIssueId: handoverIssueId ?? null,
      });
      if (file) {
        try {
          await upload.mutateAsync({ caseId: kase.id, bookingId, role, file });
        } catch {
          toast.warning("Case created", "That file couldn't be uploaded — you can add it on the case.");
        }
      }
      toast.success("Support case created", `Reference ${kase.reference}`);
      onCreated(kase);
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message
          ? cause.message
          : "We couldn't create the support case. Please try again.",
      );
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <h3 className="type-h4">Report a problem</h3>

      {relatedIssueText ? (
        <div className="rounded-xl border border-border bg-muted/40 p-3">
          <p className="type-label">Related handover issue</p>
          <p className="mt-1 type-body-sm text-muted-foreground">{relatedIssueText}</p>
          <p className="mt-1 type-body-sm text-muted-foreground">
            The original handover record stays exactly as it was recorded.
          </p>
        </div>
      ) : null}

      <Field label="What happened?" htmlFor="case-category" required>
        <NativeSelect
          id="case-category"
          value={category}
          onChange={(e) => setCategory(e.target.value as SupportCaseCategory)}
        >
          {CASE_CATEGORIES.map((value) => (
            <option key={value} value={value}>
              {CASE_CATEGORY_LABEL[value]}
            </option>
          ))}
        </NativeSelect>
      </Field>

      <Field label="When did this happen?" htmlFor="case-stage" required>
        <NativeSelect
          id="case-stage"
          value={stage}
          onChange={(e) => setStage(e.target.value as SupportCaseStage)}
        >
          {CASE_STAGES.map((value) => (
            <option key={value} value={value}>
              {CASE_STAGE_LABEL[value]}
            </option>
          ))}
        </NativeSelect>
      </Field>

      <Field label="Brief summary" htmlFor="case-summary" required>
        <TextInput
          id="case-summary"
          value={summary}
          maxLength={160}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="A short title for this problem"
        />
      </Field>

      <Field label="Tell us what happened" htmlFor="case-description" required>
        <TextArea
          id="case-description"
          value={description}
          maxLength={4000}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe the problem in your own words."
        />
      </Field>

      <Field label="Add photos (optional)" htmlFor="case-photo">
        <input
          id="case-photo"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="type-body-sm"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </Field>

      <p className="type-body-sm text-muted-foreground">{SUPPORT_CASE_DISCLAIMER}</p>

      {error ? (
        <p role="alert" className="type-body-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" /> : null}
          Submit to support
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
