/**
 * Publishing mode — the single source of truth for autonomous publishing.
 *
 * Two separate founder settings live here and nowhere else: whether EarnRoom
 * may publish on its own, and whether it may approve a campaign that passed
 * every mandatory validation check. The daily limit shown here counts only
 * confirmed autonomous publications; it never limits video generation, manual
 * approval or manual publishing.
 */
import * as React from "react";

import { Alert } from "@/components/common/Alert";
import type { useMarketingStudio } from "@/hooks/useMarketingStudio";

const LIMIT_CHOICES = [5, 10, 20, 50, 100] as const;

function Toggle({
  on,
  label,
  busy,
  onClick,
}: {
  on: boolean;
  label: string;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="type-body-sm font-semibold">{label}</span>
      <button
        type="button"
        disabled={busy}
        aria-pressed={on}
        onClick={onClick}
        className={
          on
            ? "min-h-11 rounded-lg bg-primary px-4 type-nav font-semibold text-primary-foreground disabled:opacity-60"
            : "min-h-11 rounded-lg border border-border px-4 type-nav font-semibold hover:bg-secondary disabled:opacity-60"
        }
      >
        {on ? "ON" : "OFF"}
      </button>
    </div>
  );
}

export function PublishingModeSection({
  studio,
}: {
  studio: ReturnType<typeof useMarketingStudio>;
}) {
  const snapshot = studio.query.data;
  const state = snapshot?.autonomous;
  const [picking, setPicking] = React.useState(false);
  const [custom, setCustom] = React.useState("");

  const enabled = state?.enabled ?? false;
  const autoApprove = state?.autoApprove ?? false;
  const limit = state?.limit ?? 5;
  const used = state?.publishedToday ?? 0;
  const reached = used >= limit;

  const run = studio.autonomous;
  const runMutate = run.mutate;
  // While autonomous publishing is on, EarnRoom runs its own cycle: no founder
  // click is needed. Each cycle re-checks pause, validation and the limit
  // server-side before anything is approved or published.
  React.useEffect(() => {
    if (!enabled || reached) return;
    const tick = () => {
      if (!run.isPending) runMutate();
    };
    tick();
    const timer = window.setInterval(tick, 120_000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, reached, autoApprove]);

  const save = (input: Parameters<typeof studio.settings.mutate>[0]) =>
    studio.settings.mutate(input);

  return (
    <div className="space-y-4">
      <Toggle
        label="Autonomous publishing"
        on={enabled}
        busy={studio.settings.isPending}
        onClick={() => save({ globalMode: enabled ? "APPROVAL_REQUIRED" : "AUTONOMOUS" })}
      />

      {!enabled ? (
        <p className="type-body-sm text-muted-foreground">
          Campaigns require your approval and manual publishing. Making videos is not limited by
          this setting.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="space-y-1">
            <Toggle
              label="Auto-approve"
              on={autoApprove}
              busy={studio.settings.isPending}
              onClick={() => save({ autoApprove: !autoApprove })}
            />
            <p className="type-body-sm text-muted-foreground">
              When ON, campaigns that pass all required EarnRoom safety, branding and content
              validation checks can be approved automatically without you. A campaign that fails any
              check is never approved or published.
            </p>
          </div>

          <div className="rounded-xl border border-border p-4">
            <p className="type-body-sm font-semibold">Autonomous daily limit</p>
            <p className="type-body-sm text-muted-foreground">{limit} / day</p>
            <p className="mt-2 type-body-sm">
              Today: <strong>{used}</strong> / {limit} published
            </p>
            {!picking ? (
              <button
                type="button"
                onClick={() => setPicking(true)}
                className="mt-3 min-h-11 rounded-lg border border-border px-4 type-nav font-semibold hover:bg-secondary"
              >
                Increase limit
              </button>
            ) : (
              <div className="mt-3 space-y-3">
                <div className="flex flex-wrap gap-2">
                  {LIMIT_CHOICES.map((choice) => (
                    <button
                      key={choice}
                      type="button"
                      disabled={studio.settings.isPending}
                      onClick={() => {
                        save({ maxDailyAutonomousPublications: choice });
                        setPicking(false);
                      }}
                      className="min-h-11 rounded-lg border border-border px-4 type-nav font-semibold hover:bg-secondary disabled:opacity-60"
                    >
                      {choice} / day
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="type-body-sm text-muted-foreground" htmlFor="custom-limit">
                    Custom
                  </label>
                  <input
                    id="custom-limit"
                    type="number"
                    min={1}
                    max={500}
                    value={custom}
                    onChange={(event) => setCustom(event.target.value)}
                    className="min-h-11 w-28 rounded-lg border border-border bg-background px-3 type-body-sm"
                  />
                  <button
                    type="button"
                    disabled={studio.settings.isPending}
                    onClick={() => {
                      const value = Math.round(Number(custom));
                      if (!Number.isFinite(value) || value < 1 || value > 500) return;
                      save({ maxDailyAutonomousPublications: value });
                      setCustom("");
                      setPicking(false);
                    }}
                    className="min-h-11 rounded-lg bg-primary px-4 type-nav font-semibold text-primary-foreground disabled:opacity-60"
                  >
                    Save limit
                  </button>
                  <button
                    type="button"
                    onClick={() => setPicking(false)}
                    className="min-h-11 rounded-lg px-3 type-nav font-semibold hover:bg-secondary"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {reached ? (
            <Alert tone="warning" title="Autonomous daily publishing limit reached">
              {used} / {limit} autonomous videos published today. You can still generate, approve
              and publish manually below.
            </Alert>
          ) : null}

          {run.data && !run.data.ran ? (
            <p className="type-body-xs text-muted-foreground">EarnRoom: {run.data.detail}</p>
          ) : null}
          {run.data?.ran ? (
            <p className="type-body-xs text-muted-foreground">Last cycle: {run.data.detail}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
