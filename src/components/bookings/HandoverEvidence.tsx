/**
 * Handover / collection evidence for one booking stage (Prompt 15).
 *
 * This does NOT move the booking on. The existing Prompt 14 two-party
 * confirmation (`confirm_booking_handover` / `confirm_booking_collection`)
 * remains the only thing that changes status; this panel sits alongside it and
 * records what was handed over, optional photos, optional condition notes and
 * any reported issue. Everything shown here is provided by the renter and the
 * host — nothing is verified by Project Stow or by SpaceFit.
 */
import * as React from "react";
import { AlertTriangle, ImagePlus, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, NativeSelect, TextArea } from "@/components/form/Field";
import { toast } from "@/components/overlay/toast";
import {
  useAddConditionNote,
  useConditionNotes,
  useEvidencePhotos,
  useHandoverIssues,
  useReportHandoverIssue,
  useUploadEvidencePhoto,
} from "@/hooks/useHandover";
import { signedEvidenceUrls } from "@/lib/handover-api";
import {
  EVIDENCE_DISCLAIMER,
  ISSUE_CATEGORIES,
  ISSUE_CATEGORY_LABEL,
  attribution,
  stageOpen,
  type HandoverIssueCategory,
  type HandoverStage,
  type Party,
} from "@/lib/handover";
import { formatDate } from "@/lib/format";

const errorMessage = (cause: unknown, fallback: string) =>
  cause instanceof Error && cause.message ? cause.message : fallback;

