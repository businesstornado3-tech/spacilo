/**
 * Extension checkout.
 *
 * A host accepting an extension only grants permission to buy it. The booking
 * is untouched until Stripe confirms this separate payment, which the existing
 * webhook applies through `confirm_booking_payment`.
 *
 * The browser sends only the change-request id. Ownership, host acceptance,
 * availability for the extra dates and every amount are re-derived server-side
 * by `begin_extension_checkout`.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { brand } from "@/config/brand";

const input = z.object({ changeRequestId: z.string().uuid() });

export const createExtensionCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => input.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: payment, error: rpcError } = await supabase.rpc("begin_extension_checkout", {
      p_change_id: data.changeRequestId,
    });
    if (rpcError) throw new Error(rpcError.message);
    if (!payment) throw new Error("Extension checkout could not be started");

    const { data: change, error: changeError } = await supabase
      .from("booking_change_requests")
      .select("id, booking_id, renter_id, original_end_date, proposed_end_date")
      .eq("id", data.changeRequestId)
      .single();
    if (changeError) throw new Error(changeError.message);
    if (change.renter_id !== userId) throw new Error("Not your extension");

    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("id, space_title_snapshot")
      .eq("id", change.booking_id)
      .single();
    if (bookingError) throw new Error(bookingError.message);

    const { stripeClient, resolveAppOrigin } = await import("@/lib/payments/stripe.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const stripe = stripeClient();

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
    const window = `${change.original_end_date} → ${change.proposed_end_date}`;

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
                name: `Storage extension — ${spaceName}`,
                description: `Extend storage: ${window}`,
              },
            },
          },
          {
            quantity: 1,
            price_data: {
              currency,
              unit_amount: payment.service_fee_amount_pence,
              product_data: { name: `${brand.name} service fee` },
            },
          },
        ],
        success_url: `${origin}/renter/payments/return?bookingId=${encodeURIComponent(
          booking.id,
        )}&extensionId=${encodeURIComponent(change.id)}`,
        cancel_url: `${origin}/renter/bookings/${encodeURIComponent(
          booking.id,
        )}?checkout=cancelled`,
        client_reference_id: payment.id,
        metadata: {
          booking_id: booking.id,
          payment_id: payment.id,
          change_request_id: change.id,
        },
        payment_intent_data: {
          metadata: {
            booking_id: booking.id,
            payment_id: payment.id,
            change_request_id: change.id,
          },
        },
        expires_at: Math.floor(new Date(payment.hold_expires_at ?? Date.now()).getTime() / 1000),
      },
      { idempotencyKey: `stow-extension-${payment.id}` },
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
