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
  /**
   * Phase 6AG — how many units of this object the locked inventory contains.
   * The verifier contract is OBJECT level: one row, one id, a quantity. It is
   * never asked to invent per-unit id strings like "ITEM-003_02", which the
   * compact reply schema ("never repeat a description") made impossible to
   * satisfy. Absent means one.
   */
  quantity?: number;
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

/**
 * Phase 6AI — bounded, deterministic spelling and synonym normalisation.
 *
 * The live failure: the verifier wrote "Black bagpack" for the user's own
 * black backpack, and the matcher — which only ever compared literal text —
 * called it an invention. These maps are a CLOSED list of known equivalences
 * and transcription slips. Nothing outside them is normalised, so unrelated
 * objects can never collapse into one another.
 */
const PHRASE_SYNONYMS: ReadonlyArray<[string, string]> = [
  ["back pack", "backpack"],
  ["bag pack", "backpack"],
  ["suit case", "suitcase"],
  ["lap top", "laptop"],
  ["flat screen television", "television"],
  ["flatscreen television", "television"],
  ["television set", "television"],
  ["luggage case", "suitcase"],
  ["laptop case", "laptop bag"],
  ["water bottle", "water bottle"],
];

const WORD_SYNONYMS: Readonly<Record<string, string>> = {
  tv: "television",
  telly: "television",
  televison: "television",
  bagpack: "backpack",
  backpak: "backpack",
  bakpack: "backpack",
  rucksack: "backpack",
  knapsack: "backpack",
  luggage: "suitcase",
};

function stemWord(word: string): string {
  return word.replace(/(?:es|s)$/, "").replace(/e$/, "");
}

/** The synonym map keyed by the stemmed token the normaliser actually sees. */
const STEMMED_WORD_SYNONYMS: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(WORD_SYNONYMS).map(([from, to]) => [stemWord(from), stemWord(to)]),
);

/** Text form used to compare labels. Plural, article and spelling insensitive. */
export function normaliseLabel(label: string): string {
  let text = label
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
    .replace(/\b\w+\b/g, stemWord)
    .trim();

  for (const [from, to] of PHRASE_SYNONYMS) {
    const source = from.split(" ").map(stemWord).join(" ");
    const target = to.split(" ").map(stemWord).join(" ");
    if (source === target) continue;
    text = ` ${text} `.split(` ${source} `).join(` ${target} `).trim();
  }

  return text
    .split(" ")
    .filter(Boolean)
    .map((word) => {
      const canonical = STEMMED_WORD_SYNONYMS[word];
      return canonical ? stemWord(canonical) : word;
    })
    .join(" ");
}


/**
 * Any ID-looking token inside a free-text report.
 *
 * Phase 6AG — a trailing unit suffix ("ITEM-003_02") resolves to its OBJECT
 * id. The verifier now answers at object level, but a model that still echoes
 * an older unit string must not silently fail to match.
 */
function idsIn(text: string): string[] {
  const matches = text
    .toUpperCase()
    .match(/\b(?:ITEMS?|FEATURES?|OBJECTS?)\s*[-_ ]?\s*\d+(?:\s*[-_]\s*\d+)?\b/g);
  return (matches ?? []).map((match) => {
    const trimmed = match.replace(/\s*[-_]\s*\d+\s*$/, (tail, offset: number) =>
      // Only a SECOND number group is a unit suffix; "ITEM-003" keeps its number.
      /\d/.test(match.slice(0, offset)) ? "" : tail,
    );
    return canonicalId(trimmed);
  });
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

  // Phase 6AF — and the other direction. A verifier that says "suitcase" about
  // a "blue suitcase" is describing the user's own belonging, not inventing
  // one. Whole-word containment keeps "toolbox" from matching "box".
  if (whitelists.items.some((entry) => containsLabel(normaliseLabel(entry.label), label))) {
    return "user_item";
  }
  if (whitelists.features.some((entry) => containsLabel(normaliseLabel(entry.label), label))) {
    return "room_feature";
  }

  if (looksArchitectural(raw)) return "room_feature";
  return "unexpected";
}

/**
 * Phase 6AG — words that DESCRIBE an object without changing what it is.
 *
 * A colour, a size or a material in front of a noun is the same physical
 * object seen more precisely: "blue suitcase" IS a suitcase. Any other extra
 * word makes a different, compound object: a "TV stand" is not a TV, a
 * "storage box" is not a box, and a "laptop bag" is not any bag. This single
 * distinction is what keeps the 6AF suitcase fix while restoring the
 * TV / TV-stand separation it broke.
 */
