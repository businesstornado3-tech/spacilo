/**
 * SpaceFit AI — host space scanner.
 *
 * Photograph a space, get a PROPOSED set of measurements and obstacles, then
 * check and confirm them. Nothing reaches the listing until the host presses
 * "Use these measurements", and every figure stays editable up to that moment.
 *
 * Scan photos are private to the host and never appear on the public listing.
 */
import * as React from "react";
import { Camera, ImagePlus, Loader2, Ruler, Sparkles, Trash2 } from "lucide-react";

import { Alert } from "@/components/common/Alert";
import { Field, TextInput } from "@/components/form/Field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HostSpaceCapture } from "@/components/spacefit/live/HostSpaceCapture";
import { toast } from "@/components/overlay/toast";
import type { BoundaryMeasurement } from "@/lib/livescan/boundary-scale";
import {
  applySpaceMeasurementProposal,
  CONFIDENCE_LABEL,
  deleteScanPhoto,
  dismissProposal,
  latestProposal,
  listScanPhotos,
  MAX_SPACE_SCAN_PHOTOS,
  signedScanUrls,
  type ConfirmedObstacle,
  type SpaceMeasurementProposal,
  type SpaceScanPhoto,
  uploadScanPhoto,
} from "@/lib/space-scan-api";
import { scanSpacePhotos } from "@/lib/spacefit-space.functions";
import {
  OBSTACLE_LABELS,
  SCAN_LIMITATION_LABELS,
  SPACE_SCAN_DISCLAIMER,
  type ObstacleKind,
} from "@/lib/spacefit-vision/space-schema";

const CAPTURE_TIPS = [
  "Stand in the doorway and photograph the whole space",
  "Include the doorway itself — it gives us a size reference",
  "Add a second photo from the opposite corner",
  "Turn the lights on and move anything blocking the walls",
];

