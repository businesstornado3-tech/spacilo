/**
 * Host payout processor — server only (Prompt 12).
 *
 * Safe to run repeatedly and concurrently. Money only moves when every
 * condition holds, and a retry can never produce a second transfer:
 *
 *  1. `claim_host_earnings_for_transfer` re-checks booking, payment, refund
 *     and payout-readiness state, then claims rows with FOR UPDATE SKIP LOCKED
 *     and marks them `transferring`. A second worker sees nothing to claim.
 *  2. Before creating anything, we ask Stripe whether a transfer already
 *     exists for this earning's transfer_group — this is what makes recovery
 *     after a timeout safe.
 *  3. The transfer is created with a deterministic idempotency key derived
 *     from the immutable earning id, so Stripe replays the original object.
 *  4. `stripe_transfer_id` is UNIQUE in the database, the last line of defence.
 *
 * The amount transferred is always the snapshotted host entitlement. The
 * Project Stow service fee is never part of it.
 */
import { stripeClient } from "@/lib/payments/stripe.server";
import {
  transferIdempotencyKey,
  transferMetadata,
  type HostEarning,
} from "@/lib/payments/payout-policy";

export const transferGroupFor = (earningId: string) => `project-stow-earning-${earningId}`;

export interface ReleaseOutcome {
  earningId: string;
  result: "transferred" | "recovered" | "failed" | "skipped";
  transferId?: string;
  amountPence?: number;
  reason?: string;
}

export interface ReleaseReport {
  claimed: number;
  transferred: number;
  recovered: number;
  failed: number;
  outcomes: ReleaseOutcome[];
}

/** Releases every earning that is currently eligible. Idempotent. */
export async function releaseEligibleHostEarnings(limit = 25): Promise<ReleaseReport> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const stripe = stripeClient();

  // Promote matured pending earnings so the UI and the claim query agree.
  await supabaseAdmin.rpc("mark_host_earnings_eligible");

  const { data: claimed, error } = await supabaseAdmin.rpc("claim_host_earnings_for_transfer", {
    p_limit: limit,
  });
  if (error) throw new Error(error.message);

  const earnings = (claimed ?? []) as HostEarning[];
  const report: ReleaseReport = {
    claimed: earnings.length,
    transferred: 0,
    recovered: 0,
    failed: 0,
    outcomes: [],
  };

  for (const earning of earnings) {
    const amount = earning.host_entitlement_pence;
    const destination = earning.connected_account_id;
    const group = transferGroupFor(earning.id);

    if (!destination || amount <= 0) {
      await supabaseAdmin.rpc("fail_host_earning_transfer", {
        p_earning_id: earning.id,
        p_reason: !destination ? "no connected account" : "no entitlement",
        p_block: !destination ? false : true,
      });
      report.failed += 1;
      report.outcomes.push({ earningId: earning.id, result: "skipped", reason: "not_payable" });
      continue;
    }

    try {
      // Reconciliation first: a previous attempt may have succeeded at Stripe
      // even though we never recorded it (timeout, worker restart).
      const existing = await stripe.transfers.list({ transfer_group: group, limit: 1 });
      const already = existing.data[0];
      if (already) {
        await supabaseAdmin.rpc("complete_host_earning_transfer", {
          p_earning_id: earning.id,
          p_transfer_id: already.id,
          p_connected_account_id: destination,
        });
        report.recovered += 1;
        report.outcomes.push({
          earningId: earning.id,
          result: "recovered",
          transferId: already.id,
          amountPence: already.amount,
        });
        continue;
      }

      const transfer = await stripe.transfers.create(
        {
          amount,
          currency: earning.currency.toLowerCase(),
          destination,
          transfer_group: group,
          description: `Project Stow host earnings ${earning.period_label}`,
          metadata: transferMetadata(earning),
        },
        { idempotencyKey: transferIdempotencyKey(earning.id) },
      );

      const { data: completed, error: completeError } = await supabaseAdmin.rpc(
        "complete_host_earning_transfer",
        {
          p_earning_id: earning.id,
          p_transfer_id: transfer.id,
          p_connected_account_id: destination,
        },
      );
      if (completeError) throw new Error(completeError.message);

      report.transferred += 1;
      report.outcomes.push({
        earningId: earning.id,
        result: "transferred",
        transferId: transfer.id,
        amountPence: transfer.amount,
        reason: JSON.stringify(completed),
      });
    } catch (err) {
      const message = (err as Error).message ?? "transfer failed";
      // Never blocked on a transient error: the earning returns to `pending`
      // and the next run retries it with the same idempotency key.
      await supabaseAdmin.rpc("fail_host_earning_transfer", {
        p_earning_id: earning.id,
        p_reason: message.slice(0, 400),
        p_block: false,
      });
      report.failed += 1;
      report.outcomes.push({ earningId: earning.id, result: "failed", reason: message });
      console.error("Host payout transfer failed", earning.id, message);
    }
  }

  return report;
}
