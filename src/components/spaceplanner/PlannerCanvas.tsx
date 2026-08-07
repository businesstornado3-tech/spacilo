/**
 * PlannerCanvas — the room, whatever the surface.
 *
 * Reads the shared plan and renders the unplanned or optimised layout. The
 * renderer stays behind this component so a 3D or AR renderer can replace the
 * SVG scene later without touching any page.
 */
import { LayoutSimulation } from "@/components/spaceplanner/LayoutSimulation";
import { PlanScene } from "@/components/spaceplanner/PlanScene";
import { useSpacePlanner } from "@/components/spaceplanner/SpacePlannerProvider";

export interface PlannerCanvasProps {
  /** "before" shows the unplanned load, "after" the optimised plan. */
  view?: "before" | "after";
  interactive?: boolean;
  className?: string;
}

export function PlannerCanvas({
  view = "after",
  interactive = true,
  className,
}: PlannerCanvasProps) {
  const { plan, space, addOne } = useSpacePlanner();
  if (!plan) return null;

  if (view === "before") {
    return (
      <LayoutSimulation
        space={space}
        pack={plan.before}
        animate={false}
        showLabels={false}
        {...(className ? { className } : {})}
        title="Unplanned — everything loaded as it arrives"
      />
    );
  }

  return (
    <PlanScene
      space={space}
      pack={plan.after}
      from={plan.before}
      explain={interactive}
      {...(interactive ? { onAdd: addOne } : {})}
      {...(className ? { className } : {})}
      label={`Optimised plan view of the ${space.name.toLowerCase()}`}
    />
  );
}
