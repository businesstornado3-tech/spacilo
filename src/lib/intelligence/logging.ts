/**
 * Intelligence logging.
 *
 * Structured, privacy-safe breadcrumbs for AI work. Photos, filenames, free
 * text and identifiers never enter a log line — only capability, provider,
 * timing and counts. In production the sink is silent by default; diagnostics
 * read the buffer instead.
 */
import type { IntelligenceCapability } from "./contracts";

export type LogLevel = "info" | "warn" | "error";

export interface IntelligenceLogEntry {
  level: LogLevel;
  message: string;
  capability: IntelligenceCapability;
  provider: string;
  at: number;
  detail?: Record<string, number | string | boolean>;
}

const buffer: IntelligenceLogEntry[] = [];
const MAX_ENTRIES = 100;

let verbose = false;

/** Turns console output on — used by diagnostics screens and tests. */
export function setIntelligenceVerbose(next: boolean): void {
  verbose = next;
}

export function logIntelligence(entry: Omit<IntelligenceLogEntry, "at">): void {
  const full: IntelligenceLogEntry = { ...entry, at: Date.now() };
  buffer.push(full);
  if (buffer.length > MAX_ENTRIES) buffer.shift();
  if (!verbose) return;
  const line = `[spacilo-ai] ${full.capability}/${full.provider} ${full.message}`;
  if (full.level === "error") console.error(line, full.detail ?? {});
  else if (full.level === "warn") console.warn(line, full.detail ?? {});
  else console.info(line, full.detail ?? {});
}

export function intelligenceLog(): IntelligenceLogEntry[] {
  return [...buffer];
}

export function clearIntelligenceLog(): void {
  buffer.length = 0;
}
