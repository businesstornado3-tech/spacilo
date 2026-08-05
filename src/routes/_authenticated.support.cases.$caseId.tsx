import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import { AppLayout } from "@/components/layout/AppLayout";
import { ErrorState } from "@/components/common/States";
import { SupportCaseView } from "@/components/support/SupportCaseView";
import { useAuth } from "@/hooks/useAuth";
import { useSupportCase } from "@/hooks/useSupportCases";

export const Route = createFileRoute("/_authenticated/support/cases/$caseId")({
  component: CaseRoute,
  head: () => ({
    meta: [
      { title: "Support case · Project Stow" },
      {
        name: "description",
        content:
          "Track a Project Stow support case: what was reported, the updates from both sides and the outcome.",
      },
      { property: "og:title", content: "Support case · Project Stow" },
      {
        property: "og:description",
        content: "Track a Project Stow support case and its outcome.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function CaseRoute() {
  const { caseId } = Route.useParams();
  const { user, profile } = useAuth();
  const { data, isLoading, error } = useSupportCase(caseId);

  const mode = profile?.current_mode === "host" ? "host" : "renter";
  const role =
    data && user ? (data.host_user_id === user.id ? "host" : data.renter_user_id === user.id ? "renter" : null) : null;

  return (
    <AppLayout mode={mode} title="Support case" description="Everything recorded about this problem.">
      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      ) : null}

      {error ? <ErrorState description="We couldn't load this support case." /> : null}

      {data ? (
        <div className="space-y-6">
          <SupportCaseView kase={data} viewerId={user?.id ?? null} role={role} />
          <Link
            to={mode === "host" ? "/host/bookings" : "/renter/bookings"}
            className="type-body-sm text-primary underline underline-offset-4"
          >
            Back to bookings
          </Link>
        </div>
      ) : null}
    </AppLayout>
  );
}
