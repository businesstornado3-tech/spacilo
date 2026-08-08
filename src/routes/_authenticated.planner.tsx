/**
 * The planner workspace — saved inventories, recent plans and plan history.
 *
 * This is the user's personal storage planning space. It reuses the shared
 * SpacePlanner foundation exactly as the homepage does: the same provider, the
 * same panels, the same engine. Only persistence is added on top, behind the
 * repository, so signing this into the database later changes nothing here.
 */
import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { brand } from "@/config/brand";
import { AppLayout } from "@/components/layout/AppLayout";
import { CoachMark } from "@/components/onboarding/CoachMark";
import { Alert } from "@/components/common/Alert";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { usePlanRuns, usePlannerInventories, usePlannerLibraryMutations } from "@/hooks/usePlannerLibrary";
import { InventoryLibrary } from "@/components/spaceplanner/library/InventoryLibrary";
import { RecentPlans } from "@/components/spaceplanner/library/RecentPlans";
import { PlanHistory } from "@/components/spaceplanner/library/PlanHistory";
import { ContinuePlanningCard } from "@/components/spaceplanner/library/ContinuePlanningCard";
import { PlannerPersistence } from "@/components/spaceplanner/library/PlannerPersistence";
import { SpacePlannerProvider } from "@/components/spaceplanner/SpacePlannerProvider";
import { InventoryPanel } from "@/components/spaceplanner/InventoryPanel";
import { StoragePanel } from "@/components/spaceplanner/StoragePanel";
import { AIProgressPanel } from "@/components/spaceplanner/AIProgressPanel";
import { PlannerCanvas } from "@/components/spaceplanner/PlannerCanvas";
import { RecommendationPanel } from "@/components/spaceplanner/RecommendationPanel";
import { PlannerToolbar } from "@/components/spaceplanner/PlannerToolbar";
import {
  continuePlanning,
  spaceFor,
  toQuantities,
  type PlanRun,
  type SavedInventory,
} from "@/lib/spaceplanner/library";

const title = "My planner — " + brand.name;
const description =
  "Save unlimited inventories, reopen any plan and see every Spacilo AI optimisation you have run.";

export const Route = createFileRoute("/_authenticated/planner")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PlannerWorkspacePage,
});

function PlannerWorkspacePage() {
  const { mode } = useAuth();
  const { data: inventories, isLoading } = usePlannerInventories();
  const { data: runs } = usePlanRuns();
  const actions = usePlannerLibraryMutations();
  const [openId, setOpenId] = React.useState<string | null>(null);

  const all = inventories ?? [];
  const open = all.find((inventory) => inventory.id === openId) ?? null;
  const resume = continuePlanning(all);

  const handleOpen = (inventory: SavedInventory) => {
    setOpenId(inventory.id);
    actions.open.mutate(inventory.id);
  };

  return (
    <AppLayout
      mode={mode === "host" ? "host" : "renter"}
      title="My planner"
      description="Your saved inventories and every plan Spacilo AI has run for you."
    >
      <CoachMark id="planner" className="mb-4" />
      {open ? (
        <PlannerWorkspace
          inventory={open}
          runs={runs ?? []}
          onBack={() => setOpenId(null)}
          mode={mode === "host" ? "host" : "renter"}
        />
      ) : (
        <div className="grid gap-8">
          {resume ? <ContinuePlanningCard inventory={resume} onOpen={handleOpen} /> : null}

          <RecentPlans inventories={all} onOpen={handleOpen} />

          <InventoryLibrary
            inventories={all}
            loading={isLoading}
            onOpen={handleOpen}
            onCreate={(input) => actions.create.mutate(input)}
            onRename={(id, name, desc) => actions.rename.mutate({ id, name, description: desc })}
            onDuplicate={(id) => actions.duplicate.mutate(id)}
            onArchive={(id) => actions.archive.mutate(id)}
            onRestore={(id) => actions.restore.mutate(id)}
            onDelete={(id) => actions.remove.mutate(id)}
          />

          <PlanHistory runs={runs ?? []} />

          <Alert tone="info" title="Estimates, not guarantees">
            Volumes, weights and fit scores are Spacilo AI estimates from typical household sizes.
            Check the real space before you book.
          </Alert>
        </div>
      )}
    </AppLayout>
  );
}

function PlannerWorkspace({
  inventory,
  runs,
  onBack,
  mode,
}: {
  inventory: SavedInventory;
  runs: PlanRun[];
  onBack: () => void;
  mode: "renter" | "host";
}) {
  return (
    <SpacePlannerProvider
      key={inventory.id}
      mode={mode}
      initialSpace={spaceFor(inventory)}
      initialQuantities={toQuantities(inventory.lines)}
    >
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="size-4" aria-hidden="true" />
            All inventories
          </Button>
          <h2 className="type-h3 text-base">{inventory.name}</h2>
        </div>

        <PlannerPersistence inventory={inventory} />

        <div className="grid gap-4 lg:grid-cols-2">
          <InventoryPanel />
          <StoragePanel />
        </div>

        <PlannerToolbar />
        <AIProgressPanel />
        <PlannerCanvas />
        <RecommendationPanel />

        <PlanHistory runs={runs} inventoryId={inventory.id} limit={5} />
      </div>
    </SpacePlannerProvider>
  );
}
