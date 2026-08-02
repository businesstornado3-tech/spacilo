import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";

import { brand } from "@/config/brand";
import { supabase } from "@/integrations/supabase/client";
import { friendlyAuthError } from "@/lib/auth-errors";
import { AuthShell } from "@/components/auth/AuthShell";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { Field, TextInput } from "@/components/form/Field";
import { Alert } from "@/components/common/Alert";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

const title = "Log in — " + brand.name;
const description = "Log in to your " + brand.name + " account to rent or host storage space.";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search["redirect"] === "string" ? (search["redirect"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
    ],
  }),
  component: LoginPage,
});

/** Only same-origin relative paths may be used as a post-login destination. */
function safeRedirect(value: string | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  if (value.startsWith("/login") || value.startsWith("/signup")) return null;
  return value;
}

function LoginPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const { loading, session, profile } = useAuth();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  // Already signed in: send them straight to their current experience.
  React.useEffect(() => {
    if (loading || !session) return;
    const target = safeRedirect(search.redirect);
    if (target) {
      void navigate({ to: target, replace: true });
      return;
    }
    if (profile) {
      void navigate({ to: profile.current_mode === "host" ? "/host" : "/renter", replace: true });
    }
  }, [loading, session, profile, search.redirect, navigate]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setError(friendlyAuthError(signInError));
      setSubmitting(false);
      return;
    }
    // The auth listener hydrates the profile; the effect above routes onward.
  }

  return (
    <AuthShell title="Log in" subtitle="Welcome back. Pick up where you left off.">
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {error ? <Alert variant="error">{error}</Alert> : null}

        <Field label="Email" htmlFor="email" required>
          <TextInput
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>

        <Field label="Password" htmlFor="password" required>
          <PasswordInput
            id="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>

        <div>
          <Link
            to="/forgot-password"
            className="type-body-sm text-primary underline-offset-4 hover:underline"
          >
            Forgotten your password?
          </Link>
        </div>

        <Button type="submit" size="lg" block disabled={submitting}>
          {submitting ? "Logging in…" : "Log in"}
        </Button>
      </form>

      <p className="mt-6 type-body-sm text-muted-foreground">
        New here?{" "}
        <Link to="/get-started" className="text-primary underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>
    </AuthShell>
  );
}
