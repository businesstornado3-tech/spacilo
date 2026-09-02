/**
 * Refund allocation primitives (Prompt 12).
 *
 * EarnRoom does not yet have an agreed cancellation/refund business
 * policy, so nothing here decides WHETHER to refund. These functions only
 * describe how an amount that HAS been refunded is split between the
 * host's storage entitlement and the EarnRoom service fee, so the
 * earnings ledger can be adjusted safely and auditably.
 *
 * Current allocation: refunds consume the storage amount first, then the
 * service fee. This is the conservative choice — the host entitlement is
 * reduced before platform revenue — and is an explicit policy decision that
 * should be confirmed commercially before live mode.
 */

export interface RefundAllocation {
  refundedStoragePence: number;
  refundedFeePence: number;
}

export function allocateRefund(
  refundedTotalPence: number,
  storagePence: number,
  feePence: number,
): RefundAllocation {
  if (
    !Number.isInteger(refundedTotalPence) ||
    !Number.isInteger(storagePence) ||
    !Number.isInteger(feePence)
  ) {
    throw new Error("Refund allocation requires integer pence");
  }
  if (refundedTotalPence < 0) throw new Error("Refund cannot be negative");

  const capped = Math.min(refundedTotalPence, storagePence + feePence);
  const refundedStoragePence = Math.min(capped, storagePence);
  return {
    refundedStoragePence,
    refundedFeePence: capped - refundedStoragePence,
  };
}

/** True when the whole storage entitlement has been refunded. */
export const isFullStorageRefund = (allocation: RefundAllocation, storagePence: number): boolean =>
  allocation.refundedStoragePence >= storagePence && storagePence > 0;
