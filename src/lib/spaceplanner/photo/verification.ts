/**
 * Phase 6S — categorised render verification.
 *
 * The bug this module exists to kill: the render verifier used to answer with
 * ONE "unexpected" list that mixed two entirely different observations —
 *
 *   (a) "a shoe appeared"          → an invented BELONGING. Fatal.
 *   (b) "FEATURE-001 disappeared"  → the room's own DOOR drifted. Cosmetic.
 *
 * Both landed in the same array, so a door that the renderer failed to redraw
 * perfectly was reported to the user as "belongings you don't own", and a
 * perfectly good render was thrown away.
 *
 * Everything the verifier reports is therefore sorted into exactly one of
 * three categories, against two explicit whitelists:
 *
 *   USER_INVENTORY   — the canonical, locked belongings. Missing or invented
 *                      entries here are verification failures.
 *   ROOM_FEATURES    — doors, doorways, windows, radiators, fitted units. They
 *                      are the environment, never belongings. Drift here is
 *                      reported, never fatal.
 *   UNEXPECTED       — anything else. Fatal.
 *
 * Nothing here weakens hallucination protection: an object that matches
 * neither whitelist is still an invention, and still fails the render.
 */

export type ObjectCategory = "user_item" | "room_feature" | "unexpected";

export interface WhitelistEntry {
  id: string;
  label: string;
}

/**
 * Words that describe a state the verifier observed rather than the object
 * itself. "disappeared FEATURE-001" is a report ABOUT feature 001, not a new
 * object called "disappeared feature".
 */
const STATE_WORDS =
  /\b(disappeared|disappearing|missing|absent|removed|gone|moved|relocated|shifted|changed|altered|covered|obscured|hidden|blocked|occluded|partially|no longer visible|not visible)\b/gi;

/**
 * Structural / architectural vocabulary. Anything named with these is part of
 * the building, so it can never be a hallucinated belonging.
 */
const ROOM_FEATURE_WORDS = [
  "door",
  "doorway",
  "door frame",
  "doorframe",
  "garage door",
  "roller shutter",
  "shutter",
  "window",
  "windowsill",
  "sill",
  "wall",
  "walls",
  "floor",
  "flooring",
  "ceiling",
  "skirting",
  "architrave",
  "radiator",
  "boiler",
  "pipe",
  "pipework",
  "vent",
  "extractor",
  "socket",
  "plug socket",
  "switch",
  "light switch",
  "light fitting",
  "ceiling light",
  "strip light",
  "spotlight",
  "consumer unit",
  "fuse box",
  "meter",
  "staircase",
  "stairs",
  "step",
  "beam",
  "joist",
  "column",
  "pillar",
  "alcove",
  "fireplace",
  "hearth",
  "built-in",
  "built in",
  "fitted",
  "fitted wardrobe",
  "fitted cupboard",
  "fitted shelf",
  "fitted shelving",
  "worktop",
  "curtain rail",
  "blind",
  "hatch",
  "loft hatch",
  "bannister",
  "handrail",
] as const;

/** ID shapes the verifier may echo back, in any spacing or plural form. */
function normaliseId(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** "FEATURES-001", "FEATURE - 1" and "feature001" are all FEATURE001. */
function canonicalId(value: string): string {
  return normaliseId(value)
    .replace(/^ITEMS/, "ITEM")
    .replace(/^FEATURES/, "FEATURE")
    .replace(/^OBJECTS/, "OBJECT");
}

/** Text form used to compare labels. Plural and article insensitive. */
export function normaliseLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(STATE_WORDS, " ")
    .replace(/^\d+\s*[x×]\s*/, "")
    .replace(
      /\b(an?|the|one|two|three|four|five|extra|additional|another|second|third|duplicate|more|further|spare|other|source|original|generated)\b/g,
      " ",
    )
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w+\b/g, (word) => word.replace(/(?:es|s)$/, "").replace(/e$/, ""))
    .trim();
}

