import { createFileRoute, Link } from "@tanstack/react-router";

import { AppLayout } from "@/components/layout/AppLayout";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/States";
import { SafetyIncident } from "@/components/admin/SafetyIncident";
import { useAuth } from "@/hooks/useAuth";
import { useIsSupportStaff } from "@/hooks/useSupportCases";
import { useSafetyIncident } from "@/hooks/useSafetyIncident";

export const Route = createFileRoute("/_authenticated/admin/safety/$caseId")({
  component: SafetyIncidentRoute,
  head: () => ({
    meta: [
      { title: "Safety incident review · EarnRoom" },
      {
        name: "description",
        content:
          "Internal EarnRoom safety incident dossier: the case, the people, the space, the items, the policy result and every control applied.",
      },
      { property: "og:title", content: "Safety incident review · EarnRoom" },
      { property: "og:description", content: "Internal EarnRoom safety incident dossier." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function SafetyIncidentRoute() {
  const { caseId } = Route.useParams();
  const { profile } = useAuth();
  const staff = useIsSupportStaff();
  const mode = profile?.current_mode === "host" ? "host" : "renter";
  const incident = useSafetyIncident(caseId, staff.data === true);

  if (staff.isLoading) {
    return (
      <AppLayout mode={mode} title="Safety incident">
        <LoadingState label="Loading this incident…" />
      </AppLayout>
    );
  }

  if (!staff.data) {
    return (
      <AppLayout mode={mode} title="Safety incident">
        <EmptyState
          title="You don't have access to this area"
          description="Safety incident review is only available to EarnRoom safety staff."
        />
      </AppLayout>
    );
  }

  return (
    <AppLayout
      mode={mode}
      title="Safety incident"
      description="Everything recorded about this safety case, in one place."
    >
      {incident.isLoading ? <LoadingState label="Loading this incident…" /> : null}
      {incident.error ? (
        <ErrorState
          description={
            incident.error instanceof Error
              ? incident.error.message
              : "We couldn't load this incident."
          }
        />
      ) : null}
      {incident.data ? (
        <div className="space-y-6">
          <SafetyIncident dossier={incident.data} />
          <Link
            to="/admin/dashboard"
            className="type-body-sm text-primary underline underline-offset-4"
          >
            Back to the safety queue
          </Link>
        </div>
      ) : null}
    </AppLayout>
  );
}
