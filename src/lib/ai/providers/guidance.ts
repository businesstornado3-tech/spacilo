/**
 * Guidance intelligence (Phase 6B).
 *
 * Booking advice, inventory assistance, reply suggestions and notification
 * triage. Everything here proposes; the person always decides.
 */
import { explain, factor } from "../core/explain";
import { registerAiProvider } from "../core/provider-manager";
import type { AiProvider } from "../core/types";

const ENGINE_MODEL = "spacilo-reasoning-1";

/* ------------------------------------------------------ booking advice */

export interface BookingAdviceInput {
  spaceTitle?: string;
  spaceType?: string;
  usableVolumeM3?: number;
  inventoryVolumeM3: number;
  itemCount: number;
  heaviestItemKg?: number;
  fragileCount?: number;
  accessRoute?: "level" | "steps" | "narrow" | "unknown";
  groundFloor?: boolean;
  doorWidthCm?: number;
  hasShelving?: boolean;
  distanceMiles?: number;
  suitabilityScore?: number;
}

export type VehicleSize = "car" | "estate" | "small_van" | "transit_van" | "luton_van" | "two_trips";

export interface BookingAdvice {
  whyRecommended: string[];
  packingAdvice: string[];
  vehicle: { size: VehicleSize; label: string; note: string };
  loadingOrder: string[];
  fragileReminders: string[];
  heavyItemPlacement: string[];
  accessNotes: string[];
  estimatedUnloadingMinutes: number;
}

const VEHICLES: Array<{ maxM3: number; size: VehicleSize; label: string; note: string }> = [
  { maxM3: 1.2, size: "car", label: "A family car", note: "Fold the rear seats down and it should go in one trip." },
  { maxM3: 2.5, size: "estate", label: "An estate car", note: "One trip with the seats down." },
  { maxM3: 5, size: "small_van", label: "A small van", note: "A short-wheelbase van is the easiest option." },
  { maxM3: 10, size: "transit_van", label: "A transit-size van", note: "One trip if you load carefully." },
  { maxM3: 18, size: "luton_van", label: "A Luton van", note: "A tail lift makes the heavy items much easier." },
  { maxM3: Infinity, size: "two_trips", label: "A Luton van, twice", note: "Plan for two trips or a small removals firm." },
];

export function buildBookingAdvice(input: BookingAdviceInput): BookingAdvice {
  const vehicle = VEHICLES.find((entry) => input.inventoryVolumeM3 <= entry.maxM3) ?? VEHICLES.at(-1)!;

  const whyRecommended: string[] = [];
  if (input.usableVolumeM3 && input.usableVolumeM3 >= input.inventoryVolumeM3 * 1.25) {
    whyRecommended.push(
      `There is room for everything, with ${(input.usableVolumeM3 - input.inventoryVolumeM3 * 1.25).toFixed(1)} m³ to spare once packed.`,
    );
  }
  if ((input.suitabilityScore ?? 0) >= 80) whyRecommended.push("Spacilo rates this a strong fit for your belongings.");
  if (input.groundFloor || input.accessRoute === "level") whyRecommended.push("Level, ground-floor access makes the handover quicker.");
  if (input.hasShelving) whyRecommended.push("Existing shelving means boxes stay off the floor.");
  if (input.distanceMiles !== undefined && input.distanceMiles <= 5) {
    whyRecommended.push(`It is ${input.distanceMiles.toFixed(1)} miles away, so returning for items is easy.`);
  }

  const packingAdvice = [
    "Use uniform boxes where you can — they stack squarely and waste less space.",
    "Label every box on two sides so you can read them once they are stacked.",
    "Fill boxes completely; part-filled boxes collapse under weight.",
  ];
  if (input.hasShelving) packingAdvice.push("Put lighter, frequently needed boxes on the shelving.");
  if (input.doorWidthCm && input.doorWidthCm < 90) {
    packingAdvice.push(`The doorway is ${input.doorWidthCm} cm, so dismantle anything wider before you arrive.`);
  }

  const loadingOrder = [
    "Load the things you will not need first — they go to the back.",
    "Heavy, sturdy items next, at floor level along the walls.",
    "Furniture upright against the sides to keep the middle clear.",
    "Boxes stacked heaviest at the bottom, lightest on top.",
    "Anything you may want soon stays by the door.",
  ];

  const fragileReminders = (input.fragileCount ?? 0) > 0
    ? [
        `You have ${input.fragileCount} fragile item${input.fragileCount === 1 ? "" : "s"} — pack them last and unload them first.`,
        "Never stack anything on a box marked fragile.",
        "Wrap glass and screens in blankets rather than bubble wrap alone.",
      ]
    : ["Mark anything breakable clearly, even if it is not on your list yet."];

  const heavyItemPlacement = (input.heaviestItemKg ?? 0) > 30
    ? [
        `Your heaviest item is around ${input.heaviestItemKg} kg — keep it at floor level.`,
        "Two people for anything over 25 kg; lift with your legs, not your back.",
        input.accessRoute === "steps"
          ? "There are steps on the route, so consider a sack truck with stair glides."
          : "A sack truck will save your back on the longer carries.",
      ]
    : ["Keep the heaviest boxes at floor level so the stack stays stable."];

  const accessNotes: string[] = [];
  if (input.accessRoute === "steps") accessNotes.push("The route includes steps — allow extra time at the handover.");
  if (input.accessRoute === "narrow") accessNotes.push("The route is narrow, so bring fewer, smaller loads.");
  accessNotes.push("Agree the arrival time with your host in messages before the day.");
  accessNotes.push("Photograph everything at the handover — both of you will have a record.");

  const minutes = Math.round(20 + input.itemCount * 1.5 + input.inventoryVolumeM3 * 4 + (input.accessRoute === "steps" ? 20 : 0));

  return {
    whyRecommended,
    packingAdvice,
    vehicle: { size: vehicle.size, label: vehicle.label, note: vehicle.note },
    loadingOrder,
    fragileReminders,
    heavyItemPlacement,
    accessNotes,
    estimatedUnloadingMinutes: minutes,
  };
}