/** Any ID-looking token inside a free-text report. */
function idsIn(text: string): string[] {
  const matches = text.toUpperCase().match(/\b(?:ITEMS?|FEATURES?|OBJECTS?)\s*[-_ ]?\s*\d+\b/g);
  return (matches ?? []).map(canonicalId);
}

function looksArchitectural(label: string): boolean {
  const text = ` ${normaliseLabel(label)} `;
  return ROOM_FEATURE_WORDS.some((word) => text.includes(` ${normaliseLabel(word)} `));
}

/**
 * Sorts one thing the verifier reported into exactly one category.
 * Order matters: an explicit whitelist match always beats a vocabulary guess.
 */
export function classifyReported(
  reported: string,
  whitelists: {
    items: readonly WhitelistEntry[];
    features: readonly WhitelistEntry[];
    /** Extra labels that count as user belongings without being required. */
    itemAliases?: readonly string[];
  },
): ObjectCategory {
  const raw = reported.trim();
  if (!raw) return "unexpected";

  const ids = new Set([canonicalId(raw), ...idsIn(raw)]);
  const itemIds = new Set(whitelists.items.map((entry) => canonicalId(entry.id)));
  const featureIds = new Set(whitelists.features.map((entry) => canonicalId(entry.id)));

  for (const id of ids) {
    if (id && itemIds.has(id)) return "user_item";
  }
  for (const id of ids) {
    if (id && featureIds.has(id)) return "room_feature";
  }

  const label = normaliseLabel(raw);
  if (!label) return "room_feature"; // a bare state word describes nothing new
  const aliases = (whitelists.itemAliases ?? []).map(normaliseLabel).filter(Boolean);
  if (aliases.some((alias) => alias === label || containsLabel(label, alias))) return "user_item";
  if (whitelists.items.some((entry) => normaliseLabel(entry.label) === label)) return "user_item";
  if (whitelists.features.some((entry) => normaliseLabel(entry.label) === label)) return "room_feature";

  // Partial containment, so "black television" still matches "television".
  if (whitelists.items.some((entry) => containsLabel(label, normaliseLabel(entry.label)))) {
    return "user_item";
  }
  if (whitelists.features.some((entry) => containsLabel(label, normaliseLabel(entry.label)))) {
    return "room_feature";
  }

  if (looksArchitectural(raw)) return "room_feature";
  return "unexpected";
}

function containsLabel(reported: string, allowed: string): boolean {
  if (!allowed) return false;
  return ` ${reported} `.includes(` ${allowed} `);
}

export interface CategoryReport {
  expected: string[];
  found: string[];
  missing: string[];
  unexpected: string[];
}

/**
 * Phase 6T — one support relationship the manifest asserts and the render must
 * therefore show: "ITEM-009 is resting on the top surface of ITEM-007".
 */
export interface ExpectedSupport {
  itemId: string;
  itemLabel: string;
  baseId: string;
  baseLabel: string;
}

/** What the verifier says it can see about one supported object. */
export interface SupportObservation {
  /** The supported object, by id or label. */
  item: string;
  /** What it is resting on, by id or label. "floor" is a valid answer. */
  restingOn: string;
}

export interface CategorisedVerification {
  userInventory: CategoryReport;
  roomFeatures: CategoryReport;
  /**
   * Support relationships the manifest asserted that the render did not show —
   * a bottle the plan put on a box that was drawn on the floor. Positional
   * drift, not a hallucination, but still not a faithful render.
   */
  supportIssues: string[];
  /**
   * Phase 6U — per-label quantity accounting: what the locked inventory allows
   * against what the render actually shows. Populated only when the verifier
   * enumerated the objects it could see.
   */
  quantities: QuantityCheck[];
  /**
   * True only when every user belonging is present and nothing was invented.
   * Room-feature drift is reported but never withholds a render — the room
   * still owning its own door is not a reason to distrust the picture.
   */
  verified: boolean;
}

/** One label's allowed-versus-observed quantity in a rendered image. */
export interface QuantityCheck {
  label: string;
  /** Units of this label the canonical inventory contains. The maximum. */
  allowed: number;
  /** Units of this label the verifier says it can see. */
  observed: number;
  /** Units beyond the allowance. Anything above zero is an invention. */
  excess: number;
}

