/**
 * InventoryPanel — "what are you storing?", wired to the shared planner state.
 *
 * The illustrated builder is unchanged; this panel adds the capability gate,
 * so a visitor sees a friendly allowance note while a renter has no ceiling.
 */
import { Lock } from "lucide-react";

import { InventoryBuilder } from "@/components/spaceplanner/InventoryBuilder";
import { useSpacePlanner } from "@/components/spaceplanner/SpacePlannerProvider";

export function InventoryPanel() {
  const { quantities, setQuantity, loadPreset, clear, capabilities, atItemLimit } =
    useSpacePlanner();
  const capped = Number.isFinite(capabilities.maxItemTypes);

  return (
    <div>
      <InventoryBuilder
        quantities={quantities}
        onChange={setQuantity}
        onPreset={(presetLines) => loadPreset(presetLines)}
        onClear={clear}
      />
      {capped && atItemLimit ? (
        <p className="mt-2 flex items-start gap-1.5 type-badge text-muted-foreground">
          <Lock className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          The preview plans up to {capabilities.maxItemTypes} kinds of belongings. Create a free
          account for unlimited inventories.
        </p>
      ) : null}
    </div>
  );
}
