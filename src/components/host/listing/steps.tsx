import { Sparkles } from "lucide-react";

import { Field, TextInput, TextArea, NativeSelect } from "@/components/form/Field";
import { Alert } from "@/components/common/Alert";
import { Badge } from "@/components/ui/badge";
import { PriceDisplay } from "@/components/marketplace/PriceDisplay";
import { PhotoManager } from "@/components/host/listing/PhotoManager";
import { ChipToggle, Fieldset, OptionRow, SelectableCard, StepHeading } from "@/components/host/listing/wizard-ui";
import type { SpacePatch, SpacePhoto } from "@/lib/spaces-api";
import {
  ACCESS_FREQUENCIES,
  ACCESS_TYPES,
  HOST_RESTRICTIONS,
  ITEM_CATEGORIES,
  MOISTURE_OPTIONS,
  PLATFORM_PROHIBITED_ITEMS,
  SPACE_FEATURES,
  SPACE_TYPES,
  STAY_UNITS,
  TEMPERATURE_OPTIONS,
  type StayUnit,
  availabilityLabel,
  availabilityProblem,
  formatStay,
  stayDays,
  stayParts,
  availableVolume,
  floorArea,
  formatM2,
  formatM3,
  totalVolume,
} from "@/lib/spaces";

export interface StepProps {
  form: SpacePatch;
  patch: (p: SpacePatch) => void;
  /** Present once the draft listing exists, which SpaceFit scanning needs. */
  spaceId?: string;
}

const toggle = (list: string[] | null | undefined, value: string) => {
  const current = list ?? [];
  return current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
};

