/**
 * Guest host preview — "Scan my space" without an account.
 *
 * Public route. AI proposes coarse measurements, the visitor corrects them, and
 * the shared deterministic capacity and pricing engines decide the numbers.
 * Nothing is saved, nothing is published, and nothing becomes verified.
 */
import { track } from "@/lib/analytics/tracker";
import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";

import { brand } from "@/config/brand";
import { MarketingLayout } from "@/components/layout/MarketingLayout";
import { Alert } from "@/components/common/Alert";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/form/Field";
import { SpaceFitAiMark } from "@/components/trust/SpaceFitAI";
import {
  GuestConversionCta,
  GuestDisclaimer,
  GuestPhotoPicker,
  GuestScanningState,
} from "@/components/spacefit/GuestScanShell";
import { useGuestSpaceFit } from "@/hooks/useGuestSpaceFit";
import {
  GUEST_HOST_VERIFICATION_NOTE,
  GUEST_SPACE_OUTCOME_COPY,
  guestSpacePreview,
  spaceMeasurementOutcome,
  type GuestSpaceProposal,
} from "@/lib/spacefit-guest/preview";

import { formatPrice } from "@/lib/format";
import { publicRouteMeta } from "@/lib/seo/meta";
import { breadcrumbJsonLd, jsonLdScript } from "@/lib/seo/structured-data";

const title = "Scan your space — " + brand.name;
const description =
  "See what your garage, loft or spare room could hold and earn. Scan it with EarnRoom AI — no account needed to try it.";

export const Route = createFileRoute("/spacefit/space")({
  head: () => ({
    ...publicRouteMeta({ title: title, description: description, path: "/spacefit/space" }),
    scripts: [
      jsonLdScript(
        breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: title, path: "/spacefit/space" },
        ]),
      ),
    ],
  }),
  component: GuestSpacePage,
});

const SPACE_TYPES = [
  { value: "garage", label: "Garage" },
  { value: "spare_room", label: "Spare room" },
  { value: "loft", label: "Loft" },
  { value: "shed", label: "Shed" },
  { value: "basement", label: "Basement" },
  { value: "outbuilding", label: "Outbuilding" },
  { value: "other", label: "Something else" },
];

const MANUAL_START: GuestSpaceProposal = {
  widthM: null,
  depthM: null,
  usableHeightM: null,
  confidence: "low",
  referenceUsed: null,
  obstacles: [],
  limitations: [],
  notes: null,
  spaceType: "garage",
};

