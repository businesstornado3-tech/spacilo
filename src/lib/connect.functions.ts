/**
 * Host payout / Stripe Connect server functions (Prompt 12).
 *
 * The browser never sends a Stripe account id, a host id or an earning id that
 * is trusted. Every operation resolves the connected account from the
 * authenticated user, so Host A can never touch Host B's payout setup.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Creates (once) the connected account and returns a fresh Stripe link. */
export const startHostPayoutOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId, claims } = context;

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("host_enabled")
      .eq("id", userId)
      .maybeSingle();
    if (profileError) throw new Error(profileError.message);
    if (!profile?.host_enabled) {
      throw new Error("Switch to hosting before setting up payouts.");
    }

    const { ensureConnectedAccount, createOnboardingLink } = await import(
      "@/lib/payments/connect.server"
    );
    const { resolveAppOrigin } = await import("@/lib/payments/stripe.server");

    const email = typeof claims?.["email"] === "string" ? (claims["email"] as string) : null;
    const { accountId } = await ensureConnectedAccount(userId, email);

    const request = getRequest();
    const origin = resolveAppOrigin(request?.url);
    const url = await createOnboardingLink(accountId, origin);
    return { url };
  });

/**
 * Re-reads the account from Stripe. Used when a host comes back from
 * onboarding — the redirect itself proves nothing, Stripe's answer does.
 */
export const refreshHostPayoutStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: account, error } = await supabase
      .from("host_payout_accounts")
      .select("stripe_account_id")
      .eq("host_user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!account?.stripe_account_id) return { synced: false };

    const { syncConnectedAccount } = await import("@/lib/payments/connect.server");
    await syncConnectedAccount(userId, account.stripe_account_id);
    return { synced: true };
  });
