/**
 * Prompt 23C — first-party analytics boundary.
 *
 * These tests guard the privacy promises made on the public site and in the
 * founder dashboard: what may be collected, how long an identifier lives, and
 * what a page view is allowed to cost.
 */
import { describe, expect, it } from "vitest";

import {
  ANALYTICS_EVENTS,
  MAX_PROP_STRING_LENGTH,
  isAnalyticsEvent,
  isForbiddenPropKey,
  normalisePath,
  referrerHost,
  sanitiseProps,
} from "./events";
import {
  ANALYTICS_RETENTION_DAYS,
  REPORTING_TIMEZONE,
  UNIQUE_VISITOR_DEFINITION,
  VISITOR_ROTATION_DAYS,
  classifyDevice,
  classifyEnvironment,
  looksLikeBot,
  privacySignalOptsOut,
  readCampaign,
  resolveSessionRef,
  resolveVisitorRef,
} from "./tracker";

describe("event taxonomy", () => {
  it("has no duplicate semantic events", () => {
    expect(new Set(ANALYTICS_EVENTS).size).toBe(ANALYTICS_EVENTS.length);
  });

  it("covers the journeys the founder dashboard reports on", () => {
    for (const required of [
      "page_view",
      "signup_completed",
      "spacefit_stuff_started",
      "spacefit_stuff_completed",
      "spacefit_space_started",
      "spacefit_space_completed",
      "live_scan_started",
      "scan_photo_fallback_used",
      "scan_manual_fallback_used",
      "storage_search_started",
      "listing_viewed",
      "storage_request_created",
      "booking_created",
      "host_listing_published",
    ]) {
      expect(isAnalyticsEvent(required)).toBe(true);
    }
  });

  it("refuses unknown event names", () => {
    expect(isAnalyticsEvent("random_thing")).toBe(false);
  });
});

describe("data minimisation", () => {
  it("drops anything that could carry personal or sensitive content", () => {
    const cleaned = sanitiseProps({
      outcome: "measured",
      item_count: 12,
      email: "someone@example.com",
      postcode: "PO1 2AB",
      message: "hello there",
      renter_note: "please be careful with the boxes",
      photo: "data:image/jpeg;base64,AAAA",
      declaration: "signed",
      search_term: "storage near me",
    });
    expect(cleaned).toEqual({ outcome: "measured", item_count: 12 });
  });

  it("treats long strings as free text and discards them", () => {
    const long = "x".repeat(MAX_PROP_STRING_LENGTH + 1);
    expect(sanitiseProps({ note_kind: long })).toEqual({});
  });

  it("knows suffixed sensitive keys too", () => {
    expect(isForbiddenPropKey("renter_message")).toBe(true);
    expect(isForbiddenPropKey("space_postcode")).toBe(true);
    expect(isForbiddenPropKey("space_type")).toBe(false);
  });

  it("keeps only scalars", () => {
    // deliberately wrong shapes, as an untyped caller could supply
    const props = { nested: { a: 1 }, list: [1, 2], nan: Number.NaN } as never;
    expect(sanitiseProps(props)).toEqual({});
  });
});

describe("path normalisation", () => {
  it("collapses identifiers so top-pages groups sensibly", () => {
    expect(normalisePath("/spaces/2b1f9ad0-1c22-4f0e-9a55-8f0c0f1a2b3c")).toBe("/spaces/:id");
    expect(normalisePath("/renter/bookings/42")).toBe("/renter/bookings/:id");
  });

  it("never keeps query strings or fragments", () => {
    expect(normalisePath("/search?postcode=PO1+2AB&utm_source=x")).toBe("/search");
    expect(normalisePath("/how-it-works#hosts")).toBe("/how-it-works");
  });

  it("normalises the root and trailing slashes", () => {
    expect(normalisePath("/")).toBe("/");
    expect(normalisePath("/trust/")).toBe("/trust");
  });
});

describe("referrer handling", () => {
  it("keeps the host only and ignores our own pages", () => {
    expect(referrerHost("https://www.google.com/search?q=storage+portsmouth", "spacilo.com")).toBe(
      "www.google.com",
    );
    expect(referrerHost("https://spacilo.com/how-it-works", "spacilo.com")).toBeNull();
    expect(referrerHost("", "spacilo.com")).toBeNull();
  });
});

