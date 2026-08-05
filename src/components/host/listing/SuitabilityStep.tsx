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
import { useActivePolicy, useSaveSuitability, useSuitabilityProfile } from "@/hooks/usePolicy";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/components/overlay/toast";

export function SuitabilityStep({ spaceId }: { spaceId: string }) {
  const { data: profile } = useSuitabilityProfile(spaceId);
  const save = useSaveSuitability(spaceId);
  const { data: policy } = useActivePolicy();
  const { user } = useAuth();
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
          await save.mutateAsync({
            spaceId,
            hostId: user?.id ?? "",
            attributes: draft.attributes,
            notes: draft.notes,
            declarations: {
              authority: draft.authority,
              compliance: draft.compliance,
              accuracy: draft.accuracy,
            },
            policyVersionId: policy?.id ?? null,
          });
          setSaved(true);
        } catch {
          toast.error("Couldn't save", "Please try again.");
        }
      }}
    />
  );
}
