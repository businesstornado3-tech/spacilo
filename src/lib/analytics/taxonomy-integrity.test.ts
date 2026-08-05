/**
 * Prompt 23C closeout — analytics taxonomy integrity.
 *
 * Every `track("…")` call in the app must name an event that exists in
 * ANALYTICS_EVENTS, otherwise the tracker drops it and the founder dashboard
 * silently under-reports. This suite reads the real source tree so drift is a
 * failing test rather than a missing number months later.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { ANALYTICS_EVENTS, isAnalyticsEvent } from "./events";

const SRC = join(process.cwd(), "src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    if (!/\.(ts|tsx)$/.test(entry) || /\.test\.tsx?$/.test(entry)) return [];
    return [full];
  });
}

interface Call {
  file: string;
  event: string;
}

function trackCalls(): Call[] {
  const calls: Call[] = [];
  for (const file of sourceFiles(SRC)) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(/\btrack\(\s*"([^"]+)"/g)) {
      calls.push({ file: file.slice(SRC.length + 1), event: match[1] as string });
    }
  }
  return calls;
}

describe("analytics taxonomy integrity", () => {
  const calls = trackCalls();

  it("finds instrumentation in the app", () => {
    expect(calls.length).toBeGreaterThan(10);
  });

  it("never emits an event name outside the taxonomy", () => {
    const unknown = calls.filter((call) => !isAnalyticsEvent(call.event));
    expect(unknown).toEqual([]);
  });

  it("has exactly one analytics module", () => {
    const legacy = sourceFiles(SRC).filter((file) =>
      readFileSync(file, "utf8").includes('from "@/lib/analytics"'),
    );
    expect(legacy).toEqual([]);
  });

  it("wires the journeys the founder dashboard reports on", () => {
    const emitted = new Set(calls.map((call) => call.event));
    for (const required of [
      "page_view",
      "cta_clicked",
      "signup_started",
      "signup_completed",
      "login_completed",
      "spacefit_stuff_started",
      "spacefit_stuff_completed",
      "spacefit_space_started",
      "spacefit_space_completed",
      "live_scan_started",
      "live_scan_completed",
      "scan_photo_fallback_used",
      "scan_manual_fallback_used",
      "guest_scan_result_viewed",
      "guest_scan_claimed",
      "storage_search_started",
      "listing_viewed",
      "enquiry_started",
      "enquiry_sent",
      "storage_request_started",
      "storage_request_created",
      "booking_created",
      "host_listing_started",
      "host_listing_published",
    ]) {
      expect({ event: required, wired: emitted.has(required) }).toEqual({
        event: required,
        wired: true,
      });
    }
  });

  it("keeps every taxonomy entry lowercase and snake_cased", () => {
    for (const event of ANALYTICS_EVENTS) {
      expect(event).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });
});