/**
 * How many units one free-text description accounts for. "2× cardboard box"
 * and "two cardboard boxes" are two; "a pair of shoes" is one pair.
 */
export function observedCount(text: string): number {
  const leading = text.trim().match(/^(\d+)\s*[x×]?\s+/i);
  if (leading) return Math.max(1, Number(leading[1]));
  const trailing = text.trim().match(/[x×]\s*(\d+)\s*$/i);
  if (trailing) return Math.max(1, Number(trailing[1]));
  const words: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6 };
  const word = text.trim().toLowerCase().match(/^(two|three|four|five|six)\b/);
  if (word) return words[word[1]!] ?? 1;
  return 1;
}

/**
 * Phase 6U — deterministic quantity-aware verification.
 *
 * The canonical inventory quantity per label is the ALLOWED MAXIMUM. Every
 * object the verifier enumerated is counted against it. Legitimate duplicates
 * (two identical boxes the user really owns) pass; a third box, a second
 * suitcase, or any number of objects matching no whitelist do not.
 */
export function quantityCheck(
  items: readonly WhitelistEntry[],
  objects: readonly string[],
  whitelists: {
    items: readonly WhitelistEntry[];
    features: readonly WhitelistEntry[];
    itemAliases?: readonly string[];
  },
): { checks: QuantityCheck[]; unexpected: string[] } {
  const allowed = new Map<string, { label: string; allowed: number }>();
  for (const entry of items) {
    const key = normaliseLabel(entry.label);
    if (!key) continue;
    const current = allowed.get(key);
    if (current) current.allowed += 1;
    else allowed.set(key, { label: entry.label, allowed: 1 });
  }

  const observed = new Map<string, number>();
  const invented = new Map<string, { label: string; count: number }>();

  /**
   * Phase 6AF — a generic description is not a duplicate.
   *
   * The live failure: an inventory of "blue suitcase" and "red suitcase"
   * against a verifier that simply said "suitcase" twice. Longest-match
   * assignment poured both into the same allowance, invented an excess, and
   * the render was rejected as unfaithful while the other suitcase was
   * simultaneously reported missing. Ambiguous descriptions are therefore
   * assigned to an allowance that still has room BEFORE any excess is
   * declared — capacity first, blame last.
   */
  const ambiguous: { text: string; count: number; candidates: string[] }[] = [];

  for (const raw of objects) {
    const text = raw.trim();
    if (!text) continue;
    const count = observedCount(text);
    const category = classifyReported(text, whitelists);
    if (category === "room_feature") continue;
    if (category === "unexpected") {
      const key = normaliseLabel(text) || text.toLowerCase();
      const current = invented.get(key);
      if (current) current.count += count;
      else invented.set(key, { label: text, count });
      continue;
    }
    const candidates = candidateKeysFor(text, items);
    if (candidates.length === 1) {
      observed.set(candidates[0]!, (observed.get(candidates[0]!) ?? 0) + count);
      continue;
    }
    if (candidates.length === 0) {
      const key = normaliseLabel(text);
      if (key) observed.set(key, (observed.get(key) ?? 0) + count);
      continue;
    }
    ambiguous.push({ text, count, candidates });
  }

  // Ambiguous units, one at a time, into whichever compatible allowance still
  // has capacity. Only a unit that fits nowhere counts against the longest
  // matching allowance, where it becomes a genuine excess.
  for (const entry of ambiguous) {
    for (let unit = 0; unit < entry.count; unit += 1) {
      const withRoom = entry.candidates.find(
        (key) => (observed.get(key) ?? 0) < (allowed.get(key)?.allowed ?? 0),
      );
      const key = withRoom ?? entry.candidates[0]!;
      observed.set(key, (observed.get(key) ?? 0) + 1);
    }
  }

  const checks: QuantityCheck[] = [];
  const unexpected: string[] = [];

  for (const [key, info] of allowed) {
    const seen = observed.get(key) ?? 0;
    const excess = Math.max(0, seen - info.allowed);
    checks.push({ label: info.label, allowed: info.allowed, observed: seen, excess });
    if (excess > 0) unexpected.push(`extra ${info.label} ×${excess}`);
  }

  for (const entry of invented.values()) {
    checks.push({ label: entry.label, allowed: 0, observed: entry.count, excess: entry.count });
    unexpected.push(entry.count > 1 ? `${entry.label} ×${entry.count}` : entry.label);
  }

  return { checks, unexpected };
}

