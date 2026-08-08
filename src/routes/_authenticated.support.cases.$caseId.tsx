import { createFileRoute, Link } from "@tanstack/react-router";


import { AppLayout } from "@/components/layout/AppLayout";
import { ErrorState, LoadingState } from "@/components/common/States";
import { SupportCaseView } from "@/components/support/SupportCaseView";
import { useAuth } from "@/hooks/useAuth";
import { useSupportCase } from "@/hooks/useSupportCases";

export const Route = createFileRoute("/_authenticated/support/cases/$caseId")({
  component: CaseRoute,
  head: () => ({
    meta: [
      { title: "Support case · Spacilo" },
      {
        name: "description",
        content:
          "Track a Spacilo support case: what was reported, the updates from both sides and the outcome.",
      },
      { property: "og:title", content: "Support case · Spacilo" },
      {
        property: "og:description",
        content: "Track a Spacilo support case and its outcome.",
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
    data && user ? (data.host_id === user.id ? "host" : data.renter_id === user.id ? "renter" : null) : null;

  return (
    <AppLayout mode={mode} title="Support case" description="Everything recorded about this problem.">
      {isLoading ? (
        <LoadingState label="Loading this case…" />
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