const DESCRIPTOR_WORDS: ReadonlySet<string> = new Set(
  [
    // colour
    "black", "white", "grey", "gray", "silver", "blue", "navy", "red", "green",
    "yellow", "orange", "purple", "pink", "brown", "beige", "cream", "tan",
    "gold", "golden", "bronze", "chrome", "dark", "light", "pale", "bright",
    "clear", "transparent", "patterned", "striped", "plain",
    // size
    "small", "medium", "large", "big", "little", "tall", "short", "wide",
    "narrow", "slim", "compact", "oversized", "tiny", "huge", "mini", "giant",
    // material and finish
    "plastic", "metal", "metallic", "wooden", "wood", "cardboard", "fabric",
    "leather", "canvas", "steel", "aluminium", "aluminum", "glass", "wicker",
    "rattan", "padded", "soft", "hard", "rigid",
    // condition and state
    "old", "new", "used", "worn", "spare", "folded", "stacked", "closed",
    "open", "empty", "full", "upright", "flat", "upside", "down",
  ].map((word) => normaliseLabel(word)),
);

/**
 * Does `reported` name the same object as `allowed`?
 *
 * Whole-word containment, plus the Phase 6AG head-noun rule: the longer label
 * may only add DESCRIPTOR words, and both labels must end on the same head
 * noun. "suitcase" ↔ "blue suitcase" passes; "TV" ↮ "TV stand", "bag" ↮
 * "laptop bag" and "box" ↮ "storage box" do not.
 */
function containsLabel(reported: string, allowed: string): boolean {
  if (!allowed || !reported) return false;
  if (reported === allowed) return true;
  if (!` ${reported} `.includes(` ${allowed} `)) return false;

  const reportedWords = reported.split(" ").filter(Boolean);
  const allowedWords = allowed.split(" ").filter(Boolean);
  // The head noun is the object's identity. A different head noun is a
  // different object, whatever the shorter label happens to spell.
  if (reportedWords[reportedWords.length - 1] !== allowedWords[allowedWords.length - 1]) {
    return false;
  }
  // Same head noun, so the allowance sits at the end: everything in front of
  // it is the expansion, and it must be purely descriptive.
  const extras = reportedWords.slice(0, reportedWords.length - allowedWords.length);
  return extras.every((word) => DESCRIPTOR_WORDS.has(word));
}


/**
 * Phase 6AI — generic head nouns and the specific objects they may name.
 *
 * "bag" is a legitimate way to describe a backpack; it is NOT a licence for
 * every bag-like object to satisfy every allowance. A generic description is
 * only ever resolved when EXACTLY ONE inventory object is compatible with it —
 * two candidates stay ambiguous and remain fail-closed.
 */
const HYPERNYMS: Readonly<Record<string, readonly string[]>> = {
  bag: ["backpack", "holdall", "duffel", "satchel", "handbag", "rucksack"],
  case: ["suitcase", "briefcase"],
  luggage: ["suitcase", "backpack", "holdall"],
};

const COLOUR_WORDS: ReadonlySet<string> = new Set(
  [
    "black", "white", "grey", "gray", "silver", "blue", "navy", "red", "green",
    "yellow", "orange", "purple", "pink", "brown", "beige", "cream", "tan",
    "gold", "golden", "bronze", "chrome",
  ].map((word) => normaliseLabel(word)),
);

function coloursIn(label: string): string[] {
  return label.split(" ").filter((word) => COLOUR_WORDS.has(word));
}

/** Two descriptions of one object may not disagree about its colour. */
function coloursCompatible(a: string, b: string): boolean {
  const left = coloursIn(a);
  const right = coloursIn(b);
  if (!left.length || !right.length) return true;
  return left.some((colour) => right.includes(colour));
}

function stripDescriptors(label: string): string {
  const words = label.split(" ").filter(Boolean);
  const core = words.filter((word, index) => !(DESCRIPTOR_WORDS.has(word) && index < words.length - 1));
  return (core.length ? core : words).join(" ");
}

function headNoun(label: string): string {
  const words = label.split(" ").filter(Boolean);
  return words[words.length - 1] ?? "";
}