export function HandoverEvidence({
  bookingId,
  bookingStatus,
  stage,
  role,
}: {
  bookingId: string;
  bookingStatus: string;
  stage: HandoverStage;
  /** Null when the viewer isn't a participant — then nothing can be added. */
  role: Party | null;
}) {
  const photosQuery = useEvidencePhotos(bookingId);
  const notesQuery = useConditionNotes(bookingId);
  const issuesQuery = useHandoverIssues(bookingId);
  const upload = useUploadEvidencePhoto(bookingId);
  const addNote = useAddConditionNote(bookingId);
  const reportIssue = useReportHandoverIssue(bookingId);

  const fileRef = React.useRef<HTMLInputElement>(null);
  const [note, setNote] = React.useState("");
  const [showIssue, setShowIssue] = React.useState(false);
  const [category, setCategory] = React.useState<HandoverIssueCategory>("items_differ");
  const [issueText, setIssueText] = React.useState("");
  const [urls, setUrls] = React.useState<Record<string, string>>({});
  const uid = React.useId();

  const photos = (photosQuery.data ?? []).filter((row) => row.stage === stage);
  const notes = (notesQuery.data ?? []).filter((row) => row.stage === stage);
  const issues = (issuesQuery.data ?? []).filter((row) => row.stage === stage);
  const loading = photosQuery.isLoading || notesQuery.isLoading;
  const canAdd = Boolean(role) && stageOpen(bookingStatus, stage);

  const paths = photos.map((photo) => photo.storage_path).join("|");
  React.useEffect(() => {
    let active = true;
    const list = paths ? paths.split("|") : [];
    if (list.length === 0) {
      setUrls({});
      return;
    }
    void signedEvidenceUrls(list).then((map) => {
      if (active) setUrls(map);
    });
    return () => {
      active = false;
    };
  }, [paths]);

  const onFiles = async (files: File[]) => {
    if (!role || files.length === 0) return;
    for (const file of files) {
      try {
        await upload.mutateAsync({ bookingId, stage, role, file });
      } catch (cause) {
        toast.error(
          "We couldn't upload this photo",
          errorMessage(cause, "Please try again."),
        );
        return;
      }
    }
    toast.success("Photo added to the handover record");
  };

  const onAddNote = async () => {
    if (!role || !note.trim()) return;
    try {
      await addNote.mutateAsync({ bookingId, stage, role, body: note });
      setNote("");
      toast.success("Condition note recorded");
    } catch (cause) {
      toast.error("We couldn't record that note", errorMessage(cause, "Please try again."));
    }
  };

  const onReport = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!role || !issueText.trim()) return;
    try {
      await reportIssue.mutateAsync({ bookingId, stage, role, category, description: issueText });
      setIssueText("");
      setShowIssue(false);
      toast.success(
        "Issue recorded",
        "We've kept this alongside the handover record. Nothing else has been changed.",
      );
    } catch (cause) {
      toast.error("We couldn't record that issue", errorMessage(cause, "Please try again."));
    }
  };

  if (loading) {
    return (
      <p className="flex items-center gap-2 type-body-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        Loading the handover record…
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="type-body-sm text-muted-foreground">{EVIDENCE_DISCLAIMER}</p>

      {/* photos */}
      <div className="space-y-2">
        <h4 className="type-label">Photos</h4>
        {photos.length === 0 ? (
          <p className="type-body-sm text-muted-foreground">
            {stage === "check_in" ? "No handover photos added." : "No collection photos added."}
          </p>
        ) : (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {photos.map((photo) => (
              <li
                key={photo.id}
                className="overflow-hidden rounded-xl border border-border bg-muted"
              >
                {urls[photo.storage_path] ? (
                  <img
                    src={urls[photo.storage_path]}
                    alt={`Handover photo added by the ${photo.uploader_role} on ${formatDate(photo.created_at)}`}
                    className="aspect-square w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="aspect-square w-full animate-pulse bg-muted" />
                )}
                <p className="px-2 py-1 type-body-sm text-muted-foreground">
                  {photo.uploader_role === "host" ? "Host" : "Renter"}
                </p>
              </li>
            ))}
          </ul>
        )}
        {canAdd ? (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              onChange={(event) => {
                void onFiles(Array.from(event.target.files ?? []));
                event.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => fileRef.current?.click()}
              disabled={upload.isPending}
            >
              {upload.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <ImagePlus className="size-4" aria-hidden="true" />
              )}
              {upload.isPending ? "Uploading…" : "Add photos"}
            </Button>
          </>
        ) : null}
      </div>

      {/* notes */}
      <div className="space-y-2">
        <h4 className="type-label">Condition notes</h4>
        {notes.length === 0 ? (
          <p className="type-body-sm text-muted-foreground">No condition notes recorded.</p>
        ) : (
          <ul className="space-y-2">
            {notes.map((row) => (
              <li key={row.id} className="rounded-xl border border-border bg-card p-3">
                <p className="type-body-sm break-words whitespace-pre-wrap">{row.body}</p>
                <p className="mt-1 type-body-sm text-muted-foreground">
                  {attribution(row.author_role)} · {formatDate(row.created_at)}
                </p>
              </li>
            ))}
          </ul>
        )}
        {canAdd ? (
          <div className="space-y-2">
            <Field
              label="Add a condition note"
              hint="Optional. Once submitted it can't be edited."
              htmlFor={`${uid}-note`}
            >
              <TextArea
                id={`${uid}-note`}
                rows={3}
                value={note}
                maxLength={1000}
                onChange={(event) => setNote(event.target.value)}
                placeholder="e.g. 12 boxes and two suitcases placed at the rear of the garage."
              />
            </Field>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => void onAddNote()}
              disabled={!note.trim() || addNote.isPending}
            >
              {addNote.isPending ? "Saving…" : "Add note"}
            </Button>
          </div>
        ) : null}
      </div>

      {/* issues */}
      {issues.length > 0 ? (
        <div className="space-y-2">
          <h4 className="type-label">Reported issues</h4>
          <ul className="space-y-2">
            {issues.map((row) => (
              <li key={row.id} className="rounded-xl border border-warning/40 bg-warning-soft p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="type-body-sm font-semibold">{ISSUE_CATEGORY_LABEL[row.category]}</p>
                  <Badge variant="warning">Reported</Badge>
                </div>
                <p className="mt-1 type-body-sm break-words whitespace-pre-wrap">
                  {row.description}
                </p>
                <p className="mt-1 type-body-sm text-muted-foreground">
                  {attribution(row.reporter_role)} · {formatDate(row.created_at)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {canAdd ? (
        showIssue ? (
          <form
            onSubmit={(event) => void onReport(event)}
            className="space-y-3 rounded-xl border border-border bg-card p-4"
          >
            <h4 className="type-body font-semibold">Report a handover issue</h4>
            <Field label="What doesn't match?" htmlFor={`${uid}-category`}>
              <NativeSelect
                id={`${uid}-category`}
                value={category}
                onChange={(event) => setCategory(event.target.value as HandoverIssueCategory)}
              >
                {ISSUE_CATEGORIES.map((value) => (
                  <option key={value} value={value}>
                    {ISSUE_CATEGORY_LABEL[value]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Describe the issue" htmlFor={`${uid}-issue`}>
              <TextArea
                id={`${uid}-issue`}
                rows={3}
                maxLength={1000}
                value={issueText}
                onChange={(event) => setIssueText(event.target.value)}
              />
            </Field>
            <p className="type-body-sm text-muted-foreground">
              This records your account of the handover. It doesn&apos;t change the other
              person&apos;s record and it doesn&apos;t decide the outcome.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm" disabled={!issueText.trim() || reportIssue.isPending}>
                {reportIssue.isPending ? "Recording…" : "Submit issue"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setShowIssue(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <Button type="button" variant="ghost" size="sm" onClick={() => setShowIssue(true)}>
            <AlertTriangle className="size-4" aria-hidden="true" />
            Something doesn&apos;t match
          </Button>
        )
      ) : null}
    </div>
  );
}
