import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";


import { AppLayout } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/badge";
import { EmptyState, LoadingState } from "@/components/common/States";
import { Field, NativeSelect } from "@/components/form/Field";
import { useAuth } from "@/hooks/useAuth";
import { useIsSupportStaff, useSupportQueue } from "@/hooks/useSupportCases";
import {
  CASE_CATEGORIES,
  CASE_CATEGORY_LABEL,
  STAFF_STATUS_LABEL,
  isCaseLive,
} from "@/lib/support-cases";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/support/")({
  component: SupportQueueRoute,
  head: () => ({
    meta: [
      { title: "Support queue · Spacilo" },
      {
        name: "description",
        content: "Internal Spacilo support queue for booking issues, disputes and refunds.",
      },
      { property: "og:title", content: "Support queue · Spacilo" },
      { property: "og:description", content: "Internal Spacilo support queue." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function SupportQueueRoute() {
  const { profile } = useAuth();
  const staff = useIsSupportStaff();
  const [status, setStatus] = React.useState("open");
  const [category, setCategory] = React.useState("");
  const queue = useSupportQueue({
    ...(status ? { status } : {}),
    ...(category ? { category } : {}),
  });

  const mode = profile?.current_mode === "host" ? "host" : "renter";

  if (staff.isLoading) {
    return (
      <AppLayout mode={mode} title="Support queue">
        <LoadingState label="Loading support cases…" />
      </AppLayout>
    );
  }

  if (!staff.data) {
    return (
      <AppLayout mode={mode} title="Support queue">
        <EmptyState
          title="You don't have access to this area"
          description="The support queue is only available to Spacilo support staff."
        />
      </AppLayout>
    );
  }

  const cases = queue.data ?? [];

  return (
    <AppLayout
      mode={mode}
      title="Support queue"
      description="Booking issues reported by renters and hosts."
    >
      <p className="type-body-sm text-muted-foreground">
        <Link to="/admin/reviews" className="underline">
          Review moderation queue
        </Link>
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Status" htmlFor="queue-status">
          <NativeSelect id="queue-status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            <option value="open">Open</option>
            <option value="under_review">Under review</option>
            <option value="waiting">Waiting on someone</option>
            <option value="resolved">Resolved</option>
          </NativeSelect>
        </Field>
        <Field label="Issue type" htmlFor="queue-category">
          <NativeSelect
            id="queue-category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">All</option>
            {CASE_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {CASE_CATEGORY_LABEL[value]}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>

      {queue.isLoading ? (
        <LoadingState label="Loading support cases…" />
      ) : null}

      {!queue.isLoading && cases.length === 0 ? (
        <EmptyState title="Nothing in the queue" description="No cases match these filters." />
      ) : null}

      <ul className="mt-4 space-y-3">
        {cases.map((kase) => (
          <li key={kase.id} className="rounded-2xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link
                to="/admin/support/$caseId"
                params={{ caseId: kase.id }}
                className="type-label text-primary underline underline-offset-4"
              >
                {kase.reference}
              </Link>
              <Badge variant={isCaseLive(kase.status) ? "warning" : "neutral"}>
                {STAFF_STATUS_LABEL[kase.status]}
              </Badge>
            </div>
            <p className="mt-1 type-body-sm">{kase.summary}</p>
            <p className="mt-1 type-body-sm text-muted-foreground">
              {CASE_CATEGORY_LABEL[kase.category]} · last activity{" "}
              {formatDate(kase.last_activity_at ?? kase.created_at)}
            </p>
          </li>
        ))}
      </ul>
    </AppLayout>
  );
}