function GuestSpacePage() {
  const scan = useGuestSpaceFit("host");
  const [spaceType, setSpaceType] = React.useState("garage");
  const proposal = scan.proposal;
  const setProposal = scan.setProposal;

  const setDimension = (key: "widthM" | "depthM" | "usableHeightM", raw: string) => {
    const parsed = Number(raw);
    setProposal((current) => {
      const base = current ?? { ...MANUAL_START, spaceType };
      return { ...base, [key]: Number.isFinite(parsed) && parsed > 0 ? parsed : null };
    });
  };

  const preview = React.useMemo(
    () => (proposal ? guestSpacePreview({ ...proposal, spaceType }) : null),
    [proposal, spaceType],
  );
  const outcome = spaceMeasurementOutcome(proposal);

  const viewed = React.useRef(false);
  React.useEffect(() => {
    if (!preview || viewed.current) return;
    viewed.current = true;
    track("guest_scan_result_viewed", { props: { kind: "space" } });
  }, [preview]);

  return (
    <MarketingLayout>
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <SpaceFitAiMark size="sm" />
        <h1 className="mt-3 type-h1">What could your unused space earn?</h1>
        <p className="mt-2 type-body text-muted-foreground">
          Photograph your garage, loft or spare room. EarnRoom AI will estimate its size — you
          correct it, and we&apos;ll show what it could hold and what it could earn. No account
          needed to try it.
        </p>

        <section className="mt-6 rounded-2xl border border-border bg-card p-5">
          <h2 className="type-h3">1. Your space</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {SPACE_TYPES.map((type) => (
              <Button
                key={type.value}
                type="button"
                size="sm"
                variant={spaceType === type.value ? "default" : "outline"}
                onClick={() => setSpaceType(type.value)}
              >
                {type.label}
              </Button>
            ))}
          </div>

          <div className="mt-5">
            <GuestPhotoPicker
              mode="host"
              images={scan.images}
              onAdd={(files) => void scan.addFiles(files)}
              onRemove={scan.removeImage}
              disabled={scan.analysing}
              onManualEntry={() => setProposal({ ...MANUAL_START, spaceType })}
              onBoundary={(measurement) => {
                // A drawn outline is a PROPOSAL: it pre-fills the fields the
                // visitor then checks. It never becomes a verified measurement.
                setProposal((current) => ({
                  ...(current ?? MANUAL_START),
                  spaceType,
                  widthM: measurement.widthM,
                  depthM: measurement.depthM,
                  usableHeightM:
                    measurement.volumeM3 && measurement.usableM2
                      ? Math.round((measurement.volumeM3 / measurement.usableM2) * 100) / 100
                      : (current?.usableHeightM ?? null),
                }));
              }}
            />
          </div>

          {scan.analysing ? (
            <GuestScanningState label="Measuring your space…" />
          ) : (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                disabled={scan.images.length === 0}
                onClick={() => void scan.analyse(spaceType)}
              >
                <Sparkles className="size-4" aria-hidden="true" />
                {proposal ? "Scan again" : "Scan my space"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setProposal({ ...MANUAL_START, spaceType })}
              >
                Enter measurements myself
              </Button>
            </div>
          )}

          {scan.error ? (
            <Alert tone="warning" className="mt-4" title="We couldn't finish that scan">
              {scan.error} You can enter the measurements yourself instead.
            </Alert>
          ) : null}
        </section>

        {proposal ? (
          <section className="mt-4 rounded-2xl border border-border bg-card p-5">
            <h2 className="type-h3">2. Check the measurements</h2>
            {outcome === "measured" ? (
              <p className="mt-1 type-body-sm text-muted-foreground">
                {proposal.referenceUsed
                  ? `EarnRoom AI used ${proposal.referenceUsed} for scale. `
                  : ""}
                {GUEST_SPACE_OUTCOME_COPY.measured.body}
              </p>
            ) : (
              <Alert
                tone={outcome === "partial" ? "warning" : "info"}
                className="mt-3"
                title={GUEST_SPACE_OUTCOME_COPY[outcome].title}
              >
                <span data-testid="guest-space-outcome-body">
                  {GUEST_SPACE_OUTCOME_COPY[outcome].body}
                </span>
                {GUEST_SPACE_OUTCOME_COPY[outcome].tip ? (
                  <span className="mt-2 block">{GUEST_SPACE_OUTCOME_COPY[outcome].tip}</span>
                ) : null}
                <span className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      scan.clearImages();
                      setProposal(null);
                    }}
                  >
                    Take another photo
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setProposal({ ...MANUAL_START, spaceType })}
                  >
                    Enter measurements manually
                  </Button>
                </span>
              </Alert>
            )}

            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <Field label="Width (m)" htmlFor="guest-width">
                <TextInput
                  id="guest-width"
                  inputMode="decimal"
                  value={proposal.widthM ?? ""}
                  onChange={(event) => setDimension("widthM", event.target.value)}
                />
              </Field>
              <Field label="Depth (m)" htmlFor="guest-depth">
                <TextInput
                  id="guest-depth"
                  inputMode="decimal"
                  value={proposal.depthM ?? ""}
                  onChange={(event) => setDimension("depthM", event.target.value)}
                />
              </Field>
              <Field label="Usable height (m)" htmlFor="guest-height">
                <TextInput
                  id="guest-height"
                  inputMode="decimal"
                  value={proposal.usableHeightM ?? ""}
                  onChange={(event) => setDimension("usableHeightM", event.target.value)}
                />
              </Field>
            </div>

            {proposal.obstacles.length > 0 ? (
              <div className="mt-4">
                <p className="type-label">What EarnRoom AI spotted in the way</p>
                <ul className="mt-2 grid gap-1.5">
                  {proposal.obstacles.map((obstacle, index) => (
                    <li
                      key={`${obstacle.kind}-${index}`}
                      className="type-body-sm text-muted-foreground"
                    >
                      {obstacle.label}
                      {obstacle.estimatedVolumeM3 ? ` · ~${obstacle.estimatedVolumeM3} m³` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        ) : null}

        {preview && preview.figures.usableVolumeM3 ? (
          <section className="mt-4 rounded-2xl border border-border bg-card p-5">
            <h2 className="type-h3">3. What it could hold and earn</h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-3">
              <div>
                <dt className="type-overline text-muted-foreground">Usable volume</dt>
                <dd className="mt-1 type-h2 tabular-nums">~{preview.figures.usableVolumeM3} m³</dd>
              </div>
              <div>
                <dt className="type-overline text-muted-foreground">Guide price</dt>
                <dd className="mt-1 type-h2 tabular-nums">
                  {preview.price.suggestedMonthlyPence
                    ? `${formatPrice(preview.price.suggestedMonthlyPence)}/mo`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="type-overline text-muted-foreground">Over 12 months</dt>
                <dd className="mt-1 type-h2 tabular-nums">
                  {preview.earnings.length > 0
                    ? formatPrice(preview.earnings[preview.earnings.length - 1]!.hostEarningsPence)
                    : "—"}
                </dd>
              </div>
            </dl>
            <p className="mt-4 type-body-sm text-muted-foreground">
              Guidance only, based on the size and type of space — not a promise of income, and not
              based on what other hosts charge. You always set your own price.
            </p>
          </section>
        ) : null}

        <GuestConversionCta
          mode="host"
          headline="Turn this into a real listing"
          body="Create a free account and we'll carry this scan into your listing — where you check the measurements against the real space before anything is verified or published."
          withheld={[
            "Creating and publishing a listing",
            "Verified measurements and receiving storage requests",
            "Messaging renters, bookings and host earnings",
          ]}
        />

        <Alert tone="info" className="mt-4" title="AI proposes, you verify">
          {GUEST_HOST_VERIFICATION_NOTE}
        </Alert>

        <GuestDisclaimer />
      </div>
    </MarketingLayout>
  );
}
