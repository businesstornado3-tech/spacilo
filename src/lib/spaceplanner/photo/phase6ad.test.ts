/**
 * Phase 6AD regression tests — preview reliability.
 *
 * The live failure this phase fixes: a render that SUCCEEDED was thrown away
 * because one client ceiling covered render AND verification, and every cause
 * was reported to the user as a single "timed out". These tests lock down the
 * three rules that came out of that:
 *
 *   1. Every stop has a NAMED cause, distinguishable in support.
 *   2. A stop that a second attempt cannot fix is never retried.
 *   3. Identical input never buys two render requests.
 */
import { describe, expect, it, vi } from "vitest";

import {
  abortReasonFor,
  isRetryableFailure,
  isVisualisationWorking,
  showsRenderedImage,
  PREVIEW_UX_DEADLINE_MS,
  RENDER_TIMEOUT_MS,
} from "@/hooks/useSpaceVisualisation";
import {
  clearVisualisationCache,
  requestVisualisation,
  visualisationSignature,
  type VisualisationRequest,
} from "@/lib/spaceplanner/photo/visualise";

function request(overrides: Partial<VisualisationRequest> = {}): VisualisationRequest {
  return {
    spaceImage: { mimeType: "image/jpeg", base64: "space" },
    itemImages: [{ mimeType: "image/jpeg", base64: "items" }],
    instruction: "render the manifest",
    manifest: [{ id: "ITEM-1", label: "suitcase", quantity: 1 }],
    planHash: "plan-1",
    inventoryHash: "inv-1",
    ...overrides,
  };
}

describe("Phase 6AD — named preview failure causes", () => {
  it("separates a server render deadline from our own client ceiling", () => {
    expect(abortReasonFor("render_timeout")).toBe("server_render_timeout");
    expect(abortReasonFor("timed_out")).toBe("client_timeout");
  });

  it("names a busy gateway rather than calling it a timeout", () => {
    expect(abortReasonFor("upstream_429")).toBe("gateway_busy");
    expect(abortReasonFor("upstream_402")).toBe("gateway_busy");
    expect(abortReasonFor("upstream_unreachable")).toBe("gateway_unreachable");
    expect(abortReasonFor("no_image_returned")).toBe("no_image");
  });

  it("falls back to an honest unknown rather than inventing a cause", () => {
    expect(abortReasonFor("something_new")).toBe("unknown");
    expect(abortReasonFor(null)).toBe("unknown");
  });
});

describe("Phase 6AD — no blind retry", () => {
  it("never retries a stop that a second attempt cannot change", () => {
    for (const code of [
      "timed_out",
      "render_timeout",
      "upstream_429",
      "upstream_402",
      "upstream_unreachable",
      "not_configured",
      "no_image_returned",
      "bad_upstream_payload",
    ]) {
      expect(isRetryableFailure(code)).toBe(false);
    }
  });

  it("treats no failure at all as nothing to retry", () => {
    expect(isRetryableFailure(null)).toBe(false);
  });
});

describe("Phase 6AD — the user's budget is not the network's", () => {
  it("stops making the user wait well before the background ceiling", () => {
    expect(PREVIEW_UX_DEADLINE_MS).toBeLessThan(RENDER_TIMEOUT_MS);
  });

  it("leaves room for a render and its check to finish separately", () => {
    // Server bounds: 35s render + 10s check. The client must outlast their sum
    // or a good render is discarded exactly as it was before this phase.
    expect(RENDER_TIMEOUT_MS).toBeGreaterThan(45_000);
  });

  it("gives up the spinner without giving up the run", () => {
    expect(isVisualisationWorking("unavailable")).toBe(false);
    expect(showsRenderedImage("unavailable")).toBe(false);
  });

  it("still shows an image for exactly one state", () => {
    expect(showsRenderedImage("verified")).toBe(true);
    for (const status of ["unverified", "incomplete", "unfaithful", "failed"] as const) {
      expect(showsRenderedImage(status)).toBe(false);
    }
  });
});

describe("Phase 6AD — identical input never renders twice", () => {
  it("gives the same signature to the same plan, photos and manifest", () => {
    expect(visualisationSignature(request())).toBe(visualisationSignature(request()));
  });

  it("gives a different signature once the plan changes", () => {
    expect(visualisationSignature(request())).not.toBe(
      visualisationSignature(request({ planHash: "plan-2" })),
    );
  });

  it("joins a request already in flight instead of paying for a second", async () => {
    clearVisualisationCache();
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return new Response(
        JSON.stringify({
          image: "data:image/png;base64,abc",
          verification: "verified",
          coverage: { expected: 1, present: 1, missing: [], unexpected: [], complete: true, faithful: true },
          renderMs: 1200,
          verifyMs: 300,
          serverTotalMs: 1500,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as unknown as typeof fetch;

    const [a, b] = await Promise.all([
      requestVisualisation(request(), fetchImpl),
      requestVisualisation(request(), fetchImpl),
    ]);
    expect(calls).toBe(1);
    expect(a.image).toBe(b.image);

    // And a third, after both settled, is answered from the session cache.
    await requestVisualisation(request(), fetchImpl);
    expect(calls).toBe(1);
    clearVisualisationCache();
  });

  it("carries the server's own stage timings through to diagnostics", async () => {
    clearVisualisationCache();
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          image: "data:image/png;base64,abc",
          verification: "unverified",
          coverage: null,
          renderMs: 21_000,
          verifyMs: 10_000,
          verifyTimedOut: true,
          serverTotalMs: 31_000,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )) as unknown as typeof fetch;

    const response = await requestVisualisation(request({ planHash: "plan-timings" }), fetchImpl);
    expect(response.verifyTimedOut).toBe(true);
    expect(response.verifyMs).toBe(10_000);
    expect(response.serverTotalMs).toBe(31_000);
    // A check that ran out of time is NOT a verified render.
    expect(response.verification).toBe("unverified");
    clearVisualisationCache();
  });
});
