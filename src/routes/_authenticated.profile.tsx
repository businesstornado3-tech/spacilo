import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { BadgeCheck, ShieldQuestion } from "lucide-react";

import { brand } from "@/config/brand";
import { AppLayout } from "@/components/layout/AppLayout";
import { Field, TextInput } from "@/components/form/Field";
import { Alert } from "@/components/common/Alert";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/overlay/toast";
import { friendlyAuthError } from "@/lib/auth-errors";
import { ModeSwitchButton } from "@/components/account/AccountMenu";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Profile — " + brand.name },
      { name: "description", content: "Your details, verification status and current mode." },
      { property: "og:title", content: "Profile — " + brand.name },
      { property: "og:description", content: "Your details, verification status and current mode." },
    ],
  }),
  component: ProfilePage,
});

function VerificationRow({ label, verified }: { label: string; verified: boolean }) {
  return (
    <li className="flex items-center justify-between gap-4 border-b border-border py-3 last:border-b-0">
      <span className="type-label">{label}</span>
      <span
        className={`inline-flex items-center gap-1.5 type-body-sm ${
          verified ? "text-success" : "text-muted-foreground"
        }`}
      >
        {verified ? (
          <BadgeCheck className="size-4" aria-hidden="true" />
        ) : (
          <ShieldQuestion className="size-4" aria-hidden="true" />
        )}
        {verified ? "Verified" : "Not verified"}
      </span>
    </li>
  );
}

function ProfilePage() {
  const { profile, user, mode, updateProfile } = useAuth();

  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [displayName, setDisplayName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!profile) return;
    setFirstName(profile.first_name ?? "");
    setLastName(profile.last_name ?? "");
    setDisplayName(profile.display_name ?? "");
    setPhone(profile.phone ?? "");
  }, [profile]);

  const emailVerified = Boolean(user?.email_confirmed_at);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await updateProfile({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        display_name: displayName.trim() || null,
        phone: phone.trim() || null,
      });
      toast.success("Profile saved");
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setSaving(false);
    }
  }

  const initials =
    `${profile?.first_name?.[0] ?? ""}${profile?.last_name?.[0] ?? ""}`.toUpperCase() || "•";

  return (
    <AppLayout
      mode={mode}
      title="Profile"
      description="Your details, verification status and current mode."
      actions={<ModeSwitchButton />}
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <form
          onSubmit={handleSubmit}
          className="space-y-5 rounded-2xl border border-border bg-card p-6 shadow-card"
          noValidate
        >
          {error ? <Alert tone="error" title={error} /> : null}

          <div className="flex items-center gap-4">
            <span className="grid size-16 place-items-center rounded-full bg-primary-soft type-h3 text-primary-soft-foreground">
              {initials}
            </span>
            <p className="type-body-sm text-muted-foreground">
              Profile photos arrive in a later step.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="First name" htmlFor="profile-first">
              <TextInput
                id="profile-first"
                autoComplete="given-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </Field>
            <Field label="Last name" htmlFor="profile-last">
              <TextInput
                id="profile-last"
                autoComplete="family-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </Field>
          </div>

          <Field
            label="Display name"
            htmlFor="profile-display"
            hint="Shown to other members instead of your full name."
          >
            <TextInput
              id="profile-display"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </Field>

          <Field label="Phone" htmlFor="profile-phone" hint="UK mobile or landline.">
            <TextInput
              id="profile-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </Field>

          <Field
            label="Email"
            htmlFor="profile-email"
            hint="Email changes are handled securely and arrive in a later step."
          >
            <TextInput id="profile-email" value={user?.email ?? ""} disabled readOnly />
          </Field>

          <Button type="submit" size="lg" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </form>

        <aside className="space-y-6">
          <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
            <h2 className="type-h3">Verification</h2>
            <ul className="mt-3">
              <VerificationRow label="Email" verified={emailVerified} />
              <VerificationRow label="Phone" verified={Boolean(profile?.phone_verified)} />
              <VerificationRow label="Identity" verified={false} />
            </ul>
            <p className="mt-3 type-body-sm text-muted-foreground">
              Phone and identity checks arrive in a later step.
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
            <h2 className="type-h3">Current mode</h2>
            <p className="mt-2 type-body-sm text-muted-foreground">
              Currently: <span className="text-foreground">{mode === "host" ? "Hosting" : "Renting"}</span>
            </p>
            <div className="mt-4">
              <ModeSwitchButton />
            </div>
          </div>
        </aside>
      </div>
    </AppLayout>
  );
}
