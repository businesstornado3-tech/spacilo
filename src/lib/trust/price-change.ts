/**
 * Price-change safeguard (Prompt 23G).
 *
 * The accepted request's snapshot is the only price that can be charged. If
 * the host has since edited the listing, the renter is told plainly — the
 * snapshot still wins, and nothing recalculates behind their back.
 */
export type PriceChange = "unchanged" | "cheaper_now" | "dearer_now" | "unknown";

export function comparePrice(
  snapshotPence: number | null | undefined,
  livePence: number | null | undefined,
): PriceChange {
  if (typeof snapshotPence !== "number" || typeof livePence !== "number") return "unknown";
  if (snapshotPence === livePence) return "unchanged";
  return livePence < snapshotPence ? "cheaper_now" : "dearer_now";
}

export function priceChangeCopy(change: PriceChange): string | null {
  switch (change) {
    case "cheaper_now":
      return "The host has since lowered this listing's price. Your booking uses the price you were accepted at, which is higher. You can withdraw and send a new request instead.";
    case "dearer_now":
      return "The host has since raised this listing's price. Your booking still uses the lower price you were accepted at.";
    default:
      return null;
  }
}
