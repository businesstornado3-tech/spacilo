/**
 * Tells a renter if the live listing price now differs from the price they
 * were accepted at. The snapshot is authoritative either way.
 */
import * as React from "react";
import { AlertCircle } from "lucide-react";

import { getPublishedSpace } from "@/lib/spaces-api";
import { comparePrice, priceChangeCopy } from "@/lib/trust/price-change";

export function PriceChangeNotice({
  spaceId,
  snapshotPence,
}: {
  spaceId: string;
  snapshotPence: number | null | undefined;
}) {
  const [livePence, setLivePence] = React.useState<number | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    void getPublishedSpace(spaceId)
      .then((row) => {
        if (!cancelled && row) setLivePence(row.monthly_price_pence ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [spaceId]);

  const copy = priceChangeCopy(comparePrice(snapshotPence, livePence));
  if (!copy) return null;

  return (
    <section className="flex items-start gap-3 rounded-2xl border border-border bg-warning-soft p-4">
      <AlertCircle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
      <p className="type-body-sm">{copy}</p>
    </section>
  );
}
