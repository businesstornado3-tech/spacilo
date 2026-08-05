/**
 * Support entry point on a booking (Prompt 18).
 *
 * Shows any existing cases for this booking and lets either party report a
 * new problem. Reporting never mutates the booking, its payments or the
 * handover record — it only opens a case that references them.
 */
import * as React from "react";
import { Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ReportProblemForm } from "@/components/support/ReportProblemForm";
import { useBookingSupportCases } from "@/hooks/useSupportCases";
import {
  CASE_CATEGORY_LABEL,
  isCaseLive,
  statusLabel,
  type CaseParty,
  type SupportCaseCategory,
  type SupportCaseStage,
} from "@/lib/support-cases";
import { formatDate } from "@/lib/format";

export function SupportSection({
  bookingId,
  role,
  viewerId,
  defaultCategory,
  defaultStage,
  handoverIssueId,
  relatedIssueText,
}: {
  bookingId: string;
  role: CaseParty;
  viewerId: string | null;
  defaultCategory?: SupportCaseCategory;
  defaultStage?: SupportCaseStage;
  handoverIssueId?: string | null;
  relatedIssueText?: string | null;
}) {
  const { data, isLoading } = useBookingSupportCases(bookingId);
  const [reporting, setReporting] = React.useState(false);
  const cases = data ?? [];

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="type-h5">Problems and support</h2>
          <p className="mt-1 type-body-sm text-muted-foreground">
            Something not right with this booking? Report it and our support team will look into it.
          </p>
        </div>
        {!reporting ? (
          <Button variant="outline" size="sm" onClick={() => setReporting(true)}>
            Report a problem
          </Button>
        ) : null}
      </div>

      {isLoading ? (
        <Loader2 className="mt-4 size-4 animate-spin text-muted-foreground" aria-hidden="true" />
      ) : null}

      {cases.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {cases.map((kase) => (
            <li key={kase.id} className="rounded-xl border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="type-label">{kase.reference}</p>
                <Badge variant={isCaseLive(kase.status) ? "warning" : "neutral"}>
                  {statusLabel(kase.status, kase.opened_by_user_id === viewerId)}
                </Badge>
              </div>
              <p className="mt-1 type-body-sm">{kase.summary}</p>
              <p className="mt-1 type-body-sm text-muted-foreground">
                {CASE_CATEGORY_LABEL[kase.category]} · opened {formatDate(kase.created_at)}
              </p>
              <Link
                to="/support/cases/$caseId"
                params={{ caseId: kase.id }}
                className="mt-2 inline-block type-body-sm text-primary underline underline-offset-4"
              >
                View case
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      {reporting ? (
        <div className="mt-5 border-t border-border pt-5">
          <ReportProblemForm
            bookingId={bookingId}
            role={role}
            {...(defaultCategory ? { defaultCategory } : {})}
            {...(defaultStage ? { defaultStage } : {})}
            handoverIssueId={handoverIssueId ?? null}
            relatedIssueText={relatedIssueText ?? null}
            onCreated={() => setReporting(false)}
            onCancel={() => setReporting(false)}
          />
        </div>
      ) : null}
    </section>
  );
}
