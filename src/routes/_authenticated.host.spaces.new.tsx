import * as React from "react";
import { track } from "@/lib/analytics/tracker";
import { createFileRoute, useNavigate } from "@tanstack/react-router";


import { brand } from "@/config/brand";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/common/States";
import { SpaceWizard } from "@/components/host/listing/SpaceWizard";
import { useAuth } from "@/hooks/useAuth";
import { createDraftSpace, getLatestDraft, listSpacePhotos, type Space, type SpacePhoto } from "@/lib/spaces-api";

export const Route = createFileRoute("/_authenticated/host/spaces/new")({
  head: () => ({
    meta: [
      { title: "List your space — Hosting — " + brand.name },
      { name: "description", content: "Add a garage, room, loft or shed and start earning from space you're not using." },
      { property: "og:title", content: "List your space — Hosting — " + brand.name },
      { property: "og:description", content: "Add a garage, room, loft or shed and start earning from space you're not using." },
    ],
  }),
  component: NewSpacePage,
});

type Phase =
  | { kind: "loading" }
  | { kind: "resume"; draft: Space }
  | { kind: "ready"; space: Space; photos: SpacePhoto[] }
  | { kind: "error" };

function NewSpacePage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [phase, setPhase] = React.useState<Phase>({ kind: "loading" });

  React.useEffect(() => {
    if (loading || !user) return;
    let active = true;
    void (async () => {
      try {
        const draft = await getLatestDraft();
        if (!active) return;
        if (draft) setPhase({ kind: "resume", draft });
        else await start(false);
      } catch {
        if (active) setPhase({ kind: "error" });
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user]);

  async function start(_fresh: boolean) {
    if (!user) return;
    setPhase({ kind: "loading" });
    try {
      const space = await createDraftSpace(user.id);
      track("host_listing_started", { props: { space_id: space.id } });
      setPhase({ kind: "ready", space, photos: [] });
    } catch {
      setPhase({ kind: "error" });
    }
  }

  async function resume(draft: Space) {
    setPhase({ kind: "loading" });
    try {
      setPhase({ kind: "ready", space: draft, photos: await listSpacePhotos(draft.id) });
    } catch {
      setPhase({ kind: "error" });
    }
  }

  return (
    <AppLayout
      mode="host"
      title="List your space"
      description="Eight quick steps. We save your progress as you go."
    >
      {phase.kind === "loading" ? (
        <LoadingState label="Preparing the listing builder…" />
      ) : null}

      {phase.kind === "error" ? (
        <ErrorState
          title="We couldn't start your listing"
          description="Please check your connection and try again."
          onRetry={() => void start(true)}
        />
      ) : null}

      {phase.kind === "resume" ? (
        <div className="max-w-lg rounded-2xl border border-border bg-card p-6 shadow-card">
          <h2 className="type-h3">Continue your listing</h2>
          <p className="mt-2 type-body-sm text-muted-foreground">
            You started {phase.draft.title?.trim() ? `“${phase.draft.title.trim()}”` : "a listing"} and
            haven't published it yet. Pick up where you left off.
          </p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <Button onClick={() => void resume(phase.draft)}>Continue</Button>
            <Button variant="secondary" onClick={() => void start(true)}>
              Start another space
            </Button>
            <Button variant="ghost" onClick={() => navigate({ to: "/host/spaces" })}>
              Back to my spaces
            </Button>
          </div>
        </div>
      ) : null}

      {phase.kind === "ready" ? (
        <div className="mx-auto max-w-3xl">
          <SpaceWizard space={phase.space} initialPhotos={phase.photos} />
        </div>
      ) : null}
    </AppLayout>
  );
}
