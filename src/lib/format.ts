import { brand } from "@/config/brand";

/** £49 / £49.50 — UK currency, no trailing .00 */
export function formatPrice(pence: number, opts: { fromPence?: boolean } = {}) {
  const value = opts.fromPence === false ? pence : pence / 100;
  return new Intl.NumberFormat(brand.locale, {
    style: "currency",
    currency: brand.currency,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** 12 March 2026 */
export function formatDate(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(brand.locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

/** 12/03/2026 */
export function formatDateShort(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(brand.locale).format(d);
}

/** 0.6 miles away */
export function formatDistance(miles: number) {
  return `${miles.toFixed(1)} ${miles === 1 ? "mile" : "miles"} away`;
}

/** 120 sq ft */
export function formatArea(sqFt: number) {
  return `${new Intl.NumberFormat(brand.locale).format(sqFt)} sq ft`;
}

const UK_POSTCODE =
  /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i;

export function isValidUkPostcode(value: string) {
  return UK_POSTCODE.test(value.trim());
}

/** PO4 8LB — normalised UK postcode formatting */
export function formatUkPostcode(value: string) {
  const raw = value.replace(/\s+/g, "").toUpperCase();
  if (raw.length < 5) return raw;
  return `${raw.slice(0, raw.length - 3)} ${raw.slice(-3)}`;
}

/**
 * "Just now" / "5 min ago" / "Yesterday" / "12 March 2026".
 * Single relative formatter for the whole app — do not add another.
 */
export function formatRelativeTime(date: Date | string, now: Date = new Date()) {
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMs = now.getTime() - d.getTime();
  if (Number.isNaN(diffMs)) return "";
  if (diffMs < 0) return "Just now";
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return formatDate(d);
}

/** Exact, screen-reader friendly timestamp to pair with the relative label. */
export function formatDateTime(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(brand.locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}
