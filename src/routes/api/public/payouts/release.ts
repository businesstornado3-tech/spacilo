/**
 * Scheduled payout release endpoint (Prompt 12).
 *
 * Host payouts must never depend on somebody opening a page. This endpoint is
 * the server-side entry point for a scheduler (pg_cron, an external cron, or
 * any HTTP scheduler) and is safe to call as often as you like: the processor
 * claims work atomically and every transfer is idempotent.
 *
 * It lives under /api/public/* so an external scheduler can reach it, and is
 * therefore protected by a shared secret compared in constant time. There is
 * no browser path to this route and no test bypass.
 */
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

function authorised(request: Request): boolean {
  const expected = process.env["PAYOUT_PROCESSOR_SECRET"];
  if (!expected) return false;
  const header = request.headers.get("x-payout-secret") ?? "";
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const Route = createFileRoute("/api/public/payouts/release")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!authorised(request)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { releaseEligibleHostEarnings } = await import(
          "@/lib/payments/payout-processor.server"
        );

        try {
          const report = await releaseEligibleHostEarnings();
          console.log(
            "Payout release run",
            JSON.stringify({
              claimed: report.claimed,
              transferred: report.transferred,
              recovered: report.recovered,
              failed: report.failed,
            }),
          );
          return Response.json(report);
        } catch (error) {
          console.error("Payout release run failed", (error as Error).message);
          // Non-2xx so a scheduler with retries tries again.
          return new Response("retry", { status: 500 });
        }
      },
    },
  },
});