export function SpaceScanner({
  spaceId,
  onApplied,
}: {
  spaceId: string;
  /** Called with host-confirmed values so the wizard form stays in sync. */
  onApplied?: (values: {
    lengthM: number | null;
    widthM: number | null;
    heightM: number | null;
  }) => void;
}) {
  const cameraRef = React.useRef<HTMLInputElement>(null);
  const uploadRef = React.useRef<HTMLInputElement>(null);

  const [photos, setPhotos] = React.useState<SpaceScanPhoto[]>([]);
  const [urls, setUrls] = React.useState<Record<string, string>>({});
  const [proposal, setProposal] = React.useState<SpaceMeasurementProposal | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [scanning, setScanning] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  /** Manual measurement entry — the host must never be trapped in drawing. */
  const [manualOpen, setManualOpen] = React.useState(false);


  const refresh = React.useCallback(async () => {
    const [list, current] = await Promise.all([listScanPhotos(spaceId), latestProposal(spaceId)]);
    setPhotos(list);
    setProposal(current && current.verification_state === "proposed" ? current : null);
  }, [spaceId]);

  React.useEffect(() => {
    void refresh().catch(() => setError("We couldn't load your scan."));
  }, [refresh]);

  React.useEffect(() => {
    const missing = photos.map((photo) => photo.storage_path).filter((path) => !urls[path]);
    if (missing.length === 0) return;
    let active = true;
    void signedScanUrls(missing).then((map) => {
      if (active) setUrls((prev) => ({ ...prev, ...map }));
    });
    return () => {
      active = false;
    };
  }, [photos, urls]);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    const files = Array.from(fileList).slice(0, MAX_SPACE_SCAN_PHOTOS - photos.length);
    setBusy(true);
    setError(null);
    try {
      for (const file of files) await uploadScanPhoto(spaceId, file);
      await refresh();
    } catch (uploadError) {
      toast.error(
        "Couldn't add that photo",
        uploadError instanceof Error ? uploadError.message : "Please try again.",
      );
    } finally {
      setBusy(false);
      if (cameraRef.current) cameraRef.current.value = "";
      if (uploadRef.current) uploadRef.current.value = "";
    }
  }

  async function remove(photo: SpaceScanPhoto) {
    setBusy(true);
    try {
      await deleteScanPhoto(photo);
      await refresh();
    } catch {
      toast.error("Couldn't remove that photo");
    } finally {
      setBusy(false);
    }
  }

  async function runScan() {
    if (photos.length === 0) return;
    setScanning(true);
    setError(null);
    try {
      const result = await scanSpacePhotos({
        data: {
          spaceId,
          photoIds: photos.slice(0, MAX_SPACE_SCAN_PHOTOS).map((photo) => photo.id),
          clientRequestId: crypto.randomUUID(),
        },
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      await refresh();
    } catch {
      setError("SpaceFit AI isn't available right now. Please try again shortly.");
    } finally {
      setScanning(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
      <header className="flex flex-wrap items-center gap-3">
        <Sparkles className="size-5 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0">
          <h3 className="type-h3">Scan my space with SpaceFit AI</h3>
          <p className="type-body-sm text-muted-foreground">
            Photograph your space and we'll suggest measurements for you to check.
          </p>
        </div>
        <Badge variant="neutral" className="ml-auto">
          Optional
        </Badge>
      </header>

      <ul className="mt-4 grid gap-1 type-body-sm text-muted-foreground sm:grid-cols-2">
        {CAPTURE_TIPS.map((tip) => (
          <li key={tip}>• {tip}</li>
        ))}
      </ul>

      {photos.length > 0 ? (
        <ul className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {photos.map((photo) => (
            <li
              key={photo.id}
              className="relative overflow-hidden rounded-xl border border-border bg-muted"
            >
              <div className="aspect-4/3">
                {urls[photo.storage_path] ? (
                  <img
                    src={urls[photo.storage_path]}
                    alt="Photo of your space, used only for measuring"
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="grid size-full place-items-center">
                    <Loader2
                      className="size-4 animate-spin text-muted-foreground"
                      aria-hidden="true"
                    />
                  </div>
                )}
              </div>
              <button
                type="button"
                aria-label="Remove this scan photo"
                onClick={() => void remove(photo)}
                disabled={busy || scanning}
                className="absolute right-1 top-1 grid size-8 place-items-center rounded-lg bg-background/90 text-destructive transition-colors hover:bg-background disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {/* Live Scan helps frame the shot; the captured photo enters the
          existing secure host analysis pipeline unchanged. The frozen frame
          then powers the boundary editor, with the camera already released. */}
      {photos.length < MAX_SPACE_SCAN_PHOTOS ? (
        <HostSpaceCapture
          className="mt-4"
          onManualEntry={() => setManualOpen(true)}
          onCaptured={async (file: File) => {
            setBusy(true);
            try {
              await uploadScanPhoto(spaceId, file);
              await refresh();
            } catch {
              toast.error("Couldn't add that photo");
            } finally {
              setBusy(false);
            }
          }}
          onMeasured={(measurement: BoundaryMeasurement) => {
            onApplied?.({
              lengthM: measurement.depthM,
              widthM: measurement.widthM,
              heightM:
                measurement.volumeM3 && measurement.usableM2
                  ? Math.round((measurement.volumeM3 / measurement.usableM2) * 100) / 100
                  : null,
            });
            toast.success(
              "Outline saved",
              "We've used your outline as an estimate — check it against the real space.",
            );
          }}
        />
      ) : null}



      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={() => cameraRef.current?.click()}
          disabled={busy || scanning || photos.length >= MAX_SPACE_SCAN_PHOTOS}
        >
          <Camera className="size-4" aria-hidden="true" />
          Take a photo
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => uploadRef.current?.click()}
          disabled={busy || scanning || photos.length >= MAX_SPACE_SCAN_PHOTOS}
        >
          <ImagePlus className="size-4" aria-hidden="true" />
          Upload
        </Button>
        <Button
          type="button"
          onClick={() => void runScan()}
          disabled={photos.length === 0 || busy || scanning}
        >
          {scanning ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Ruler className="size-4" aria-hidden="true" />
          )}
          {scanning ? "Scanning…" : "Scan my space"}
        </Button>
      </div>

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(event) => void handleFiles(event.target.files)}
      />
      <input
        ref={uploadRef}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        onChange={(event) => void handleFiles(event.target.files)}
      />

      <p className="mt-3 type-body-sm text-muted-foreground">
        {photos.length} of {MAX_SPACE_SCAN_PHOTOS} scan photos. These stay private and never appear
        on your listing.
      </p>

      {error ? (
        <Alert tone="warning" title="Scan unavailable" className="mt-4">
          {error}
        </Alert>
      ) : null}

      {proposal ? (
        <ProposalReview
          proposal={proposal}
          onCancel={async () => {
            await dismissProposal(proposal.id);
            setProposal(null);
          }}
          onConfirm={async (values) => {
            await applySpaceMeasurementProposal({
              spaceId,
              proposalId: proposal.id,
              ...values,
            });
            setProposal(null);
            onApplied?.({
              lengthM: values.lengthM,
              widthM: values.widthM,
              heightM: values.heightM,
            });
            toast.success("Measurements saved", "Your listing now shows your confirmed figures.");
          }}
        />
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------- review step */

interface ConfirmValues {
  lengthM: number | null;
  widthM: number | null;
  heightM: number | null;
  obstacles: ConfirmedObstacle[];
}

function ProposalReview({
  proposal,
  onConfirm,
  onCancel,
}: {
  proposal: SpaceMeasurementProposal;
  onConfirm: (values: ConfirmValues) => Promise<void>;
  onCancel: () => Promise<void>;
}) {
  // Pre-filled from the proposal, but the host owns every value from here on.
  const [length, setLength] = React.useState(numText(proposal.depth_m));
  const [width, setWidth] = React.useState(numText(proposal.width_m));
  const [height, setHeight] = React.useState(numText(proposal.usable_height_m));
  const [obstacles, setObstacles] = React.useState<ConfirmedObstacle[]>(() =>
    parseObstacles(proposal.proposed_obstacles).map((obstacle) => ({ ...obstacle })),
  );
  const [accepted, setAccepted] = React.useState<boolean[]>(() =>
    parseObstacles(proposal.proposed_obstacles).map(() => true),
  );
  const [saving, setSaving] = React.useState(false);

  const limitations = Array.isArray(proposal.limitations) ? (proposal.limitations as string[]) : [];

  const volume =
    toNum(length) && toNum(width) && toNum(height)
      ? Math.round(toNum(length)! * toNum(width)! * toNum(height)! * 100) / 100
      : null;
  const obstacleVolume = obstacles.reduce(
    (total, obstacle, index) => total + (accepted[index] ? obstacle.volume_m3 : 0),
    0,
  );

  return (
    <div className="mt-5 rounded-2xl border border-primary/30 bg-primary/5 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="type-h3">Check these figures</h4>
        <Badge variant="neutral">
          {CONFIDENCE_LABEL[proposal.confidence] ?? proposal.confidence}
        </Badge>
      </div>
      <p className="mt-1 type-body-sm text-muted-foreground">{SPACE_SCAN_DISCLAIMER}</p>

      {proposal.confidence === "low" ? (
        <Alert tone="warning" title="Please double-check these" className="mt-4">
          These estimates are low confidence. Measure your space properly before publishing.
        </Alert>
      ) : null}

      {limitations.length > 0 ? (
        <ul className="mt-4 grid gap-1 type-body-sm text-muted-foreground">
          {limitations.map((limitation) => (
            <li key={limitation}>
              •{" "}
              {SCAN_LIMITATION_LABELS[limitation as keyof typeof SCAN_LIMITATION_LABELS] ??
                limitation}
            </li>
          ))}
        </ul>
      ) : null}

      {proposal.notes ? (
        <p className="mt-3 type-body-sm text-muted-foreground">{proposal.notes}</p>
      ) : null}

      <div className="mt-5 grid grid-cols-3 gap-3">
        <Field label="Length (m)" htmlFor="scan-length">
          <TextInput
            id="scan-length"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.1"
            value={length}
            onChange={(e) => setLength(e.target.value)}
          />
        </Field>
        <Field label="Width (m)" htmlFor="scan-width">
          <TextInput
            id="scan-width"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.1"
            value={width}
            onChange={(e) => setWidth(e.target.value)}
          />
        </Field>
        <Field label="Usable height (m)" htmlFor="scan-height">
          <TextInput
            id="scan-height"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.1"
            value={height}
            onChange={(e) => setHeight(e.target.value)}
          />
        </Field>
      </div>

      {volume !== null ? (
        <p className="mt-3 type-body-sm">
          That's about <strong className="tabular-nums">{volume} m³</strong> in total
          {obstacleVolume > 0 ? (
            <>
              , or{" "}
              <strong className="tabular-nums">
                {Math.max(Math.round((volume - obstacleVolume) * 100) / 100, 0)} m³
              </strong>{" "}
              once the obstacles below are taken off
            </>
          ) : null}
          .
        </p>
      ) : null}

      {obstacles.length > 0 ? (
        <fieldset className="mt-5">
          <legend className="type-label">Anything permanently taking up room?</legend>
          <p className="mt-1 type-body-sm text-muted-foreground">
            Untick anything that isn't there. We'll reduce your usable capacity by what's left.
          </p>
          <ul className="mt-3 space-y-2">
            {obstacles.map((obstacle, index) => (
              <li
                key={`${obstacle.key}-${index}`}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3"
              >
                <label className="flex flex-1 items-center gap-3 type-body-sm">
                  <input
                    type="checkbox"
                    checked={accepted[index] ?? false}
                    onChange={(event) =>
                      setAccepted((prev) =>
                        prev.map((value, i) => (i === index ? event.target.checked : value)),
                      )
                    }
                    className="size-5 rounded-[6px] border border-input accent-primary"
                  />
                  {obstacle.label}
                </label>
                <label className="flex items-center gap-2 type-body-sm text-muted-foreground">
                  <span className="sr-only">Volume in cubic metres for {obstacle.label}</span>
                  <TextInput
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.1"
                    className="max-w-24"
                    value={String(obstacle.volume_m3)}
                    onChange={(event) =>
                      setObstacles((prev) =>
                        prev.map((value, i) =>
                          i === index
                            ? { ...value, volume_m3: Math.max(0, Number(event.target.value) || 0) }
                            : value,
                        ),
                      )
                    }
                  />
                  m³
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            try {
              await onConfirm({
                lengthM: toNum(length),
                widthM: toNum(width),
                heightM: toNum(height),
                obstacles: obstacles.filter((_, index) => accepted[index]),
              });
            } catch {
              toast.error("Couldn't save those measurements", "Please try again.");
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          Use these measurements
        </Button>
        <Button type="button" variant="ghost" disabled={saving} onClick={() => void onCancel()}>
          Discard — I'll measure myself
        </Button>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- helpers */

function numText(value: number | string | null) {
  if (value === null || value === undefined) return "";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(parsed) : "";
}

function toNum(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseObstacles(raw: unknown): ConfirmedObstacle[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 20).flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const record = entry as Record<string, unknown>;
    const kind = String(record["kind"] ?? record["key"] ?? "other") as ObstacleKind;
    const label =
      typeof record["label"] === "string" && record["label"].trim()
        ? record["label"].trim()
        : (OBSTACLE_LABELS[kind] ?? "Something else");
    const volume = Number(record["estimated_volume_m3"] ?? record["volume_m3"] ?? 0);
    return [{ key: kind, label, volume_m3: Number.isFinite(volume) && volume > 0 ? volume : 0 }];
  });
}
