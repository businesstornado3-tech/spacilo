/**
 * Renter checkout (Prompt 11).
 *
 * The browser sends one thing: which booking it wants to pay for. Everything
 * that matters — identity, ownership, booking status, capacity, storage price,
 * service fee, total, currency — is loaded and recalculated on the server.
 *
 * `begin_booking_checkout` runs as the signed-in user, re-checks eligibility,
 * locks the space row, recalculates volume availability for the booking's
 * dates and creates the payment record plus a 30-minute capacity hold. Only
 * then is a Stripe Checkout Session created for the snapshotted total.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { FIRST_MONTH_LABEL } from "@/lib/payments/fees";

const input = z.object({ bookingId: z.string().uuid() });

export const createBookingCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => input.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Server-side eligibility + capacity + hold, all inside the database.
    const { data: payment, error: rpcError } = await supabase.rpc("begin_booking_checkout", {
      p_booking_id: data.bookingId,
    });
    if (rpcError) throw new Error(rpcError.message);
    if (!payment) throw new Error("Checkout could not be started");

    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("id, renter_id, space_title_snapshot, start_date, end_date")
      .eq("id", data.bookingId)
      .single();
    if (bookingError) throw new Error(bookingError.message);
    if (booking.renter_id !== userId) throw new Error("Not your booking");

    const { stripeClient, resolveAppOrigin, checkoutSuccessUrl, checkoutCancelUrl } = await import(
      "@/lib/payments/stripe.server"
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const stripe = stripeClient();

    // Reuse an open session rather than creating a second one for the same hold.
    if (payment.stripe_checkout_session_id) {
      const existing = await stripe.checkout.sessions.retrieve(payment.stripe_checkout_session_id);
      if (existing.status === "open" && existing.url) {
        return { url: existing.url };
      }
    }

    const request = getRequest();
    const origin = resolveAppOrigin(request?.url);
    const currency = payment.currency.toLowerCase();
    const spaceName = booking.space_title_snapshot ?? "Storage space";

    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency,
              unit_amount: payment.storage_amount_pence,
              product_data: {
                name: `${FIRST_MONTH_LABEL} storage — ${spaceName}`,
                description: `Storage from ${booking.start_date}. Later months are not charged yet.`,
              },
            },
          },
          {
            quantity: 1,
            price_data: {
              currency,
              unit_amount: payment.service_fee_amount_pence,
              product_data: { name: "Project Stow service fee" },
            },
          },
        ],
        success_url: checkoutSuccessUrl(origin, booking.id),
        cancel_url: checkoutCancelUrl(origin, booking.id),
        client_reference_id: payment.id,
        metadata: { booking_id: booking.id, payment_id: payment.id },
        payment_intent_data: {
          metadata: { booking_id: booking.id, payment_id: payment.id },
        },
        expires_at: Math.floor(new Date(payment.hold_expires_at ?? Date.now()).getTime() / 1000),
      },
      { idempotencyKey: `stow-checkout-${payment.id}` },
    );

    const { error: linkError } = await supabaseAdmin
      .from("payments")
      .update({
        stripe_checkout_session_id: session.id,
        stripe_payment_intent_id:
          typeof session.payment_intent === "string" ? session.payment_intent : null,
        livemode: session.livemode,
        checkout_created_at: new Date().toISOString(),
      })
      .eq("id", payment.id);
    if (linkError) throw new Error(linkError.message);

    if (!session.url) throw new Error("Stripe did not return a checkout URL");
    return { url: session.url };
  });
