/**
 * Content registry — stable, human-readable identifiers.
 *
 * Every campaign and asset gets an id a founder can quote in a message:
 * ER-CAMP-2026-000001 / ER-VIDEO-2026-000001.
 */
export type RegistryKind = "CAMP" | "VIDEO" | "IMAGE" | "ARTICLE";

export function registryId(kind: RegistryKind, year: number, sequence: number): string {
  return `ER-${kind}-${year}-${String(sequence).padStart(6, "0")}`;
}

export function parseRegistryId(
  id: string,
): { kind: RegistryKind; year: number; sequence: number } | null {
  const match = /^ER-(CAMP|VIDEO|IMAGE|ARTICLE)-(\d{4})-(\d{6})$/.exec(id.trim());
  if (!match) return null;
  return { kind: match[1] as RegistryKind, year: Number(match[2]), sequence: Number(match[3]) };
}

/** Next sequence for a year given the ids already issued. */
export function nextSequence(
  kind: RegistryKind,
  year: number,
  existing: readonly string[],
): number {
  let highest = 0;
  for (const id of existing) {
    const parsed = parseRegistryId(id);
    if (parsed && parsed.kind === kind && parsed.year === year)
      highest = Math.max(highest, parsed.sequence);
  }
  return highest + 1;
}

/** ISO date (YYYY-MM-DD) for a timestamp in Europe/London. */
export function londonDate(now: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(now));
}

/** Month 1-12 in Europe/London. */
export function londonMonth(now: number): number {
  return Number(londonDate(now).slice(5, 7));
}
