import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";

import { brand } from "@/config/brand";
import { supabase } from "@/integrations/supabase/client";
import { friendlyAuthError } from "@/lib/auth-errors";
import { AuthShell } from "@/components/auth/AuthShell";
import { Field, TextInput } from "@/components/form/Field";
import { Alert } from "@/components/common/Alert";
import { Button } from "@/components/ui/button";

const title = "Reset your password — " + brand.name;
const description = "Request a password reset link for your " + brand.name + " account.";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
    ],
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setSubmitting(false);
    if (resetError) {
      setError(friendlyAuthError(resetError));
      return;
    }
    setSent(true);
  }

  return (
    <AuthShell
      title="Forgotten your password?"
      subtitle="Enter your email and we'll send you a link to set a new one."
    >
      {sent ? (
        <Alert
          tone="success"
          title="Check your email"
          children={`If an account exists for ${email}, a reset link is on its way.`}
        />
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          {error ? <Alert tone="error" title={error} /> : null}
          <Field label="Email" htmlFor="reset-email" required>
            <TextInput
              id="reset-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Button type="submit" size="lg" block disabled={submitting}>
            {submitting ? "Sending…" : "Send reset link"}
          </Button>
        </form>
      )}

      <p className="mt-6 type-body-sm text-muted-foreground">
        <Link to="/login" className="text-primary underline-offset-4 hover:underline">
          Back to log in
        </Link>
      </p>
    </AuthShell>
  );
}
