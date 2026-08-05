/**
 * Privacy-first, first-party analytics.
 *
 * Design rules:
 *  - No third-party script, no ad network, no device fingerprinting, no
 *    cross-device or cross-site identity.
 *  - The visitor reference is an opaque random UUID held in first-party
 *    storage and ROTATED every {@link VISITOR_ROTATION_DAYS} days, so it can
 *    never accumulate into a long-term profile.
 *  - "Unique visitors" is therefore an approximation of browsers, not of
 *    people. See {@link UNIQUE_VISITOR_DEFINITION}.
 *  - A page view costs one small insert. It never loads a model, touches the
 *    camera, or runs any AI or vision work.
 *  - Browsers signalling Do Not Track / Global Privacy Control are not
 *    measured at all, and nothing is stored for them.
 */
import { supabase } from "@/integrations/supabase/client";

import {
  type AnalyticsEvent,
  type AnalyticsProps,
  isAnalyticsEvent,
  normalisePath,
  referrerHost,
  sanitiseProps,
} from "./events";

export const VISITOR_STORAGE_KEY = "spacilo.va";
export const SESSION_STORAGE_KEY = "spacilo.sa";

/** The opaque visitor reference is regenerated on this cadence. */
export const VISITOR_ROTATION_DAYS = 30;
/** A session ends after this much inactivity. */
export const SESSION_IDLE_MINUTES = 30;
/** Granular events are pruned server-side after this long. */
export const ANALYTICS_RETENTION_DAYS = 400;
/** All founder reporting is bucketed in this timezone. */
export const REPORTING_TIMEZONE = "Europe/London";

export const UNIQUE_VISITOR_DEFINITION =
  "A unique visitor is a browser that carried the same rotating first-party reference during the period. The reference rotates every 30 days and is not shared across devices or browsers, so this is an approximation of reach — not a count of individual people.";

export type AnalyticsEnvironment = "production" | "preview" | "development";
export type DeviceKind = "mobile" | "tablet" | "desktop";

/* ------------------------------------------------------------ environment */

/**
 * Keeps local and preview traffic out of the founder's production numbers
 * without ever hard-coding a personal IP address.
 */
export function classifyEnvironment(hostname: string): AnalyticsEnvironment {
  const host = hostname.toLowerCase();
  if (!host || host === "localhost" || host === "127.0.0.1" || host.endsWith(".local")) {
    return "development";
  }
  if (host.includes("id-preview--") || host.endsWith("-dev.lovable.app") || host.includes("sandbox")) {
    return "preview";
  }
  return "production";
}

const BOT_PATTERN =
  /bot|crawl|spider|slurp|bingpreview|headless|puppeteer|playwright|lighthouse|pingdom|gtmetrix|phantomjs|curl|wget|python-requests|axios|monitor/i;

/** Best-effort screen-out of obvious automated traffic. */
export function looksLikeBot(userAgent: string, webdriver: boolean): boolean {
  if (webdriver) return true;
  if (!userAgent) return true;
  return BOT_PATTERN.test(userAgent);
}

export function classifyDevice(userAgent: string, viewportWidth: number): DeviceKind {
  if (/ipad|tablet|playbook|silk/i.test(userAgent)) return "tablet";
  if (/mobi|android|iphone|ipod/i.test(userAgent)) return "mobile";
  if (viewportWidth > 0 && viewportWidth < 640) return "mobile";
  if (viewportWidth >= 640 && viewportWidth < 1024) return "tablet";
  return "desktop";
}

/** Honours Do Not Track and Global Privacy Control. */
export function privacySignalOptsOut(nav: {
  doNotTrack?: string | null | undefined;
  globalPrivacyControl?: boolean | undefined;
}): boolean {
  if (nav.globalPrivacyControl === true) return true;
  const dnt = nav.doNotTrack;
  return dnt === "1" || dnt === "yes";
}

/* ------------------------------------------------------------ identifiers */

interface StoredVisitor {
  id: string;
  issued: number;
}

function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Deterministic-shaped fallback for environments without randomUUID.
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(bytes);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Pure rotation policy, unit-tested without touching storage. */
export function resolveVisitorRef(
  stored: StoredVisitor | null,
  now: number,
): { id: string; issued: number; rotated: boolean } {
  const maxAge = VISITOR_ROTATION_DAYS * 24 * 60 * 60 * 1000;
  if (stored && stored.id && now - stored.issued < maxAge) {
    return { id: stored.id, issued: stored.issued, rotated: false };
  }
  return { id: randomId(), issued: now, rotated: true };
}

interface StoredSession {
  id: string;
  seen: number;
}