export const bookingAssistantProvider: AiProvider<BookingAdviceInput, BookingAdvice> = {
  id: "spacilo-booking-assistant",
  kind: "llm",
  model: ENGINE_MODEL,
  remote: false,
  capabilities: ["booking-assistant"],
  async run(input) {
    const result = buildBookingAdvice(input);
    const confidence = input.usableVolumeM3 ? 0.8 : 0.65;
    return {
      result,
      confidence,
      explanation: explain({
        reason: `Advice for moving about ${input.inventoryVolumeM3.toFixed(1)} m³ into this space.`,
        confidence,
        factors: [
          factor("Vehicle", result.vehicle.label, 0.5),
          factor("Unloading time", `about ${result.estimatedUnloadingMinutes} minutes`, 0.4),
          ...result.whyRecommended.slice(0, 2).map((entry) => factor("Fit", entry, 0.5)),
        ],
      }),
    };
  },
};

/* -------------------------------------------------- inventory assistant */

export interface InventoryAssistantInput {
  lines: Array<{ label: string; quantity: number; volumeM3?: number; weightKg?: number }>;
  /** Helps target the suggestions. */
  intent?: "household" | "moving" | "student" | "business" | "seasonal" | "general";
  rooms?: string[];
}

export interface ForgottenItem {
  label: string;
  reason: string;
  volumeM3: number;
  weightKg: number;
}

export interface InventoryAssistance {
  suggestions: ForgottenItem[];
  missingVolumeM3: number;
  missingWeightKg: number;
  packingComplexity: "simple" | "moderate" | "involved";
  complexityReasons: string[];
  currentVolumeM3: number;
  currentWeightKg: number;
}

