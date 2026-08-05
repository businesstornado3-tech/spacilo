/**
 * Renders the packing plan FROZEN onto a request or booking.
 *
 * Nothing is recomputed here: a plan agreed in March must still read the same
 * in June, even after the engines change. Older rows created before plans were
 * captured simply render nothing.
 */
import { PackPlanView } from "@/components/spacefit/PackPlanView";
import { parsePlanSnapshot, type PlanSpaceSnapshot } from "@/lib/spacefit/plan";

/** Server-side geometry snapshot, used when the plan predates `space`. */
function spaceFromDimensions(value: unknown): PlanSpaceSnapshot {
  const row = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const num = (key: string) => (typeof row[key] === "number" ? (row[key] as number) : null);
  return {
    usableVolumeM3: num("estimated_available_volume_m3") ?? num("total_volume_m3"),
    floorAreaM2: num("floor_area_m2"),
    heightM: num("height_m"),
    doorWidthCm: num("door_width_cm"),
    doorHeightCm: num("door_height_cm"),
  };
}

export function SnapshotPackPlan({
  planSnapshot,
  dimensionsSnapshot,
  title = "Packing plan — agreed at request",
  intro,
  className,
}: {
  planSnapshot: unknown;
  dimensionsSnapshot?: unknown;
  title?: string;
  intro?: string;
  className?: string;
}) {
  const snapshot = parsePlanSnapshot(planSnapshot);
  if (!snapshot) return null;

  const space =
    snapshot.space?.floorAreaM2 || snapshot.space?.usableVolumeM3
      ? snapshot.space
      : spaceFromDimensions(dimensionsSnapshot);

  return (
    <PackPlanView
      plan={snapshot.plan}
      space={space}
      title={title}
      {...(intro ? { intro } : {})}
      {...(className ? { className } : {})}
    />
  );
}
