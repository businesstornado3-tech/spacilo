/**
 * The suitability half of the wizard's rules step: the host describes the
 * space honestly and makes their three declarations before publishing.
 */
import * as React from "react";

import {
  SpaceSuitabilityForm,
  draftFromProfile,
  type SuitabilityDraft,
} from "@/components/policy/SpaceSuitabilityForm";
import { useSaveSuitability, useSuitabilityProfile } from "@/hooks/usePolicy";
import { toast } from "@/components/overlay/toast";

export function SuitabilityStep({ spaceId }: { spaceId: string }) {
  const { data: profile } = useSuitabilityProfile(spaceId);
  const save = useSaveSuitability(spaceId);
  const [draft, setDraft] = React.useState<SuitabilityDraft>(() => draftFromProfile(null));
  const [saved, setSaved] = React.useState(false);
  const loaded = React.useRef(false);

  React.useEffect(() => {
    if (profile && !loaded.current) {
      loaded.current = true;
      setDraft(draftFromProfile(profile));
    }
  }, [profile]);

  return (
    <SpaceSuitabilityForm
      value={draft}
      onChange={(next) => {
        setSaved(false);
        setDraft(next);
      }}
      saving={save.isPending}
      saved={saved}
      onSave={async () => {
        try {
          await save.mutateAsync(draft);
          setSaved(true);
        } catch {
          toast.error("Couldn't save", "Please try again.");
        }
      }}
    />
  );
}