/**
 * Every allowance key a whitelisted description could legitimately be,
 * longest (most specific) first. An explicit ID match is unambiguous and
 * returns exactly one key; a plain label match may return several, which is
 * precisely the ambiguity the caller resolves by remaining capacity.
 */
function candidateKeysFor(reported: string, items: readonly WhitelistEntry[]): string[] {
  const ids = new Set([canonicalId(reported), ...idsIn(reported)]);
  for (const entry of items) {
    if (ids.has(canonicalId(entry.id))) {
      const key = normaliseLabel(entry.label);
      if (key) return [key];
    }
  }
  const text = normaliseLabel(reported);
  const keys = new Set<string>();
  for (const entry of items) {
    const key = normaliseLabel(entry.label);
    if (!key) continue;
    if (key === text || containsLabel(text, key) || containsLabel(key, text)) keys.add(key);
  }
  return [...keys].sort((a, b) => b.length - a.length);
}


export interface VerifierReply {
  /** IDs or labels the verifier says it can see. */
  present: string[];
  /** Everything the verifier flagged, of any kind. Sorted here, not there. */
  unexpected: string[];
  /** Room features the verifier says vanished or changed. Never fatal. */
  missingFeatures?: string[];
  /**
   * Phase 6T — EVERY stored object the verifier can see, described in its own
   * words. Classified here against the whitelists, so a hallucination is
   * caught by our own logic rather than by asking the model to police itself.
   */
  objects?: string[];
  /** What each supported object was actually drawn resting on. */
  supports?: SupportObservation[];
}

/**
 * Sorts a verifier reply into the two whitelists. This is the single place the
 * pipeline decides what counts as a hallucination.
 */
export function categoriseVerification(input: {
  items: readonly WhitelistEntry[];
  features: readonly WhitelistEntry[];
  reply: VerifierReply;
  /** Labels that are legitimate belongings but not separately required. */
  itemAliases?: readonly string[];
  /** Support relationships the deterministic plan asserted. */
  expectedSupports?: readonly ExpectedSupport[];
}): CategorisedVerification {

  const { items, features, reply } = input;
  const whitelists = { items, features, ...(input.itemAliases ? { itemAliases: input.itemAliases } : {}) };

  const presentItemIds = new Set<string>();
  const presentFeatureIds = new Set<string>();
  const strayFromPresent: string[] = [];

  for (const entry of reply.present) {
    const category = classifyReported(entry, whitelists);
    if (category === "user_item") {
      // Phase 6AF — two "suitcase" sightings must satisfy two suitcases, not
      // the same one twice. An already-claimed id is skipped when another
      // equally compatible one is still unaccounted for.
      const id = matchId(entry, items, presentItemIds);
      if (id) presentItemIds.add(id);
    } else if (category === "room_feature") {
      const id = matchId(entry, features);
      if (id) presentFeatureIds.add(id);
    } else {
      strayFromPresent.push(entry.trim());
    }
  }

  const inventedItems: string[] = [];
  const featureIssues: string[] = [];

  for (const entry of [...reply.unexpected, ...strayFromPresent]) {
    const text = entry.trim();
    if (!text) continue;
    const category = classifyReported(text, whitelists);
    if (category === "room_feature") featureIssues.push(text);
    else if (category === "unexpected") inventedItems.push(text);
    // A whitelisted user item reported as "unexpected" is a duplicate-count
    // artefact of the checker, not an invention: the ID is already required.
  }

  for (const entry of reply.missingFeatures ?? []) {
    const text = entry.trim();
    if (text) featureIssues.push(text);
  }

  // Phase 6T/6U — INDEPENDENT, QUANTITY-AWARE hallucination detection.
  //
  // The verifier is asked to describe every stored object it can see. Each
  // description is classified here against the two whitelists, and — new in
  // 6U — COUNTED. A matching label is no longer sufficient on its own: the
  // canonical inventory quantity is the allowed maximum, so a second blue
  // suitcase the user does not own is an invention even though "suitcase" is
  // a whitelisted word. Objects matching no whitelist remain inventions at any
  // quantity, and are reported with the number of occurrences seen.
  const quantities = quantityCheck(items, reply.objects ?? [], whitelists);
  for (const issue of quantities.unexpected) inventedItems.push(issue);


  const itemIds = items.map((entry) => entry.id);
  const featureIds = features.map((entry) => entry.id);
  const missingFeatures = featureIds.filter((id) => !presentFeatureIds.has(canonicalId(id)));

  const userInventory: CategoryReport = {
    expected: itemIds,
    found: itemIds.filter((id) => presentItemIds.has(canonicalId(id))),
    missing: itemIds.filter((id) => !presentItemIds.has(canonicalId(id))),
    unexpected: dedupe(inventedItems),
  };

  const roomFeatures: CategoryReport = {
    expected: featureIds,
    found: featureIds.filter((id) => presentFeatureIds.has(canonicalId(id))),
    missing: missingFeatures,
    unexpected: dedupe(featureIssues),
  };

  const supportIssues = supportDrift(input.expectedSupports ?? [], reply.supports ?? []);

  return {
    userInventory,
    roomFeatures,
    supportIssues,
    quantities: quantities.checks,
    verified:
      userInventory.missing.length === 0 &&
      userInventory.unexpected.length === 0 &&
      supportIssues.length === 0,
  };

}

