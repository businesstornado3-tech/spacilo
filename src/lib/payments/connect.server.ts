/**
 * Stripe Connect — server only (Prompt 12).
 *
 * Project Stow never sees bank details, sort codes or identity documents.
 * Stripe collects all regulated onboarding information through its own hosted
 * flow; we persist only the account reference and the readiness flags Stripe
 * reports back.
 *
 * Never import this from a component or any client-reachable module scope.
 */
import type Stripe from "stripe";

import { stripeClient } from "@/lib/payments/stripe.server";

/** Marketplace country for connected accounts. GBP only, for now. */
export const CONNECT_COUNTRY = "GB";

export const payoutReturnUrl = (origin: string) => `${origin}/host/payouts/return`;
export const payoutRefreshUrl = (origin: string) => `${origin}/host/payouts/refresh`;

/** The subset of a Stripe Account we persist. Nothing sensitive. */
export interface AccountFacts {
  stripeAccountId: string;
  livemode: boolean;
  country: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  transfersCapability: string | null;
  disabledReason: string | null;
  currentlyDue: string[];
  eventuallyDue: string[];
  pendingVerification: string[];
}

export function readAccountFacts(account: Stripe.Account): AccountFacts {
  const requirements: Partial<Stripe.Account.Requirements> = account.requirements ?? {};
  return {
    stripeAccountId: account.id,
    livemode: Boolean((account as { livemode?: boolean }).livemode),
    country: account.country ?? null,
    chargesEnabled: Boolean(account.charges_enabled),
    payoutsEnabled: Boolean(account.payouts_enabled),
    detailsSubmitted: Boolean(account.details_submitted),
    transfersCapability: account.capabilities?.transfers ?? null,
    disabledReason: requirements.disabled_reason ?? null,
    currentlyDue: requirements.currently_due ?? [],
    eventuallyDue: requirements.eventually_due ?? [],
    pendingVerification: requirements.pending_verification ?? [],
  };
}

/** Writes the facts through the trusted RPC, which derives the status. */
export async function persistAccountFacts(hostUserId: string, facts: AccountFacts) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // Nullable Stripe fields are meaningful (a NULL disabled_reason is "not
  // restricted"), so they are sent as-is rather than coerced to "".
  const args = {
    p_host_user_id: hostUserId,
    p_stripe_account_id: facts.stripeAccountId,
    p_livemode: facts.livemode,
    p_country: facts.country,
    p_charges_enabled: facts.chargesEnabled,
    p_payouts_enabled: facts.payoutsEnabled,
    p_details_submitted: facts.detailsSubmitted,
    p_transfers_capability: facts.transfersCapability,
    p_disabled_reason: facts.disabledReason,
    p_currently_due: facts.currentlyDue,
    p_eventually_due: facts.eventuallyDue,
    p_pending_verification: facts.pendingVerification,
  } as unknown as Parameters<typeof supabaseAdmin.rpc<"upsert_host_payout_account">>[1];

  const { data, error } = await supabaseAdmin.rpc("upsert_host_payout_account", args);
  if (error) throw new Error(error.message);
  return data;
}

/**
 * One connected account per host, resolved from the authenticated user id —
 * never from anything the browser sent. Repeated calls reuse the account.
 */
export async function ensureConnectedAccount(
  hostUserId: string,
  email: string | null,
): Promise<{ accountId: string; created: boolean }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: existing, error } = await supabaseAdmin
    .from("host_payout_accounts")
    .select("stripe_account_id")
    .eq("host_user_id", hostUserId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (existing?.stripe_account_id) {
    return { accountId: existing.stripe_account_id, created: false };
  }

  const stripe = stripeClient();
  const account = await stripe.accounts.create(
    {
      country: CONNECT_COUNTRY,
      ...(email ? { email } : {}),
      // Platform-controlled account: Project Stow owns pricing, fees and
      // loss liability; Stripe collects and owns the onboarding requirements.
      controller: {
        fees: { payer: "application" },
        losses: { payments: "application" },
        stripe_dashboard: { type: "express" },
        requirement_collection: "stripe",
      },
      capabilities: { transfers: { requested: true } },
      metadata: { host_user_id: hostUserId },
    },
    { idempotencyKey: `project-stow-connect-account:${hostUserId}` },
  );

  await persistAccountFacts(hostUserId, readAccountFacts(account));
  return { accountId: account.id, created: true };
}

/** Fresh Stripe-hosted onboarding link. Links are single-use and expire. */
export async function createOnboardingLink(
  accountId: string,
  origin: string,
): Promise<string> {
  const stripe = stripeClient();
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: payoutRefreshUrl(origin),
    return_url: payoutReturnUrl(origin),
    type: "account_onboarding",
    collection_options: { fields: "eventually_due" },
  });
  return link.url;
}

/** Re-reads the account from Stripe and stores the current readiness facts. */
export async function syncConnectedAccount(hostUserId: string, accountId: string) {
  const stripe = stripeClient();
  const account = await stripe.accounts.retrieve(accountId);
  return persistAccountFacts(hostUserId, readAccountFacts(account));
}
