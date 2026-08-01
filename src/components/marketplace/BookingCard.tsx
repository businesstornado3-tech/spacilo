import { CalendarRange, MapPin } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatDateShort } from "@/lib/format";
import { PriceDisplay } from "@/components/marketplace/PriceDisplay";
import { StatusBadge } from "@/components/marketplace/StatusBadge";
import type { BookingStatus, Pence } from "@/types/models";

export interface BookingCardProps {
  reference: string;
  spaceTitle: string;
  areaName: string;
  counterpartyName: string;
  counterpartyRole: "Host" | "Renter";
  status: BookingStatus;
  startDate: string;
  endDate?: string;
  monthlyPrice: Pence;
  photoUrl?: string;
  photoAlt?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function BookingCard({
  reference,
  spaceTitle,
  areaName,
  counterpartyName,
  counterpartyRole,
  status,
  startDate,
  endDate,
  monthlyPrice,
  photoUrl,
  photoAlt,
  actions,
  className,
}: BookingCardProps) {
  return (
    <article className={cn("rounded-2xl border border-border bg-card p-4 shadow-card", className)}>
      <div className="flex gap-4">
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={photoAlt ?? spaceTitle}
            loading="lazy"
            className="size-20 shrink-0 rounded-xl object-cover"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="type-overline text-muted-foreground">Booking {reference}</p>
              <h3 className="mt-1 type-card-title truncate">{spaceTitle}</h3>
            </div>
            <StatusBadge status={status} className="shrink-0" />
          </div>
          <ul className="mt-2 space-y-1 type-body-sm text-muted-foreground">
            <li className="flex items-center gap-1.5">
              <MapPin className="size-4" aria-hidden="true" />
              {areaName} · {counterpartyRole} {counterpartyName}
            </li>
            <li className="flex items-center gap-1.5">
              <CalendarRange className="size-4" aria-hidden="true" />
              {formatDateShort(startDate)}
              {endDate ? ` – ${formatDateShort(endDate)}` : " – ongoing"}
            </li>
          </ul>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <PriceDisplay amount={monthlyPrice} size="sm" />
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </article>
  );
}
