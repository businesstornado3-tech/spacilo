import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";


import { brand } from "@/config/brand";
import { AppLayout } from "@/components/layout/AppLayout";
import { ErrorState, LoadingState } from "@/components/common/States";
import { SpaceWizard } from "@/components/host/listing/SpaceWizard";
import { ListingQualityCard } from "@/components/host/listing/ListingQualityCard";
import { getMySpace, listSpacePhotos, type Space, type SpacePhoto } from "@/lib/spaces-api";
import { useSuitabilityProfile } from "@/hooks/usePolicy";

/** Completeness checklist. Suitability and declarations come from the profile. */
function QualityPanel({
  spaceId,
  space,
  photoPaths,
}: {
  spaceId: string;
  space: Space;
  photoPaths: string[];
}) {
  const { data: profile } = useSuitabilityProfile(spaceId);
  return (
    <ListingQualityCard
      space={{
        ...space,
        photo_paths: photoPaths,
        suitability_confirmed: Boolean(profile?.host_confirmed_at),
        declarations_complete: Boolean(
          profile?.declaration_authority && profile?.declaration_compliance && profile?.declaration_accuracy,
        ),
      }}
    />
  );
}

export const Route = createFileRoute("/_authenticated/host/spaces/$spaceId/edit")({
  head: () => ({
    meta: [
      { title: "Edit your space — Hosting — " + brand.name },
      { name: "description", content: "Update the details, photos, access and price for your storage space." },
      { property: "og:title", content: "Edit your space — Hosting — " + brand.name },
      { property: "og:description", content: "Update the details, photos, access and price for your storage space." },
    ],
  }),
  component: EditSpacePage,
});

function EditSpacePage() {
  const { spaceId } = Route.useParams();
  const [state, setState] = React.useState<
    { kind: "loading" } | { kind: "error" } | { kind: "ready"; space: Space; photos: SpacePhoto[] }
  >({ kind: "loading" });

  const load = React.useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const space = await getMySpace(spaceId);
      if (!space) return setState({ kind: "error" });
      setState({ kind: "ready", space, photos: await listSpacePhotos(spaceId) });
    } catch {
      setState({ kind: "error" });
    }
  }, [spaceId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  return (
    <AppLayout mode="host" title="Edit your space" description="Changes save as you go.">
      {state.kind === "loading" ? (
        <LoadingState label="Loading this space…" />
      ) : null}

      {state.kind === "error" ? (
        <ErrorState
          title="We couldn't open this listing"
          description="It may have been removed, or it belongs to another account."
          onRetry={() => void load()}
        />
      ) : null}

      {state.kind === "ready" ? (
        <div className="mx-auto max-w-3xl">
          <div className="mb-6">
            <QualityPanel
              spaceId={spaceId}
              space={state.space}
              photoPaths={state.photos.map((photo) => photo.storage_path)}
            />
          </div>
          <SpaceWizard space={state.space} initialPhotos={state.photos} />
        </div>
      ) : null}

    </AppLayout>
  );
}
