import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Check, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StepProgress } from "@/components/common/Progress";
import { Alert } from "@/components/common/Alert";
import { toast } from "@/components/overlay/toast";
import { useAuth } from "@/hooks/useAuth";
import { WIZARD_STEPS, availableVolume, floorArea, publicLocation, totalVolume } from "@/lib/spaces";
import {
  listSpacePhotos,
  publishSpace,
  signedPhotoUrls,
  updateSpace,
  type Space,
  type SpacePatch,
  type SpacePhoto,
} from "@/lib/spaces-api";
import {
  StepAccess,
  StepFeatures,
  StepPhotos,
  StepPrice,
  StepRules,
  StepSize,
  StepSpace,
} from "@/components/host/listing/steps";
import { ListingPreview, type ListingView } from "@/components/host/listing/ListingPreview";

const AUTOSAVE_MS = 1200;

/** Fields the client is allowed to send; host_id and derived capacity stay server-owned. */
function sanitise(patch: SpacePatch): SpacePatch {
  const { id: _id, host_id: _host, created_at: _c, updated_at: _u, published_at: _p, ...rest } = patch;
  return rest;
}

export function SpaceWizard({ space, initialPhotos }: { space: Space; initialPhotos: SpacePhoto[] }) {
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [form, setForm] = React.useState<SpacePatch>(() => sanitise(space as SpacePatch));
  const [photos, setPhotos] = React.useState<SpacePhoto[]>(initialPhotos);
  const [step, setStep] = React.useState(() => Math.min(Math.max(space.onboarding_step - 1, 0), 7));
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [publishing, setPublishing] = React.useState(false);
  const [published, setPublished] = React.useState(space.listing_status === "published");
  const [previewUrls, setPreviewUrls] = React.useState<string[]>([]);

  const pending = React.useRef<SpacePatch>({});
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = React.useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const patch = pending.current;
    pending.current = {};
    if (Object.keys(patch).length === 0) return true;
    setSaving(true);
    try {
      await updateSpace(space.id, patch);
      setError(null);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't save your progress.");
      return false;
    } finally {
      setSaving(false);
    }
  }, [space.id]);

  const patch = React.useCallback(
    (next: SpacePatch) => {
      const clean = sanitise(next);
      setForm((prev) => ({ ...prev, ...clean }));
      pending.current = { ...pending.current, ...clean };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), AUTOSAVE_MS);
    },
    [flush],
  );

  React.useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  // Signed URLs for the preview step.
  React.useEffect(() => {
    if (step !== 7) return;
    let active = true;
    void signedPhotoUrls(photos.map((p) => p.storage_path)).then((map) => {
      if (active) setPreviewUrls(photos.map((p) => map[p.storage_path]).filter(Boolean) as string[]);
    });
    return () => {
      active = false;
    };
  }, [step, photos]);

  const stepError = validateStep(step, form, photos);

  async function goTo(next: number) {
    pending.current = { ...pending.current, onboarding_step: next + 1 };
    await flush();
    setStep(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleContinue() {
    if (stepError) {
      toast.error("Almost there", stepError);
      return;
    }
    await goTo(Math.min(step + 1, 7));
  }

  async function handlePublish() {
    const problem = publishBlocker(form, photos);
    if (problem) {
      toast.error("Not ready to publish", problem);
      return;
    }
    setPublishing(true);
    const saved = await flush();
    if (!saved) {
      setPublishing(false);
      return;
    }
    try {
      await publishSpace(space.id);
      setPublished(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      toast.error("Couldn't publish", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setPublishing(false);
    }
  }

  const view = toListingView(form, previewUrls, profile?.display_name || profile?.first_name || "You", profile?.phone_verified ?? false);

  if (published) {
    return (
      <div className="mx-auto max-w-xl text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-success text-success-foreground">
          <Check className="size-7" aria-hidden="true" />
        </span>
        <h2 className="mt-5 type-h1">Your space is live.</h2>
        <p className="mt-2 type-body text-muted-foreground">
          You can edit or pause your listing anytime.
        </p>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button onClick={() => navigate({ to: "/spaces/$spaceId", params: { spaceId: space.id } })}>
            View my space
          </Button>
          <Button variant="secondary" onClick={() => navigate({ to: "/host" })}>
            Go to Host dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-28">
      <StepProgress steps={[...WIZARD_STEPS]} current={step} className="mb-8" />

      {error ? (
        <Alert tone="error" title="We couldn't save your progress" className="mb-6">
          {error} Your answers are still on screen — try continuing again.
        </Alert>
      ) : null}

      {step === 0 ? <StepSpace form={form} patch={patch} /> : null}
      {step === 1 ? <StepSize form={form} patch={patch} /> : null}
      {step === 2 ? (
        <StepPhotos
          form={form}
          patch={patch}
          spaceId={space.id}
          photos={photos}
          onPhotosChange={setPhotos}
        />
      ) : null}
      {step === 3 ? <StepFeatures form={form} patch={patch} /> : null}
      {step === 4 ? <StepAccess form={form} patch={patch} /> : null}
      {step === 5 ? <StepRules form={form} patch={patch} /> : null}
      {step === 6 ? <StepPrice form={form} patch={patch} /> : null}
      {step === 7 ? (
        <div>
          <h2 className="type-h2">Here's how renters will see it</h2>
          <p className="mt-2 mb-6 type-body text-muted-foreground">
            Check everything reads well before you publish.
          </p>
          <ListingPreview view={view} />
        </div>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 p-3 backdrop-blur md:bottom-0">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={() => void goTo(Math.max(step - 1, 0))}
            disabled={step === 0 || publishing}
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back
          </Button>
          <span className="type-body-sm text-muted-foreground" aria-live="polite">
            {saving ? "Saving…" : "Draft saved"}
          </span>
          <div className="ml-auto">
            {step === 7 ? (
              <Button type="button" size="lg" onClick={() => void handlePublish()} disabled={publishing}>
                {publishing ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                Publish my space
              </Button>
            ) : (
              <Button type="button" size="lg" onClick={() => void handleContinue()}>
                Continue
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- Validation */

function validateStep(step: number, form: SpacePatch, photos: SpacePhoto[]): string | null {
  if (step === 0) {
    if (!form.space_type) return "Choose the kind of space you're listing.";
    if (!form.title?.trim()) return "Give your space a name.";
    if (!form.storage_mode) return "Tell us whether you're offering the whole space or part of it.";
    if (form.storage_mode === "partial") {
      const pct = form.host_available_percentage ?? 0;
      if (pct < 1 || pct > 100) return "Availability must be between 1% and 100%.";
    }
  }
  if (step === 1) {
    if (!form.address_line1?.trim()) return "Add the first line of the address.";
    if (!form.town?.trim()) return "Add the town or city.";
    if (!form.postcode?.trim()) return "Add the postcode.";
  }
  if (step === 2) {
    if (photos.length === 0) return "Add at least one photo of your space.";
    if (!form.description?.trim()) return "Add a short description of your space.";
  }
  if (step === 4 && !form.access_type) return "Choose how renters can access their belongings.";
  if (step === 6 && !form.monthly_price_pence) return "Set a monthly price.";
  return null;
}

function publishBlocker(form: SpacePatch, photos: SpacePhoto[]): string | null {
  for (const step of [0, 1, 2, 4, 6]) {
    const problem = validateStep(step, form, photos);
    if (problem) return problem;
  }
  return null;
}

/* ------------------------------------------------------------ Preview map */

export function toListingView(
  form: SpacePatch,
  photoUrls: string[],
  hostName: string,
  hostPhoneVerified: boolean,
): ListingView {
  const dims = {
    length_m: form.length_m ?? null,
    width_m: form.width_m ?? null,
    height_m: form.height_m ?? null,
  };
  return {
    title: form.title ?? "",
    spaceType: form.space_type ?? null,
    description: form.description ?? "",
    location: publicLocation(form.approximate_area, form.postcode_district, form.postcode),
    pricePence: form.monthly_price_pence ?? null,
    minimumMonths: form.minimum_storage_period_months ?? 1,
    storageMode: form.storage_mode ?? null,
    hostAvailablePercentage: form.host_available_percentage ?? null,
    floorAreaM2: form.dimensions_unknown ? null : floorArea(dims),
    totalVolumeM3: form.dimensions_unknown ? null : totalVolume(dims),
    availableVolumeM3: form.dimensions_unknown
      ? null
      : availableVolume(dims, form.storage_mode ?? null, form.host_available_percentage ?? null),
    features: form.features ?? [],
    acceptedCategories: form.accepted_categories ?? [],
    restrictions: form.host_restrictions ?? [],
    restrictionNotes: form.restriction_notes ?? null,
    accessType: form.access_type ?? null,
    accessNotes: form.access_notes ?? null,
    accessFrequency: form.access_frequency ?? null,
    hostName,
    hostPhoneVerified,
    photoUrls,
  };
}

export { listSpacePhotos };
