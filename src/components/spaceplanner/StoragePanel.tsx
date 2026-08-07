/**
 * StoragePanel — "where might it go?", wired to the shared planner state.
 */
import { StorageSelector } from "@/components/spaceplanner/StorageSelector";
import { useSpacePlanner } from "@/components/spaceplanner/SpacePlannerProvider";

export function StoragePanel() {
  const { space, setSpace } = useSpacePlanner();
  return <StorageSelector selectedId={space.id} onSelect={setSpace} />;
}