const COMMON_ITEMS: Array<ForgottenItem & { intents: string[] }> = [
  { label: "Wardrobe", reason: "Bedroom furniture is the item most often left off a list.", volumeM3: 1.6, weightKg: 55, intents: ["household", "moving"] },
  { label: "Mirror", reason: "Mirrors need flat, protected storage and are easy to overlook.", volumeM3: 0.15, weightKg: 8, intents: ["household", "moving"] },
  { label: "Lamps", reason: "Floor and table lamps take more room than people expect.", volumeM3: 0.25, weightKg: 4, intents: ["household", "moving", "student"] },
  { label: "Suitcases", reason: "Useful for packing clothes, and they need storing too.", volumeM3: 0.5, weightKg: 10, intents: ["household", "moving", "student"] },
  { label: "Office chair", reason: "Chairs rarely stack and take up floor space.", volumeM3: 0.5, weightKg: 12, intents: ["household", "business", "student"] },
  { label: "Monitor", reason: "Screens need boxing upright and away from damp.", volumeM3: 0.1, weightKg: 5, intents: ["business", "student", "household"] },
  { label: "Bedding and linen", reason: "Bulky but light — good for filling gaps between furniture.", volumeM3: 0.6, weightKg: 12, intents: ["household", "moving", "student"] },
  { label: "Vacuum cleaner", reason: "Awkward shape, usually remembered on the day.", volumeM3: 0.2, weightKg: 7, intents: ["household", "moving"] },
  { label: "Curtains and blinds", reason: "Often taken down at the last minute.", volumeM3: 0.2, weightKg: 6, intents: ["moving"] },
  { label: "Filing boxes", reason: "Paperwork adds up quickly for business storage.", volumeM3: 0.3, weightKg: 15, intents: ["business"] },
  { label: "Garden furniture", reason: "Moves into storage over the winter.", volumeM3: 1.2, weightKg: 30, intents: ["seasonal", "household"] },
  { label: "Bicycle", reason: "Frequently stored separately and then forgotten.", volumeM3: 0.8, weightKg: 14, intents: ["household", "student", "seasonal"] },
];

export function assistInventory(input: InventoryAssistantInput): InventoryAssistance {
  const intent = input.intent ?? "household";
  const present = new Set(input.lines.map((line) => line.label.toLowerCase()));

  const suggestions = COMMON_ITEMS.filter(
    (item) => item.intents.includes(intent) && ![...present].some((label) => label.includes(item.label.toLowerCase())),
  )
    .slice(0, 6)
    .map(({ intents: _intents, ...item }) => item);

  const currentVolumeM3 = Number(
    input.lines.reduce((sum, line) => sum + (line.volumeM3 ?? 0) * line.quantity, 0).toFixed(2),
  );
  const currentWeightKg = Number(
    input.lines.reduce((sum, line) => sum + (line.weightKg ?? 0) * line.quantity, 0).toFixed(1),
  );

  const totalItems = input.lines.reduce((sum, line) => sum + line.quantity, 0);
  const complexityReasons: string[] = [];
  let score = 0;
  if (totalItems > 40) {
    score += 2;
    complexityReasons.push(`${totalItems} items to move`);
  } else if (totalItems > 15) {
    score += 1;
    complexityReasons.push(`${totalItems} items to move`);
  }
  if (currentVolumeM3 > 12) {
    score += 2;
    complexityReasons.push(`${currentVolumeM3} m³ of belongings`);
  } else if (currentVolumeM3 > 5) {
    score += 1;
  }
  if (currentWeightKg > 400) {
    score += 1;
    complexityReasons.push("heavy overall load");
  }

  return {
    suggestions,
    missingVolumeM3: Number(suggestions.reduce((sum, item) => sum + item.volumeM3, 0).toFixed(2)),
    missingWeightKg: Number(suggestions.reduce((sum, item) => sum + item.weightKg, 0).toFixed(1)),
    packingComplexity: score >= 4 ? "involved" : score >= 2 ? "moderate" : "simple",
    complexityReasons,
    currentVolumeM3,
    currentWeightKg,
  };
}

export const inventoryAssistantProvider: AiProvider<InventoryAssistantInput, InventoryAssistance> = {
  id: "spacilo-inventory-assistant",
  kind: "llm",
  model: ENGINE_MODEL,
  remote: false,
  capabilities: ["inventory-assistant"],
  async run(input) {
    const result = assistInventory(input);
    return {
      result,
      confidence: 0.7,
      explanation: explain({
        reason: result.suggestions.length
          ? `${result.suggestions.length} item${result.suggestions.length === 1 ? "" : "s"} people commonly forget for this kind of move.`
          : "Your list already covers the usual items.",
        confidence: 0.7,
        factors: [
          factor("On your list", `${result.currentVolumeM3} m³`, 0.5),
          factor("Possibly missing", `${result.missingVolumeM3} m³`, 0.4),
          factor("Packing", result.packingComplexity, 0.3),
        ],
      }),
    };
  },
};