/** Bounded, single-character transcription slack for long head nouns. */
function nearlySameWord(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 6 || b.length < 6) return false;
  if (Math.abs(a.length - b.length) > 1) return false;
  let edits = 0;
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (a.length === b.length) {
      i += 1;
      j += 1;
    } else if (a.length > b.length) i += 1;
    else j += 1;
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/**
 * Inventory objects a loose description could legitimately be naming, when no
 * strict label match exists. Returns every compatible allowance — the caller
 * only ever acts on a UNIQUE result.
 */
export function genericCandidates(
  reported: string,
  items: readonly WhitelistEntry[],
): WhitelistEntry[] {
  const text = normaliseLabel(reported);
  if (!text) return [];
  const core = stripDescriptors(text);
  const head = headNoun(core);
  if (!head) return [];
  const family = HYPERNYMS[head] ?? [];

  return items.filter((entry) => {
    const allowed = normaliseLabel(entry.label);
    if (!allowed) return false;
    if (!coloursCompatible(text, allowed)) return false;
    const allowedCore = stripDescriptors(allowed);
    const allowedHead = headNoun(allowedCore);
    // The bare head noun of a compound belonging: "bottle" for "water bottle".
    if (core === allowedHead || nearlySameWord(core, allowedHead)) return true;
    if (allowedCore.endsWith(` ${core}`) && core.split(" ").length > 1) return true;
    // A generic category word naming one specific belonging: "bag" ↔ backpack.
    if (family.some((word) => nearlySameWord(normaliseLabel(word), allowedHead))) return true;
    return false;
  });
}

/** The one inventory object a loose description unambiguously names, if any. */
function uniqueGenericMatch(
  reported: string,
  items: readonly WhitelistEntry[],
): WhitelistEntry | null {
  const candidates = genericCandidates(reported, items);
  return candidates.length === 1 ? candidates[0]! : null;
}

/**
 * Phase 6AI — why one observed description was or was not tied to a belonging.
 * Purely diagnostic: it explains a verdict, it never changes one.
 */
export interface IdentityDecision {
  observed: string;
  normalisedObserved: string;
  matchedId: string | null;
  matchedLabel: string | null;
  normalisedInventory: string | null;
  decision: "matched" | "permitted_unplaced" | "ambiguous" | "unexpected" | "room_feature";
  reason: string;
}

/**
 * Phase 6AH — an object the deterministic planner deliberately did NOT place.
 *
 * It is a real belonging of the user's that remains visible in the source
 * photograph, so the renderer may reproduce it. It is permitted, capped at the
 * quantity the planner left unplaced, and it can never satisfy a required
 * placed allowance.
 */
export interface UnplacedAllowance {
  id: string;
  label: string;
  quantity: number;
  reason?: string;
}

