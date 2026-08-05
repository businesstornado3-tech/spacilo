import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";

import { brand } from "@/config/brand";
import { supabase } from "@/integrations/supabase/client";
import { friendlyAuthError } from "@/lib/auth-errors";
import { AuthShell } from "@/components/auth/AuthShell";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { Field } from "@/components/form/Field";
import { Alert } from "@/components/common/Alert";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/overlay/toast";
import { useAuth } from "@/hooks/useAuth";

const title = "Set a new password — " + brand.name;
const description = "Choose a new password for your " + brand.name + " account.";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { name: "robots", content: "noindex, nofollow" },
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const { loading, session, profile } = useAuth();
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const linkExpired = !loading && !session;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Please choose a password with at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Those passwords don't match.");
      return;
    }
    setSubmitting(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (updateError) {
      setError(friendlyAuthError(updateError));
      return;
    }
    toast.success("Password updated", "You're all set.");
    void navigate({
      to: profile?.current_mode === "host" ? "/host" : "/renter",
      replace: true,
    });
  }

  return (
    <AuthShell title="Set a new password" subtitle="Choose something you'll remember.">
      {linkExpired ? (
        <div className="space-y-5">
          <Alert
            tone="warning"
            title="That reset link has expired"
            children="Reset links are single use and time limited. Request a new one to continue."
          />
          <Button asChild size="lg" block>
            <Link to="/forgot-password">Request a new link</Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          {error ? <Alert tone="error" title={error} /> : null}
          <Field label="New password" htmlFor="new-password" hint="At least 8 characters." required>
            <PasswordInput
              id="new-password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Field label="Confirm new password" htmlFor="confirm-password" required>
            <PasswordInput
              id="confirm-password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </Field>
          <Button type="submit" size="lg" block disabled={submitting || loading}>
            {submitting ? "Saving…" : "Save new password"}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