const num = (value: string): number | null => {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

/* ------------------------------------------------------------- 1. Space */

export function StepSpace({ form, patch }: StepProps) {
  return (
    <div>
      <StepHeading title="What kind of space do you have?" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Space type">
        {SPACE_TYPES.map((type) => (
          <SelectableCard
            key={type.value}
            label={type.label}
            icon={type.icon}
            selected={form.space_type === type.value}
            onSelect={() => patch({ space_type: type.value })}
          />
        ))}
      </div>

      <Fieldset legend="Give your space a name" hint="Keep it simple. Renters will see this in search results.">
        <TextInput
          id="title"
          value={form.title ?? ""}
          maxLength={120}
          placeholder="Dry garage space in Southsea"
          onChange={(e) => patch({ title: e.target.value })}
        />
      </Fieldset>

      <Fieldset legend="How much of this space are you offering?">
        <div className="space-y-3" role="radiogroup" aria-label="How much of this space are you offering?">
          <OptionRow
            title="The whole space"
            description="The storage area is available for one or more bookings."
            selected={form.storage_mode === "whole"}
            onSelect={() => patch({ storage_mode: "whole", host_available_percentage: 100 })}
          />
          <OptionRow
            title="Part of the space"
            description="I already use some of this space and want to rent the unused part."
            selected={form.storage_mode === "partial"}
            onSelect={() =>
              patch({ storage_mode: "partial", host_available_percentage: form.host_available_percentage ?? 50 })
            }
          />
        </div>
      </Fieldset>

      {form.storage_mode === "partial" ? (
        <Fieldset legend="Approximately how much of the space is currently available?">
          <div className="flex flex-wrap gap-2">
            {[25, 50, 75].map((pct) => (
              <ChipToggle
                key={pct}
                label={`${pct}%`}
                selected={form.host_available_percentage === pct}
                onToggle={() => patch({ host_available_percentage: pct })}
              />
            ))}
          </div>
          <div className="mt-4 max-w-xs">
            <Field label="Or give a more accurate figure (%)" htmlFor="pct">
              <input
                id="pct"
                type="range"
                min={5}
                max={100}
                step={5}
                value={form.host_available_percentage ?? 50}
                onChange={(e) => patch({ host_available_percentage: Number(e.target.value) })}
                className="w-full accent-[var(--color-primary)]"
              />
              <p className="mt-1 type-body-sm tabular-nums text-muted-foreground">
                {form.host_available_percentage ?? 50}% available
              </p>
            </Field>
          </div>
          <p className="mt-3 type-body-sm text-muted-foreground">
            We'll introduce smarter space measurement later. For now, give us your best estimate.
          </p>
        </Fieldset>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------- 2. Size and location */

export function StepSize({ form, patch, spaceId }: StepProps) {
  const dims = {
    length_m: form.length_m ?? null,
    width_m: form.width_m ?? null,
    height_m: form.height_m ?? null,
  };
  const unknown = form.dimensions_unknown === true;
  const area = floorArea(dims);
  const volume = totalVolume(dims);
  const available = availableVolume(dims, form.storage_mode ?? null, form.host_available_percentage ?? null);

  return (
    <div>
      <StepHeading
        title="Help us understand the size."
        description="This helps us match your space with belongings that are more likely to fit."
      />

      <div className="grid grid-cols-3 gap-3">
        {(
          [
            ["length_m", "Length (m)"],
            ["width_m", "Width (m)"],
            ["height_m", "Height (m)"],
          ] as const
        ).map(([key, label]) => (
          <Field key={key} label={label} htmlFor={key}>
            <TextInput
              id={key}
              type="number"
              inputMode="decimal"
              min={0}
              step="0.1"
              disabled={unknown}
              value={form[key] === null || form[key] === undefined ? "" : String(form[key])}
              onChange={(e) => patch({ [key]: num(e.target.value) } as SpacePatch)}
            />
          </Field>
        ))}
      </div>

      <label className="mt-4 flex items-center gap-3 type-body-sm">
        <input
          type="checkbox"
          checked={unknown}
          onChange={(e) =>
            patch(
              e.target.checked
                ? { dimensions_unknown: true, length_m: null, width_m: null, height_m: null }
                : { dimensions_unknown: false },
            )
          }
          className="size-5 rounded-[6px] border border-input accent-primary"
        />
        I'm not sure
      </label>

      {!unknown && (area || volume) ? (
        <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Calc label="Floor area" value={formatM2(area)} />
          <Calc label="Approximate volume" value={formatM3(volume)} />
          {form.storage_mode === "partial" ? (
            <Calc label="Estimated available capacity" value={formatM3(available)} />
          ) : null}
        </dl>
      ) : null}

      <p className="mt-3 type-body-sm text-muted-foreground">
        These figures are estimates. Cubic volume alone doesn't confirm that a particular item will fit.
      </p>

      {spaceId ? (
        <div className="mt-5">
          <SpaceScanner
            spaceId={spaceId}
            onApplied={(values) =>
              patch({
                length_m: values.lengthM,
                width_m: values.widthM,
                height_m: values.heightM,
                dimensions_unknown: values.lengthM === null || values.widthM === null || values.heightM === null,
              })
            }
          />
        </div>
      ) : (
        <div className="mt-5 flex items-center gap-3 rounded-xl border border-dashed border-border-strong bg-card p-4">
          <Sparkles className="size-5 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <p className="type-label">Scan my space with SpaceFit AI</p>
            <p className="type-body-sm text-muted-foreground">
              Available as soon as your draft listing is saved.
            </p>
          </div>
        </div>
      )}

      <Fieldset legend="Where is your space?" hint="Your exact address won't be shown publicly.">
        <div className="space-y-4">
          <Field label="Address line 1" htmlFor="address_line1" required>
            <TextInput
              id="address_line1"
              autoComplete="address-line1"
              value={form.address_line1 ?? ""}
              onChange={(e) => patch({ address_line1: e.target.value })}
            />
          </Field>
          <Field label="Address line 2 (optional)" htmlFor="address_line2">
            <TextInput
              id="address_line2"
              autoComplete="address-line2"
              value={form.address_line2 ?? ""}
              onChange={(e) => patch({ address_line2: e.target.value })}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Town / City" htmlFor="town" required>
              <TextInput
                id="town"
                autoComplete="address-level2"
                value={form.town ?? ""}
                onChange={(e) => patch({ town: e.target.value })}
              />
            </Field>
            <Field label="Postcode" htmlFor="postcode" required>
              <TextInput
                id="postcode"
                autoComplete="postal-code"
                placeholder="PO4 8LB"
                value={form.postcode ?? ""}
                onChange={(e) => patch({ postcode: e.target.value.toUpperCase() })}
              />
            </Field>
          </div>
          <Field
            label="Public area label"
            htmlFor="approximate_area"
            hint="What renters will see, e.g. “Southsea, Portsmouth”."
          >
            <TextInput
              id="approximate_area"
              placeholder="Southsea, Portsmouth"
              value={form.approximate_area ?? ""}
              onChange={(e) => patch({ approximate_area: e.target.value })}
            />
          </Field>
        </div>
      </Fieldset>
    </div>
  );
}

function Calc({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <dt className="type-body-sm text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 type-h3 tabular-nums">{value}</dd>
    </div>
  );
}

/* ------------------------------------------------------------- 3. Photos */

export function StepPhotos({
  form,
  patch,
  spaceId,
  photos,
  onPhotosChange,
}: StepProps & { spaceId: string; photos: SpacePhoto[]; onPhotosChange: (p: SpacePhoto[]) => void }) {
  return (
    <div>
      <StepHeading
        title="Show renters your space."
        description="Good photos help renters understand your space."
      />
      <ul className="mb-5 grid gap-1 type-body-sm text-muted-foreground sm:grid-cols-2">
        <li>• Take a wide photo of the whole space</li>
        <li>• Show the entrance</li>
        <li>• Show the available area</li>
        <li>• Show any security features</li>
        <li>• Use good lighting</li>
      </ul>

      <PhotoManager spaceId={spaceId} photos={photos} onPhotosChange={onPhotosChange} />

      <Fieldset legend="Tell renters about your space." hint="Up to 2,000 characters.">
        <TextArea
          id="description"
          rows={6}
          maxLength={2000}
          value={form.description ?? ""}
          placeholder="Clean, dry garage with easy ground-floor access. Suitable for boxes, suitcases, bicycles and household items."
          onChange={(e) => patch({ description: e.target.value })}
        />
        <p className="mt-1 type-body-sm text-muted-foreground">
          {(form.description ?? "").length}/2000
        </p>
      </Fieldset>
    </div>
  );
}

/* ----------------------------------------------------------- 4. Features */

export function StepFeatures({ form, patch }: StepProps) {
  return (
    <div>
      <StepHeading title="What does your space offer?" description="Select everything that applies." />
      <div className="flex flex-wrap gap-2">
        {SPACE_FEATURES.map((feature) => (
          <ChipToggle
            key={feature.value}
            label={feature.label}
            selected={(form.features ?? []).includes(feature.value)}
            onToggle={() => patch({ features: toggle(form.features, feature.value) })}
          />
        ))}
      </div>
      <p className="mt-4 type-body-sm text-muted-foreground">
        These are host-declared. We don't independently verify them yet, and they're shown to renters as
        your description of the space.
      </p>

      <Fieldset legend="Which best describes the space?">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Temperature" htmlFor="temperature">
            <NativeSelect
              id="temperature"
              value={form.temperature_condition ?? "unknown"}
              onChange={(e) =>
                patch({ temperature_condition: e.target.value as NonNullable<SpacePatch["temperature_condition"]> })
              }
            >
              {TEMPERATURE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Moisture" htmlFor="moisture">
            <NativeSelect
              id="moisture"
              value={form.moisture_condition ?? "unknown"}
              onChange={(e) => patch({ moisture_condition: e.target.value as NonNullable<SpacePatch["moisture_condition"]> })}
            >
              {MOISTURE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>
        <p className="mt-3 type-body-sm text-muted-foreground">
          Specialist claims such as “climate controlled” aren't available until we can verify them.
        </p>
      </Fieldset>
    </div>
  );
}

/* ------------------------------------------------------------- 5. Access */

export function StepAccess({ form, patch }: StepProps) {
  return (
    <div>
      <StepHeading title="How can renters access their belongings?" />
      <div className="space-y-3" role="radiogroup" aria-label="Access type">
        {ACCESS_TYPES.map((option) => (
          <OptionRow
            key={option.value}
            title={option.label}
            description={option.description}
            selected={form.access_type === option.value}
            onSelect={() => patch({ access_type: option.value })}
          />
        ))}
      </div>

      <Fieldset legend="Access notes (optional)">
        <TextArea
          id="access_notes"
          rows={3}
          maxLength={500}
          placeholder="Usually available between 8am and 8pm with 24 hours' notice."
          value={form.access_notes ?? ""}
          onChange={(e) => patch({ access_notes: e.target.value })}
        />
      </Fieldset>

      <Fieldset legend="How often are you comfortable with access?">
        <div className="flex flex-wrap gap-2">
          {ACCESS_FREQUENCIES.map((option) => (
            <ChipToggle
              key={option.value}
              label={option.label}
              selected={form.access_frequency === option.value}
              onToggle={() => patch({ access_frequency: option.value })}
            />
          ))}
        </div>
      </Fieldset>

      <Fieldset legend="Getting in and out" hint="Optional, but it helps us avoid bad matches later.">
        <div className="space-y-3">
          <YesNo
            label="Ground-floor access?"
            value={form.ground_floor_access ?? null}
            onChange={(v) => patch({ ground_floor_access: v })}
          />
          <YesNo
            label="Stairs required?"
            value={form.stairs_required ?? null}
            onChange={(v) => patch({ stairs_required: v })}
          />
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
            <span className="type-body-sm">Lift available?</span>
            <div className="flex gap-2">
              {(["yes", "no", "not_applicable"] as const).map((v) => (
                <ChipToggle
                  key={v}
                  label={v === "not_applicable" ? "N/A" : v === "yes" ? "Yes" : "No"}
                  selected={form.lift_available === v}
                  onToggle={() => patch({ lift_available: v })}
                />
              ))}
            </div>
          </div>
          <YesNo
            label="Vehicle can stop close to the entrance?"
            value={form.vehicle_access_close ?? null}
            onChange={(v) => patch({ vehicle_access_close: v })}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Door width (cm)" htmlFor="door_width_cm">
              <TextInput
                id="door_width_cm"
                type="number"
                inputMode="decimal"
                min={0}
                step="1"
                value={form.door_width_cm === null || form.door_width_cm === undefined ? "" : String(form.door_width_cm)}
                onChange={(e) => patch({ door_width_cm: num(e.target.value) })}
              />
            </Field>
            <Field label="Door height (cm)" htmlFor="door_height_cm">
              <TextInput
                id="door_height_cm"
                type="number"
                inputMode="decimal"
                min={0}
                step="1"
                value={
                  form.door_height_cm === null || form.door_height_cm === undefined ? "" : String(form.door_height_cm)
                }
                onChange={(e) => patch({ door_height_cm: num(e.target.value) })}
              />
            </Field>
          </div>
        </div>
      </Fieldset>
    </div>
  );
}

function YesNo({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | null;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
      <span className="type-body-sm">{label}</span>
      <div className="flex gap-2">
        <ChipToggle label="Yes" selected={value === true} onToggle={() => onChange(true)} />
        <ChipToggle label="No" selected={value === false} onToggle={() => onChange(false)} />
      </div>
    </div>
  );
}

/* -------------------------------------------------------- 6. Storage rules */

export function StepRules({ form, patch }: StepProps) {
  return (
    <div>
      <StepHeading title="What are you happy to store?" />
      <div className="flex flex-wrap gap-2">
        {ITEM_CATEGORIES.map((category) => (
          <ChipToggle
            key={category.value}
            label={category.label}
            selected={(form.accepted_categories ?? []).includes(category.value)}
            onToggle={() => patch({ accepted_categories: toggle(form.accepted_categories, category.value) })}
          />
        ))}
      </div>

      <Fieldset legend="Anything you don't want stored?">
        <div className="flex flex-wrap gap-2">
          {HOST_RESTRICTIONS.map((restriction) => (
            <ChipToggle
              key={restriction.value}
              label={restriction.label}
              selected={(form.host_restrictions ?? []).includes(restriction.value)}
              onToggle={() => patch({ host_restrictions: toggle(form.host_restrictions, restriction.value) })}
            />
          ))}
        </div>
        <div className="mt-4">
          <TextArea
            id="restriction_notes"
            rows={3}
            maxLength={500}
            placeholder="Anything else renters should know before booking."
            value={form.restriction_notes ?? ""}
            onChange={(e) => patch({ restriction_notes: e.target.value })}
          />
        </div>
      </Fieldset>

      <Alert tone="warning" title="Prohibited items apply to every listing" className="mt-8">
        <p>
          Illegal, dangerous, hazardous, explosive, flammable and other prohibited items are not allowed
          anywhere on {""}
          the platform, and hosts can't opt back into them.
        </p>
        <ul className="mt-2 list-inside list-disc">
          {PLATFORM_PROHIBITED_ITEMS.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </Alert>

      <MinimumStayFieldset form={form} patch={patch} />

      <AvailabilityFieldset form={form} patch={patch} />
    </div>
  );
}

/* ------------------------------------------- minimum stay and availability */

/**
 * Minimum stay is stored in DAYS. Hosts pick a number and a unit, so a monthly
 * host and a weekend host describe the same field naturally.
 */
function MinimumStayFieldset({ form, patch }: StepProps) {
  const { count, unit } = stayParts(form.minimum_stay_days);
  const apply = (nextCount: number, nextUnit: StayUnit) => {
    const days = stayDays(nextCount, nextUnit);
    patch({
      minimum_stay_days: days,
      // Kept in step so older monthly-only surfaces stay truthful.
      minimum_storage_period_months: Math.max(1, Math.round(days / 30)),
    });
  };

  return (
    <Fieldset legend="What is the minimum booking you'll accept?">
      <div className="flex flex-wrap gap-2">
        {MINIMUM_STAY_PRESETS.map((preset) => (
          <ChipToggle
            key={preset.days}
            label={preset.label}
            selected={(form.minimum_stay_days ?? 1) === preset.days}
            onToggle={() => apply(preset.count, preset.unit)}
          />
        ))}
      </div>
      <div className="mt-4 flex max-w-sm items-end gap-3">
        <Field label="Custom minimum" htmlFor="min_stay_count">
          <TextInput
            id="min_stay_count"
            type="number"
            inputMode="numeric"
            min={1}
            max={365}
            value={count}
            onChange={(e) => apply(Math.min(365, Math.max(1, Number(e.target.value) || 1)), unit)}
          />
        </Field>
        <Field label="Unit" htmlFor="min_stay_unit">
          <NativeSelect
            id="min_stay_unit"
            value={unit}
            onChange={(e) => apply(count, e.target.value as StayUnit)}
          >
            {STAY_UNITS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <p className="mt-2 type-body-sm text-muted-foreground">
        Renters can't request a shorter stay than {formatStay(form.minimum_stay_days)}.
      </p>
    </Fieldset>
  );
}

const MINIMUM_STAY_PRESETS: { label: string; days: number; count: number; unit: StayUnit }[] = [
  { label: "1 day", days: 1, count: 1, unit: "day" },
  { label: "1 week", days: 7, count: 1, unit: "week" },
  { label: "1 month", days: 30, count: 1, unit: "month" },
  { label: "3 months", days: 90, count: 3, unit: "month" },
  { label: "6 months", days: 180, count: 6, unit: "month" },
];

/** Ongoing availability, or a fixed window the space is free between. */
function AvailabilityFieldset({ form, patch }: StepProps) {
  const mode = form.availability_mode ?? "continuous";
  const problem = availabilityProblem(form);

  return (
    <Fieldset legend="When is your space available?">
      <div className="grid gap-3 sm:grid-cols-2">
        <OptionRow
          title="Ongoing"
          description="Available continuously, with no end date."
          selected={mode === "continuous"}
          onSelect={() =>
            patch({ availability_mode: "continuous", available_from: null, available_until: null })
          }
        />
        <OptionRow
          title="Set dates only"
          description="Available between specific dates."
          selected={mode === "dates"}
          onSelect={() => patch({ availability_mode: "dates" })}
        />
      </div>

      {mode === "dates" ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Available from" htmlFor="available_from">
            <TextInput
              id="available_from"
              type="date"
              value={form.available_from ?? ""}
              onChange={(e) => patch({ available_from: e.target.value || null })}
            />
          </Field>
          <Field label="Available until" htmlFor="available_until">
            <TextInput
              id="available_until"
              type="date"
              value={form.available_until ?? ""}
              onChange={(e) => patch({ available_until: e.target.value || null })}
            />
          </Field>
        </div>
      ) : null}

      {problem ? (
        <Alert tone="warning" title="Check your availability dates" className="mt-4">
          <p>{problem}</p>
        </Alert>
      ) : (
        <p className="mt-3 type-body-sm text-muted-foreground">{availabilityLabel(form)}</p>
      )}
    </Fieldset>
  );
}

/* -------------------------------------------------------------- 7. Price */

const poundsValue = (pence: number | null | undefined) =>
  pence === null || pence === undefined ? "" : String(pence / 100);

const parsePounds = (value: string): number | null => {
  if (value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100);
};

export function StepPrice({ form, patch }: StepProps) {
  const pounds =
    form.monthly_price_pence === null || form.monthly_price_pence === undefined
      ? ""
      : String(form.monthly_price_pence / 100);

  return (
    <div>
      <StepHeading title="What would you like to earn?" description="You can change your price later." />

      <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
        <Field label="Monthly price" htmlFor="price" required>
          <div className="flex items-center gap-2">
            <span className="type-h2">£</span>
            <TextInput
              id="price"
              type="number"
              inputMode="decimal"
              min={0}
              step="1"
              className="max-w-40 text-xl"
              value={pounds}
              onChange={(e) => {
                const value = e.target.value;
                if (value === "") return patch({ monthly_price_pence: null });
                const parsed = Number(value);
                if (!Number.isFinite(parsed) || parsed < 0) return;
                patch({ monthly_price_pence: Math.round(parsed * 100) });
              }}
            />
            <span className="type-body text-muted-foreground">/month</span>
          </div>
        </Field>

        <div className="mt-5 grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
          <Field
            label="Daily price (optional)"
            htmlFor="price-daily"
            hint="Useful for short stays. Leave blank and we'll work one out from your monthly price."
          >
            <div className="flex items-center gap-2">
              <span className="type-body">£</span>
              <TextInput
                id="price-daily"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.5"
                className="max-w-32"
                value={poundsValue(form.daily_price_pence)}
                onChange={(e) => patch({ daily_price_pence: parsePounds(e.target.value) })}
              />
            </div>
          </Field>
          <Field
            label="Weekly price (optional)"
            htmlFor="price-weekly"
            hint="Renters are always charged the cheapest combination of your rates."
          >
            <div className="flex items-center gap-2">
              <span className="type-body">£</span>
              <TextInput
                id="price-weekly"
                type="number"
                inputMode="decimal"
                min={0}
                step="1"
                className="max-w-32"
                value={poundsValue(form.weekly_price_pence)}
                onChange={(e) => patch({ weekly_price_pence: parsePounds(e.target.value) })}
              />
            </div>
          </Field>
          <div className="type-body-sm text-muted-foreground sm:col-span-2">
            Minimum booking: {formatStay(form.minimum_stay_days)} — change this in the rules step.
          </div>
        </div>

        {form.monthly_price_pence ? (
          <div className="mt-5 border-t border-border pt-4">
            <p className="type-body-sm text-muted-foreground">Renters will see</p>
            <PriceDisplay amount={form.monthly_price_pence} size="lg" className="mt-1" />
          </div>
        ) : null}
      </div>

      <p className="mt-4 type-body-sm text-muted-foreground">
        Renters can book by the day, week or month. We always quote the cheapest combination of the
        rates you set, so a longer stay never costs more than a shorter one.
      </p>

      <p className="mt-2 type-body-sm text-muted-foreground">
        We don't have enough local market data yet to suggest an accurate price, so this is entirely your
        call. Anything shown as an “example estimate” elsewhere is illustrative only.
      </p>
    </div>
  );
}