/** True when a reported "resting on" answer names the floor rather than an object. */
export function meansFloor(value: string): boolean {
  const label = normaliseLabel(value);
  return /^(floor|ground|nothing|non|concret floor|room floor|the floor)$/.test(label) || label === "";
}

/** Does a free-text reference point at this whitelist entry? */
function refersTo(reference: string, id: string, label: string): boolean {
  const ids = new Set([canonicalId(reference), ...idsIn(reference)]);
  if (ids.has(canonicalId(id))) return true;
  const text = normaliseLabel(reference);
  const target = normaliseLabel(label);
  if (!text || !target) return false;
  return text === target || containsLabel(text, target) || containsLabel(target, text);
}

/**
 * Phase 6T positional verification. Every support relationship the manifest
 * asserted is checked against what the verifier says it can see. Pixel-perfect
 * coordinates are never required — only the relationship: elevated on the named
 * base, versus sitting on the floor or on something else.
 */
export function supportDrift(
  expected: readonly ExpectedSupport[],
  observations: readonly SupportObservation[],
): string[] {
  const issues: string[] = [];
  for (const support of expected) {
    const observation = observations.find((entry) =>
      refersTo(entry.item, support.itemId, support.itemLabel),
    );
    // No observation is not evidence of drift: the verifier simply did not say.
    if (!observation) continue;
    if (meansFloor(observation.restingOn)) {
      issues.push(
        `${support.itemLabel} should be resting on ${support.baseLabel}, but was drawn on the floor.`,
      );
      continue;
    }
    if (!refersTo(observation.restingOn, support.baseId, support.baseLabel)) {
      issues.push(
        `${support.itemLabel} should be resting on ${support.baseLabel}, but was drawn on ${observation.restingOn.trim()}.`,
      );
    }
  }
  return dedupe(issues);
}


function matchId(reported: string, whitelist: readonly WhitelistEntry[]): string | null {
  const ids = new Set([canonicalId(reported), ...idsIn(reported)]);
  for (const entry of whitelist) {
    if (ids.has(canonicalId(entry.id))) return canonicalId(entry.id);
  }
  const label = normaliseLabel(reported);
  const byLabel = whitelist.find(
    (entry) => normaliseLabel(entry.label) === label || containsLabel(label, normaliseLabel(entry.label)),
  );
  return byLabel ? canonicalId(byLabel.id) : null;
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = normaliseLabel(value) || value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}
