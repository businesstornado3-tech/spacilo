/**
 * Notification delivery preferences (Prompt 26B, Phase 2).
 *
 * These control delivery only. Anything that needs a decision — a payment, a
 * handover, a cancellation — is still recorded and still appears here and in
 * "Needs your attention", whatever is switched off.
 */
import * as React from "react";

import { track } from "@/lib/analytics/tracker";
import { Button } from "@/components/ui/button";
import { ToggleField } from "@/components/form/Controls";
import { toast } from "@/components/overlay/toast";
import {
  useNotificationPreferences,
  useSaveNotificationPreferences,
} from "@/hooks/useNotifications";
import {
  NOTIFICATION_CATEGORIES,
  preferenceKey,
  preferenceValue,
  type NotificationChannel,
  type NotificationPreferences,
} from "@/lib/notifications";

const CHANNELS: { value: NotificationChannel; label: string }[] = [
  { value: "inapp", label: "In Spacilo" },
  { value: "email", label: "Email" },
];

export function NotificationPreferencesCard() {
  const { data } = useNotificationPreferences();
  const save = useSaveNotificationPreferences();
  const [patch, setPatch] = React.useState<Partial<NotificationPreferences>>({});

  const merged = { ...(data ?? {}), ...patch } as Partial<NotificationPreferences>;
  const dirty = Object.keys(patch).length > 0;

  const onSave = async () => {
    try {
      await save.mutateAsync(patch);
      setPatch({});
      track("notification_preferences_saved");
      toast.success("Saved", "Your notification settings have been updated.");
    } catch (cause) {
      toast.error(
        "We couldn't save that",
        cause instanceof Error ? cause.message : "Please try again.",
      );
    }
  };

  return (
    <section
      aria-labelledby="notification-prefs-heading"
      className="rounded-2xl border border-border bg-card p-5 shadow-card"
    >
      <h2 id="notification-prefs-heading" className="type-h3">
        How we contact you
      </h2>
      <p className="mt-1 type-body-sm text-muted-foreground">
        These change how updates reach you. Anything waiting on you is always recorded here and on
        your dashboard, whatever you switch off.
      </p>

      <div className="mt-4 space-y-5">
        {NOTIFICATION_CATEGORIES.map((category) => (
          <div key={category.value}>
            <p className="type-body-sm font-semibold">{category.label}</p>
            <p className="type-body-sm text-muted-foreground">{category.description}</p>
            <div className="mt-2 space-y-2">
              {CHANNELS.map((channel) => {
                const key = preferenceKey(channel.value, category.value);
                return (
                  <ToggleField
                    key={String(key)}
                    id={`${channel.value}-${category.value}`}
                    label={channel.label}
                    checked={preferenceValue(merged, channel.value, category.value)}
                    onChange={(checked) =>
                      setPatch((prev) => ({ ...prev, [key]: checked }) as Partial<NotificationPreferences>)
                    }
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <Button className="mt-5" disabled={!dirty || save.isPending} onClick={() => void onSave()}>
        {save.isPending ? "Saving…" : "Save preferences"}
      </Button>
    </section>
  );
}