export function resolveSessionRef(
  stored: StoredSession | null,
  now: number,
): { id: string; seen: number; isNew: boolean } {
  const idle = SESSION_IDLE_MINUTES * 60 * 1000;
  if (stored && stored.id && now - stored.seen < idle) {
    return { id: stored.id, seen: now, isNew: false };
  }
  return { id: randomId(), seen: now, isNew: true };
}

function readJson<T>(store: Storage | null, key: string): T | null {
  if (!store) return null;
  try {
    const raw = store.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(store: Storage | null, key: string, value: unknown): void {
  if (!store) return;
  try {
    store.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable (private mode, quota) — measurement is optional */
  }
}

/* ------------------------------------------------------------ campaign tags */

export function readCampaign(search: string): {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
} {
  const clip = (value: string | null) => {
    const v = value?.trim().slice(0, 64);
    return v ? v : null;
  };
  try {
    const params = new URLSearchParams(search);
    return {
      utm_source: clip(params.get("utm_source")),
      utm_medium: clip(params.get("utm_medium")),
      utm_campaign: clip(params.get("utm_campaign")),
    };
  } catch {
    return { utm_source: null, utm_medium: null, utm_campaign: null };
  }
}

/* ------------------------------------------------------------ the tracker */

export interface AnalyticsContext {
  visitorRef: string;
  sessionRef: string;
  environment: AnalyticsEnvironment;
  device: DeviceKind;
  isBot: boolean;
}

let disabled = false;
let cachedUserId: string | null = null;

/** Called by the auth layer so events can be attributed to an account. */
export function setAnalyticsUser(userId: string | null): void {
  cachedUserId = userId;
}

function browserContext(): AnalyticsContext | null {
  if (typeof window === "undefined" || typeof document === "undefined") return null;
  if (disabled) return null;

  const nav = window.navigator as Navigator & { globalPrivacyControl?: boolean };
  if (privacySignalOptsOut({ doNotTrack: nav.doNotTrack, globalPrivacyControl: nav.globalPrivacyControl })) {
    disabled = true;
    return null;
  }

  const now = Date.now();
  const local = (() => {
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  })();
  const sessionStore = (() => {
    try {
      return window.sessionStorage;
    } catch {
      return null;
    }
  })();

  const visitor = resolveVisitorRef(readJson<StoredVisitor>(local, VISITOR_STORAGE_KEY), now);
  writeJson(local, VISITOR_STORAGE_KEY, { id: visitor.id, issued: visitor.issued });

  const session = resolveSessionRef(readJson<StoredSession>(sessionStore, SESSION_STORAGE_KEY), now);
  writeJson(sessionStore, SESSION_STORAGE_KEY, { id: session.id, seen: session.seen });

  const ua = nav.userAgent ?? "";
  return {
    visitorRef: visitor.id,
    sessionRef: session.id,
    environment: classifyEnvironment(window.location.hostname),
    device: classifyDevice(ua, window.innerWidth),
    isBot: looksLikeBot(ua, nav.webdriver === true),
  };
}

export interface TrackOptions {
  /** Overrides the current location; used for explicit page-view calls. */
  path?: string | undefined;
  props?: AnalyticsProps | undefined;
}

/**
 * Records one event. Never throws and never blocks rendering — analytics is
 * strictly best-effort and a failure must not affect the product.
 */
export function track(event: AnalyticsEvent, options: TrackOptions = {}): void {
  if (!isAnalyticsEvent(event)) {
    // Loud in development so taxonomy drift is caught while building, silent
    // in production so a stale name can never break the product.
    if (import.meta.env.DEV) {
      console.warn(`[analytics] "${event}" is not in ANALYTICS_EVENTS — event dropped.`);
    }
    return;
  }
  const context = browserContext();
  if (!context) return;

  const path = normalisePath(options.path ?? window.location.pathname);
  const campaign = readCampaign(window.location.search);

  const row = {
    event_name: event,
    visitor_ref: context.visitorRef,
    session_ref: context.sessionRef,
    user_id: cachedUserId,
    path,
    referrer_host: referrerHost(document.referrer ?? "", window.location.hostname),
    device: context.device,
    environment: context.environment,
    is_bot: context.isBot,
    props: sanitiseProps(options.props),
    ...campaign,
  };

  const send = () => {
    void supabase
      .from("analytics_events")
      .insert(row)
      .then(({ error }) => {
        if (error && import.meta.env.DEV) {
          console.debug("[analytics] not recorded:", error.message);
        }
      });
  };

  // Yield to the browser so measurement never competes with paint.
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(send, { timeout: 2000 });
  } else {
    window.setTimeout(send, 0);
  }
}

/** Convenience wrapper for the most common event. */
export function trackPageView(path?: string, props?: AnalyticsProps): void {
  track("page_view", { path, props });
}
