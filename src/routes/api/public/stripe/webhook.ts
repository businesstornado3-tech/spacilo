/**
 * Stripe webhook — the ONLY authority for confirming a booking (Prompt 11).
 *
 * A renter reaching the return URL proves nothing. This endpoint verifies the
 * Stripe signature over the raw body, then hands the event to
 * `confirm_booking_payment`, which is idempotent and re-validates amount,
 * currency and test/live mode inside a single database transaction before
 * moving the booking from pending_payment to confirmed.
 *
 * Signature verification is never bypassed, in any environment.
 */
import { createFileRoute } from "@tanstack/react-router";

import { isHandledEvent } from "@/lib/payments/webhook-validation";

export const Route = createFileRoute("/api/public/stripe/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawBody = await request.text();
        const signature = request.headers.get("stripe-signature");

        const { verifiedStripeEvent } = await import("@/lib/payments/stripe.server");

        let event;
        try {
          event = await verifiedStripeEvent(rawBody, signature);
        } catch (error) {
          console.error("Stripe webhook signature rejected", (error as Error).message);
          return new Response("Invalid signature", { status: 400 });
        }

        if (!isHandledEvent(event.type)) {
          return new Response("ignored", { status: 200 });
        }

        const session = event.data.object as {
          id: string;
          client_reference_id?: string | null;
          metadata?: Record<string, string> | null;
          amount_total?: number | null;
          currency?: string | null;
          payment_status?: string | null;
          payment_intent?: string | { id: string } | null;
        };

        const paymentId = session.metadata?.["payment_id"] ?? session.client_reference_id ?? null;
        if (!paymentId) {
          console.error("Stripe webhook without an internal payment reference", event.id);
          return new Response("no payment reference", { status: 200 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const paymentIntentId =
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : (session.payment_intent?.id ?? null);

        const paid =
          (event.type === "checkout.session.completed" ||
            event.type === "checkout.session.async_payment_succeeded") &&
          session.payment_status === "paid";

        if (!paid) {
          const status =
            event.type === "checkout.session.expired" ? ("expired" as const) : ("failed" as const);
          const { error } = await supabaseAdmin.rpc("record_payment_failure", {
            p_event_id: event.id,
            p_event_type: event.type,
            p_payment_id: paymentId,
            p_status: status,
            p_reason: session.payment_status ?? event.type,
            p_livemode: event.livemode,
          });
          if (error) {
            console.error("Stripe webhook failure-record error", error.message);
            return new Response("retry", { status: 500 });
          }
          return new Response("ok", { status: 200 });
        }

        const { data, error } = await supabaseAdmin.rpc("confirm_booking_payment", {
          p_event_id: event.id,
          p_event_type: event.type,
          p_payment_id: paymentId,
          p_session_id: session.id,
          p_payment_intent_id: paymentIntentId ?? "",
          p_amount_pence: session.amount_total ?? -1,
          p_currency: (session.currency ?? "").toUpperCase(),
          p_livemode: event.livemode,
        });

        if (error) {
          // Signal Stripe to retry rather than silently dropping a paid event.
          console.error("Stripe webhook confirmation error", error.message);
          return new Response("retry", { status: 500 });
        }

        console.log("Stripe webhook processed", event.id, event.type, JSON.stringify(data));
        return new Response("ok", { status: 200 });
      },
    },
  },
});