/* ------------------------------------------------------ message assist */

export type MessageScenario =
  | "booking_acceptance"
  | "booking_decline"
  | "arrival_instructions"
  | "access_information"
  | "thank_you"
  | "extension_approval"
  | "general_reply";

export interface MessageAssistInput {
  scenario: MessageScenario;
  role: "host" | "renter";
  /** Optional facts the reply may reference. Never invented. */
  facts?: {
    counterpartName?: string;
    spaceTitle?: string;
    startDate?: string;
    accessSummary?: string;
    parkingNote?: string;
    extensionUntil?: string;
    declineReason?: string;
  };
}

export interface MessageSuggestion {
  id: string;
  tone: "warm" | "neutral" | "brief";
  text: string;
}

export interface MessageAssistOutput {
  suggestions: MessageSuggestion[];
  /** Always true: nothing is ever sent without the person approving it. */
  requiresApproval: true;
}

export function suggestReplies(input: MessageAssistInput): MessageAssistOutput {
  const name = input.facts?.counterpartName ? ` ${input.facts.counterpartName}` : "";
  const space = input.facts?.spaceTitle ?? "the space";
  const start = input.facts?.startDate ? ` from ${input.facts.startDate}` : "";
  const access = input.facts?.accessSummary ?? "";
  const parking = input.facts?.parkingNote ?? "";

  const bank: Record<MessageScenario, string[]> = {
    booking_acceptance: [
      `Hello${name}, thanks for your request — I am happy to accept. ${space} is yours${start}. Let me know roughly what time suits for the handover.`,
      `Hi${name}, that works for me. I have accepted the booking${start}. I will send access details closer to the day.`,
      `Accepted — see you${start}.`,
    ],
    booking_decline: [
      `Hello${name}, thank you for asking. Unfortunately I cannot take this booking${input.facts?.declineReason ? ` — ${input.facts.declineReason}` : ""}. I hope you find somewhere suitable.`,
      `Hi${name}, sorry, the space is not available for those dates. Do ask again another time.`,
      `Sorry, I have to decline this one.`,
    ],
    arrival_instructions: [
      `Hello${name}, looking forward to the handover. ${access ? `${access}. ` : ""}${parking ? `${parking}. ` : ""}Message me when you set off and I will meet you.`,
      `Hi${name}, on the day please come to the main entrance and give me a ring. ${parking}`,
      `See you on the day — ${access || "I will meet you at the entrance"}.`,
    ],
    access_information: [
      `Hello${name}, here is how access works: ${access || "please arrange times with me in advance"}. ${parking}`,
      `Hi${name}, access is ${access || "by arrangement"}. Just message me a day ahead and I will make sure it is clear.`,
      `Access: ${access || "by arrangement"}.`,
    ],
    thank_you: [
      `Thank you${name} — it was good to have you storing with me. You are welcome back any time.`,
      `Thanks${name}, everything looked in good order. Best of luck with the move.`,
      `Thanks${name} — all done at my end.`,
    ],
    extension_approval: [
      `Hello${name}, that is no problem. I have approved the extension${input.facts?.extensionUntil ? ` to ${input.facts.extensionUntil}` : ""}.`,
      `Hi${name}, happy to extend${input.facts?.extensionUntil ? ` until ${input.facts.extensionUntil}` : ""} — nothing else needed from you.`,
      `Extension approved.`,
    ],
    general_reply: [
      `Hello${name}, thanks for your message. I will check and come back to you today.`,
      `Hi${name}, good question — let me confirm and reply shortly.`,
      `Thanks, I will get back to you shortly.`,
    ],
  };

  const tones: Array<MessageSuggestion["tone"]> = ["warm", "neutral", "brief"];
  return {
    suggestions: bank[input.scenario].map((text, index) => ({
      id: `${input.scenario}-${index}`,
      tone: tones[index] ?? "neutral",
      text: text.replace(/\s+/g, " ").trim(),
    })),
    requiresApproval: true,
  };
}

export const messageAssistProvider: AiProvider<MessageAssistInput, MessageAssistOutput> = {
  id: "spacilo-message-assist",
  kind: "llm",
  model: ENGINE_MODEL,
  remote: false,
  capabilities: ["message-assist"],
  async run(input) {
    const result = suggestReplies(input);
    return {
      result,
      confidence: 0.7,
      explanation: explain({
        reason: "Three drafts you can edit — nothing sends until you press send.",
        confidence: 0.7,
        factors: [factor("Scenario", input.scenario.replace(/_/g, " "), 0.5)],
      }),
    };
  },
};

