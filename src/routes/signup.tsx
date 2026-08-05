import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";

import { brand } from "@/config/brand";
import { supabase } from "@/integrations/supabase/client";
import { friendlyAuthError } from "@/lib/auth-errors";
import { AuthShell } from "@/components/auth/AuthShell";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { Field, TextInput } from "@/components/form/Field";
import { CheckboxField } from "@/components/form/Controls";
import { Alert } from "@/components/common/Alert";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

const title = "Create your account — " + brand.name;
const description =
  "Create a " + brand.name + " account in under a minute. One account for renting and hosting.";

export const Route = createFileRoute("/signup")({
  validateSearch: (search: Record<string, unknown>) => ({
    mode: search["mode"] === "host" ? ("host" as const) : ("renter" as const),
  }),
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
    ],
  }),
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();
  const { mode } = Route.useSearch();
  const { loading, session, profile } = useAuth();
  const claimGuestScan = useGuestClaim();

  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [terms, setTerms] = React.useState(false);
  const [marketing, setMarketing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [checkEmail, setCheckEmail] = React.useState(false);

  // A guest SpaceFit preview follows the visitor into their new account.
  React.useEffect(() => {
    if (loading || !session || !profile) return;
    let cancelled = false;
    void (async () => {
      const claimed = await claimGuestScan();
      if (cancelled) return;
      void navigate({
        to: claimed ?? (profile.current_mode === "host" ? "/host" : "/renter"),
        replace: true,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, session, profile, navigate, claimGuestScan]);


  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!terms) {
      setError("Please accept the Terms of Service and Privacy Policy to continue.");
      return;
    }
    if (password.length < 8) {
      setError("Please choose a password with at least 8 characters.");
      return;
    }

    setSubmitting(true);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          initial_mode: mode,
          marketing_opt_in: marketing,
        },
      },
    });

    if (signUpError) {
      setError(friendlyAuthError(signUpError));
      setSubmitting(false);
      return;
    }

    // With email confirmation on, there is no session yet.
    if (!data.session) {
      setCheckEmail(true);
      setSubmitting(false);
    }
  }

  if (checkEmail) {
    return (
      <AuthShell
        title="Check your email"
        subtitle={`We've sent a confirmation link to ${email}. Open it to finish setting up your account.`}
      >
        <Alert
          tone="info"
          title="Nothing in your inbox?"
          children="Give it a minute, then check your spam folder."
        />
        <p className="mt-6 type-body-sm text-muted-foreground">
          Already confirmed?{" "}
          <Link to="/login" className="text-primary underline-offset-4 hover:underline">
            Log in
          </Link>
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle={
        mode === "host"
          ? "One account for hosting — and for renting later, if you need it."
          : "One account for renting — and for hosting later, if you want to."
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {error ? <Alert tone="error" title={error} /> : null}

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="First name" htmlFor="first-name" required>
            <TextInput
              id="first-name"
              autoComplete="given-name"
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </Field>
          <Field label="Last name" htmlFor="last-name" required>
            <TextInput
              id="last-name"
              autoComplete="family-name"
              required
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Email" htmlFor="signup-email" required>
          <TextInput
            id="signup-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>

        <Field label="Password" htmlFor="signup-password" hint="At least 8 characters." required>
          <PasswordInput
            id="signup-password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>

        <div className="space-y-1">
          <CheckboxField
            id="terms"
            label="I agree to the Terms of Service and Privacy Policy."
            checked={terms}
            onChange={(e) => setTerms(e.currentTarget.checked)}
          />
          <CheckboxField
            id="marketing"
            label="I'd like to receive useful updates and offers."
            checked={marketing}
            onChange={(e) => setMarketing(e.currentTarget.checked)}
          />
        </div>

        <Button type="submit" size="lg" block disabled={submitting}>
          {submitting ? "Creating your account…" : "Create account"}
        </Button>
      </form>

      <p className="mt-6 type-body-sm text-muted-foreground">
        Already have an account?{" "}
        <Link to="/login" className="text-primary underline-offset-4 hover:underline">
          Log in
        </Link>
      </p>
    </AuthShell>
  );
}
