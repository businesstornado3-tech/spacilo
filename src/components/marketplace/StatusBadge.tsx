import { Badge } from "@/components/ui/badge";
import type { BookingStatus, PaymentStatus, SpaceStatus } from "@/types/models";

type AnyStatus = BookingStatus | PaymentStatus | SpaceStatus;

type Tone = "default" | "subtle" | "neutral" | "success" | "warning" | "destructive" | "info";

const STATUS: Record<string, { label: string; tone: Tone }> = {
  // Bookings
  enquiry: { label: "Enquiry", tone: "neutral" },
  pending_host: { label: "Awaiting host", tone: "warning" },
  confirmed: { label: "Confirmed", tone: "success" },
  active: { label: "Active", tone: "success" },
  ending: { label: "Ending soon", tone: "warning" },
  completed: { label: "Completed", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  declined: { label: "Declined", tone: "destructive" },
  // Payments
  requires_action: { label: "Action needed", tone: "warning" },
  processing: { label: "Processing", tone: "info" },
  paid: { label: "Paid", tone: "success" },
  failed: { label: "Payment failed", tone: "destructive" },
  refunded: { label: "Refunded", tone: "neutral" },
  payout_scheduled: { label: "Payout scheduled", tone: "info" },
  paid_out: { label: "Paid out", tone: "success" },
  // Spaces
  draft: { label: "Draft", tone: "neutral" },
  in_review: { label: "In review", tone: "info" },
  listed: { label: "Listed", tone: "success" },
  paused: { label: "Paused", tone: "warning" },
  archived: { label: "Archived", tone: "neutral" },
};

export function StatusBadge({ status, className }: { status: AnyStatus; className?: string }) {
  const entry = STATUS[status] ?? { label: status, tone: "neutral" as Tone };
  return (
    <Badge variant={entry.tone} className={className}>
      {entry.label}
    </Badge>
  );
}
