/** User-safe error text for support-case operations (Prompt 18). */
export const CASE_ERRORS: Record<string, string> = {
  not_support_staff: "You don't have permission to do that.",
  case_not_found: "That case could not be found.",
  case_already_resolved: "This case has already been resolved.",
  payment_not_found: "That payment could not be found.",
  payment_not_on_booking: "That payment does not belong to this booking.",
  payment_not_succeeded: "That payment did not succeed, so it cannot be refunded.",
  payment_fully_refunded: "That payment has already been fully refunded.",
  refund_exceeds_remaining: "The refund amount is higher than the remaining refundable amount.",
  refund_amount_invalid: "Enter a refund amount greater than zero.",
  resolution_summary_required: "Add a resolution summary before recording the outcome.",
  assignee_not_support_staff: "That person is not a support user.",
  not_a_booking_participant: "You don't have access to that booking.",
  case_closed_to_updates: "This case is no longer accepting participant updates.",
};

/** Maps a raw database error onto safe copy. Never leaks SQL or Stripe detail. */
export function friendlyCaseError(message: string, fallback: string): string {
  for (const [key, text] of Object.entries(CASE_ERRORS)) {
    if (message.includes(key)) return text;
  }
  return fallback;
}