describe("anonymous visitor identifier", () => {
  it("is opaque, random and rotated on a bounded cadence", () => {
    const now = Date.UTC(2026, 0, 31);
    const fresh = resolveVisitorRef(null, now);
    expect(fresh.rotated).toBe(true);
    expect(fresh.id).toMatch(/^[0-9a-f-]{36}$/i);

    const stillValid = resolveVisitorRef({ id: fresh.id, issued: now - 1000 }, now);
    expect(stillValid.id).toBe(fresh.id);
    expect(stillValid.rotated).toBe(false);

    const stale = resolveVisitorRef(
      { id: fresh.id, issued: now - (VISITOR_ROTATION_DAYS + 1) * 86_400_000 },
      now,
    );
    expect(stale.rotated).toBe(true);
    expect(stale.id).not.toBe(fresh.id);
  });

  it("starts a new session after the idle window", () => {
    const now = Date.UTC(2026, 0, 31, 12);
    const first = resolveSessionRef(null, now);
    expect(first.isNew).toBe(true);
    expect(resolveSessionRef({ id: first.id, seen: now - 60_000 }, now).id).toBe(first.id);
    expect(resolveSessionRef({ id: first.id, seen: now - 45 * 60_000 }, now).isNew).toBe(true);
  });

  it("describes unique visitors honestly", () => {
    expect(UNIQUE_VISITOR_DEFINITION).toMatch(/approximation/i);
    expect(UNIQUE_VISITOR_DEFINITION).not.toMatch(/guaranteed/i);
  });
});

describe("privacy signals", () => {
  it("opts the browser out entirely", () => {
    expect(privacySignalOptsOut({ doNotTrack: "1" })).toBe(true);
    expect(privacySignalOptsOut({ globalPrivacyControl: true })).toBe(true);
    expect(privacySignalOptsOut({ doNotTrack: null })).toBe(false);
  });
});

describe("bot and environment exclusion", () => {
  it("keeps development and preview traffic out of production numbers", () => {
    expect(classifyEnvironment("localhost")).toBe("development");
    expect(classifyEnvironment("id-preview--5b8080b6.lovable.app")).toBe("preview");
    expect(classifyEnvironment("project--abc-dev.lovable.app")).toBe("preview");
    expect(classifyEnvironment("home-stash-link.lovable.app")).toBe("production");
  });

  it("screens obvious automation without hard-coding a personal address", () => {
    expect(looksLikeBot("Mozilla/5.0 (compatible; Googlebot/2.1)", false)).toBe(true);
    expect(looksLikeBot("HeadlessChrome/120", false)).toBe(true);
    expect(looksLikeBot("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)", true)).toBe(true);
    expect(looksLikeBot("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari", false)).toBe(false);
  });

  it("classifies device coarsely only", () => {
    expect(classifyDevice("Mozilla/5.0 (iPhone) Mobile", 390)).toBe("mobile");
    expect(classifyDevice("Mozilla/5.0 (iPad)", 820)).toBe("tablet");
    expect(classifyDevice("Mozilla/5.0 (Macintosh)", 1440)).toBe("desktop");
  });
});

describe("campaign tags", () => {
  it("reads only the three utm fields and bounds them", () => {
    const campaign = readCampaign("?utm_source=newsletter&utm_medium=email&utm_campaign=pilot&q=secret");
    expect(campaign).toEqual({
      utm_source: "newsletter",
      utm_medium: "email",
      utm_campaign: "pilot",
    });
  });
});

describe("reporting conventions", () => {
  it("reports in UK time and prunes granular events", () => {
    expect(REPORTING_TIMEZONE).toBe("Europe/London");
    expect(ANALYTICS_RETENTION_DAYS).toBeLessThanOrEqual(400);
  });
});

describe("passive cost", () => {
  it("never imports AI, vision or model code", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/lib/analytics/tracker.ts", "utf8");
    expect(source).not.toMatch(/spacefit|useSpaceFitVision|livescan|tensorflow|@huggingface/i);
    // measurement is deferred off the render path
    expect(source).toMatch(/requestIdleCallback/);
  });
});
