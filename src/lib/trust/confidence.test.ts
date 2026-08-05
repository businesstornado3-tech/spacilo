import { describe, expect, it } from "vitest";

import {
  MIN_RESPONSE_SAMPLE,
  buildTrustSummary,
  containsForbiddenClaim,
  formatResponseTime,
  parseResponseStats,
  responseSignal,
} from "@/lib/trust/signals";

describe("host responsiveness signal", () => {
  it("ignores an empty or malformed payload", () => {
    expect(parseResponseStats(null)).toBeNull();
    expect(parseResponseStats({ sample_size: 0 })).toBeNull();
    expect(responseSignal({})).toBeNull();
  });

  it("refuses to judge a tiny sample", () => {
    const signal = responseSignal({
      host_response_stats: { sample_size: MIN_RESPONSE_SAMPLE - 1, responded_count: 1 },
    });
    expect(signal?.tone).toBe("absent");
  });

  it("reports reply rate and typical speed as facts", () => {
    const signal = responseSignal({
      host_response_stats: { sample_size: 8, responded_count: 6, median_response_hours: 5 },
    });
    expect(signal?.label).toBe("Replied to 75% of recent requests");
    expect(signal?.detail).toContain("last 90 days");
    expect(signal?.detail).toContain("about 5 hours");
    expect(signal?.source).toBe("platform");
  });

  it("never produces a forbidden trust claim", () => {
    const summary = buildTrustSummary({
      host_response_stats: { sample_size: 20, responded_count: 20, median_response_hours: 0.5 },
    });
    for (const signal of [...summary.signals, ...summary.gaps]) {
      expect(containsForbiddenClaim(`${signal.label} ${signal.detail}`)).toBe(false);
    }
  });

  it("formats response times in plain English", () => {
    expect(formatResponseTime(0.4)).toBe("under an hour");
    expect(formatResponseTime(1.5)).toBe("about an hour");
    expect(formatResponseTime(30)).toBe("about a day");
    expect(formatResponseTime(80)).toBe("about 3 days");
  });
});
