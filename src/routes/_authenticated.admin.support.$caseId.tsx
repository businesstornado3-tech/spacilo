import { createFileRoute, Link } from "@tanstack/react-router";


import { AppLayout } from "@/components/layout/AppLayout";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/States";
import { StaffCasePanel } from "@/components/support/StaffCasePanel";
import { SupportCaseView } from "@/components/support/SupportCaseView";
import { useAuth } from "@/hooks/useAuth";
import { useIsSupportStaff, useSupportCase } from "@/hooks/useSupportCases";

export const Route = createFileRoute("/_authenticated/admin/support/$caseId")({
  component: StaffCaseRoute,
  head: () => ({
    meta: [
      { title: "Support case review · EarnRoom" },
      {
        name: "description",
        content: "Internal review of a EarnRoom booking support case, its evidence and outcome.",
      },
      { property: "og:title", content: "Support case review · EarnRoom" },
      { property: "og:description", content: "Internal review of a EarnRoom support case." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function StaffCaseRoute() {
  const { caseId } = Route.useParams();
  const { user, profile } = useAuth();
  const staff = useIsSupportStaff();
  const { data, isLoading, error } = useSupportCase(caseId);
  const mode = profile?.current_mode === "host" ? "host" : "renter";

  if (staff.isLoading) {
    return (
      <AppLayout mode={mode} title="Support case">
        <LoadingState label="Loading this case…" />
      </AppLayout>
    );
  }

  if (!staff.data) {
    return (
      <AppLayout mode={mode} title="Support case">
        <EmptyState
          title="You don't have access to this area"
          description="Case review is only available to EarnRoom support staff."
        />
      </AppLayout>
    );
  }

  return (
    <AppLayout mode={mode} title="Support case" description="Review, respond and resolve.">
      {isLoading ? (
        <LoadingState label="Loading this case…" />
      ) : null}

      {error ? <ErrorState description="We couldn't load this support case." /> : null}

      {data ? (
        <div className="space-y-6">
          <SupportCaseView kase={data} viewerId={user?.id ?? null} role={null} />
          <StaffCasePanel kase={data} />
          <Link to="/admin/support" className="type-body-sm text-primary underline underline-offset-4">
            Back to the queue
          </Link>
        </div>
      ) : null}
    </AppLayout>
  );
}
