/**
 * DetectedInventory — everything Vision AI proposed, grouped so the items that
 * need a human look come first.
 */
import { Plus } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/form/Field";
import { DetectedObjectCard, type DetectedObjectActions } from "@/components/vision/DetectedObjectCard";
import { VisionConfidence } from "@/components/vision/VisionConfidence";
import { needsReview, summariseDetections, type DetectedObject } from "@/lib/vision";

export function DetectedInventory({
  objects,
  actions,
  onAdd,
}: {
  objects: DetectedObject[];
  actions: DetectedObjectActions;
  onAdd?: (label: string) => void;
}) {
  const [draft, setDraft] = React.useState("");
  const summary = React.useMemo(() => summariseDetections(objects), [objects]);
  const ordered = React.useMemo(
    () => [...objects].sort((a, b) => Number(needsReview(b)) - Number(needsReview(a))),
    [objects],
  );

  if (objects.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-card p-4 type-body-sm text-muted-foreground">
        Nothing detected yet. Add photos and run EarnRoom AI, or add items yourself.
      </p>
    );
  }

  return (
    <section aria-label="Detected belongings">
      <VisionConfidence summary={summary} />

      <ul className="mt-3 space-y-2">
        {ordered.map((object) => (
          <DetectedObjectCard
            key={object.id}
            object={object}
            actions={actions}
            mergeCandidates={objects.filter((other) => other.id !== object.id)}
          />
        ))}
      </ul>

      {onAdd ? (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!draft.trim()) return;
            onAdd(draft.trim());
            setDraft("");
          }}
        >
          <TextInput
            value={draft}
            aria-label="Add an item EarnRoom AI missed"
            placeholder="Add something we missed…"
            onChange={(event) => setDraft(event.target.value)}
          />
          <Button type="submit" variant="outline">
            <Plus aria-hidden="true" />
            Add
          </Button>
        </form>
      ) : null}
    </section>
  );
}

/** Alias kept for clarity at call sites that are explicitly editing. */
export const InventoryEditor = DetectedInventory;