/* ------------------------------------------------------- notifications */

export type SmartNotificationKind =
  | "better_listing"
  | "price_reduced"
  | "host_responded"
  | "higher_rated_nearby"
  | "booking_expiring"
  | "demand_rising"
  | "more_suitable_space";

export interface NotificationCandidate {
  id: string;
  kind: SmartNotificationKind;
  title: string;
  body: string;
  /** 0–1 how useful this is to the person right now. */
  usefulness: number;
  /** Epoch ms. Older candidates lose priority. */
  createdAt?: number;
  /** Time-critical items are never suppressed by the digest cap. */
  timeCritical?: boolean;
  targetPath?: string;
}

export interface NotificationDigestInput {
  candidates: NotificationCandidate[];
  /** Kinds already sent recently, to stop repetition. */
  recentlySentKinds?: SmartNotificationKind[];
  /** Most notifications to deliver in this batch. */
  maxItems?: number;
}

export interface NotificationDigest {
  deliver: Array<NotificationCandidate & { priority: "high" | "normal" | "low"; rank: number }>;
  suppressed: Array<{ id: string; reason: string }>;
}

export function buildNotificationDigest(input: NotificationDigestInput): NotificationDigest {
  const max = input.maxItems ?? 3;
  const recent = new Set(input.recentlySentKinds ?? []);
  const suppressed: NotificationDigest["suppressed"] = [];
  const now = Date.now();

  const scored = input.candidates
    .map((candidate) => {
      const ageHours = candidate.createdAt ? (now - candidate.createdAt) / 3_600_000 : 0;
      const decay = Math.max(0.4, 1 - ageHours / 72);
      return { candidate, score: candidate.usefulness * decay + (candidate.timeCritical ? 0.5 : 0) };
    })
    .sort((a, b) => b.score - a.score);

  const deliver: NotificationDigest["deliver"] = [];
  const seenKinds = new Set<SmartNotificationKind>();

  for (const { candidate, score } of scored) {
    if (candidate.usefulness < 0.35 && !candidate.timeCritical) {
      suppressed.push({ id: candidate.id, reason: "not useful enough to interrupt" });
      continue;
    }
    if (recent.has(candidate.kind) && !candidate.timeCritical) {
      suppressed.push({ id: candidate.id, reason: "similar notification sent recently" });
      continue;
    }
    if (seenKinds.has(candidate.kind)) {
      suppressed.push({ id: candidate.id, reason: "duplicate of another item in this batch" });
      continue;
    }
    if (deliver.length >= max && !candidate.timeCritical) {
      suppressed.push({ id: candidate.id, reason: "held back to avoid notification fatigue" });
      continue;
    }
    seenKinds.add(candidate.kind);
    deliver.push({
      ...candidate,
      priority: candidate.timeCritical ? "high" : score > 0.7 ? "normal" : "low",
      rank: deliver.length + 1,
    });
  }

  return { deliver, suppressed };
}

export const notificationsProvider: AiProvider<NotificationDigestInput, NotificationDigest> = {
  id: "spacilo-notifications",
  kind: "llm",
  model: ENGINE_MODEL,
  remote: false,
  capabilities: ["notifications"],
  async run(input) {
    const result = buildNotificationDigest(input);
    return {
      result,
      confidence: 0.75,
      explanation: explain({
        reason: `Kept ${result.deliver.length} of ${input.candidates.length} notification${input.candidates.length === 1 ? "" : "s"}.`,
        confidence: 0.75,
        factors: [
          ...result.deliver.map((entry) => factor(entry.title, entry.body, 0.5)),
          ...result.suppressed.slice(0, 3).map((entry) => factor("Held back", entry.reason, -0.3)),
        ],
      }),
    };
  },
};

export function installGuidanceProviders(): void {
  registerAiProvider(bookingAssistantProvider);
  registerAiProvider(inventoryAssistantProvider);
  registerAiProvider(messageAssistProvider);
  registerAiProvider(notificationsProvider);
}