/** Capacity-limited claim book for intentionally unplaced belongings. */
export function unplacedLedger(unplaced: readonly UnplacedAllowance[] = []) {
  const remaining = unplaced
    .map((entry) => ({
      label: normaliseLabel(entry.label),
      original: entry.label,
      left: Math.max(0, Math.round(entry.quantity ?? 1)),
    }))
    .filter((entry) => entry.label && entry.left > 0);
  const claimed: string[] = [];
  return {
    /** Consumes up to `count` units of this description. Returns units left over. */
    claim(text: string, count = 1): number {
      let outstanding = Math.max(1, count);
      const label = normaliseLabel(text);
      if (!label) return outstanding;
      for (const entry of remaining) {
        if (outstanding <= 0) break;
        if (entry.left <= 0) continue;
        const same =
          entry.label === label ||
          containsLabel(label, entry.label) ||
          containsLabel(entry.label, label);
        if (!same) continue;
        const take = Math.min(entry.left, outstanding);
        entry.left -= take;
        outstanding -= take;
        for (let i = 0; i < take; i += 1) claimed.push(entry.original);
      }
      return outstanding;
    },
    get permitted(): string[] {
      return [...claimed];
    },
  };
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
   * Phase 6AG — allowances the render under-filled, e.g. "missing box ×1" when
   * the inventory holds three and the image shows two. Counted only when the
   * verifier actually enumerated what it saw.
   */
  quantityShortfalls: string[];
  /**
   * Phase 6AH — belongings the planner intentionally left unplaced that the
   * render still shows. Permitted, never counted as placed, never fatal.
   */
  permittedUnplaced: string[];
  /**
   * True only when every user belonging is present at the right quantity and
   * nothing was invented. Room-feature drift is reported but never withholds a
   * render — the room still owning its own door is not a reason to distrust
   * the picture.
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
  /**
   * Phase 6AG — units the allowance expects that the render did not show.
   * Quantity is reconciled in BOTH directions: three boxes drawn twice is as
   * much a failure as three boxes drawn four times.
   */
  missing: number;
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
  unplaced: readonly UnplacedAllowance[] = [],
): { checks: QuantityCheck[]; unexpected: string[]; shortfalls: string[]; permitted: string[] } {
  const allowed = new Map<string, { label: string; allowed: number }>();
  for (const entry of items) {
    const key = normaliseLabel(entry.label);
    if (!key) continue;
    // Phase 6AG — OBJECT level. One whitelist row may stand for several units,
    // so the allowance is the sum of quantities, not a count of rows.
    const units = Math.max(1, Math.round(entry.quantity ?? 1));
    const current = allowed.get(key);
    if (current) current.allowed += units;
    else allowed.set(key, { label: entry.label, allowed: units });
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
  const shortfalls: string[] = [];
  // A verifier that enumerated nothing has told us nothing. Silence is not
  // evidence of absence, so shortfalls are only counted against a real list.
  const enumerated = objects.some((entry) => entry.trim().length > 0);

  for (const [key, info] of allowed) {
    const seen = observed.get(key) ?? 0;
    const excess = Math.max(0, seen - info.allowed);
    const missing = enumerated ? Math.max(0, info.allowed - seen) : 0;
    checks.push({ label: info.label, allowed: info.allowed, observed: seen, excess, missing });
    if (excess > 0) unexpected.push(`extra ${info.label} ×${excess}`);
    if (missing > 0) shortfalls.push(`missing ${info.label} ×${missing}`);
  }

  // Phase 6AH — before anything is called an invention, the intentionally
  // unplaced belongings get their capped allowance. Excess beyond that
  // allowance stays an invention, so phantom-object protection is unchanged.
  const ledger = unplacedLedger(unplaced);
  for (const [key, entry] of [...invented.entries()]) {
    const left = ledger.claim(entry.label, entry.count);
    if (left <= 0) invented.delete(key);
    else entry.count = left;
  }

  for (const entry of invented.values()) {
    checks.push({
      label: entry.label,
      allowed: 0,
      observed: entry.count,
      excess: entry.count,
      missing: 0,
    });
    unexpected.push(entry.count > 1 ? `${entry.label} ×${entry.count}` : entry.label);
  }

  return { checks, unexpected, shortfalls, permitted: ledger.permitted };
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
  /** Belongings the deterministic planner intentionally did not place. */
  unplaced?: readonly UnplacedAllowance[];
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
  // One ledger per reported list: the two lists describe the SAME image, so a
  // sighting in each must not consume the allowance twice.
  const strayLedger = unplacedLedger(input.unplaced ?? []);

  for (const entry of [...reply.unexpected, ...strayFromPresent]) {
    const text = entry.trim();
    if (!text) continue;
    const category = classifyReported(text, whitelists);
    if (category === "room_feature") featureIssues.push(text);
    else if (category === "unexpected") {
      // Phase 6AH — a known belonging the planner left unplaced is permitted.
      if (strayLedger.claim(text, observedCount(text)) > 0) inventedItems.push(text);
    }
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
  const quantities = quantityCheck(items, reply.objects ?? [], whitelists, input.unplaced ?? []);
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
    quantityShortfalls: quantities.shortfalls,
    permittedUnplaced: dedupe([...strayLedger.permitted, ...quantities.permitted]),
    verified:
      userInventory.missing.length === 0 &&
      userInventory.unexpected.length === 0 &&
      quantities.shortfalls.length === 0 &&
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


function matchId(
  reported: string,
  whitelist: readonly WhitelistEntry[],
  claimed: ReadonlySet<string> = new Set(),
): string | null {
  const ids = new Set([canonicalId(reported), ...idsIn(reported)]);
  for (const entry of whitelist) {
    if (ids.has(canonicalId(entry.id))) return canonicalId(entry.id);
  }
  const label = normaliseLabel(reported);
  const matches = whitelist.filter((entry) => {
    const allowed = normaliseLabel(entry.label);
    // Both directions: "black television" names the television, and a bare
    // "suitcase" names one of the user's coloured suitcases.
    return allowed === label || containsLabel(label, allowed) || containsLabel(allowed, label);
  });
  const unclaimed = matches.find((entry) => !claimed.has(canonicalId(entry.id)));
  const chosen = unclaimed ?? matches[0];
  return chosen ? canonicalId(chosen.id) : null;
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
