/**
 * Canonical intent clusters.
 *
 * Many different phrasings express one underlying need. A cluster is that
 * need, plus the single canonical experience that answers it. This is what
 * stops URL proliferation: three ways of asking "how do I organise my garage?"
 * resolve to ONE destination, not three pages.
 *
 * A cluster only becomes an indexable page when `publish` is true AND the
 * indexation gates in `indexation.ts` pass.
 */
import type { CapabilityId } from "./capabilities";
import type { IntentReading } from "./intent";
import type { Objective } from "./taxonomy";

export type ClusterKind = "capability" | "problem" | "use_case" | "hybrid";

export type IntentCluster = {
  id: string;
  kind: ClusterKind;
  /** Canonical path for this need. Capability clusters point at /tools/*. */
  path: string;
  /** Under 60 characters, before the brand suffix. */
  title: string;
  /** Under 160 characters. */
  description: string;
  /** The single sentence the page must answer. */
  question: string;
  primary: CapabilityId;
  secondary: readonly CapabilityId[];
  /** Objectives that resolve here. */
  objectives: readonly Objective[];
  /** Phrases that resolve here — synonyms of ONE need, not separate needs. */
  phrases: readonly string[];
  /** Whether a dedicated indexable page exists for this cluster. */
  publish: boolean;
  /** Factual sections rendered on published guide pages. */
  sections?: readonly { heading: string; body: string }[];
  faq?: readonly { question: string; answer: string }[];
};

export const CLUSTERS: readonly IntentCluster[] = [
  /* ---------------------------------------------------------- capability */
  {
    id: "capability_item_scanner",
    kind: "capability",
    path: "/tools/item-scanner",
    title: "Item Scanner",
    description: "Identify and itemise your belongings from photos, then see how much space they need.",
    question: "What do I actually have, and how much of it is there?",
    primary: "item_scanner",
    secondary: ["spaceplanner"],
    objectives: ["identify", "manage_inventory", "organise", "declutter"],
    phrases: ["what do i have", "itemise my belongings", "inventory of my things", "list what i own"],
    publish: true,
  },
  {
    id: "capability_space_scanner",
    kind: "capability",
    path: "/tools/space-scanner",
    title: "Space Scanner",
    description: "Estimate the usable space in a garage, loft, shed or spare room from photos.",
    question: "How much usable space do I actually have?",
    primary: "space_scanner",
    secondary: ["spaceplanner", "space_estimate"],
    objectives: ["measure", "estimate", "optimise_space"],
    phrases: ["how much space do i have", "measure my garage", "size of my loft"],
    publish: true,
  },
  {
    id: "capability_spaceplanner",
    kind: "capability",
    path: "/tools/spaceplanner",
    title: "SpacePlanner AI",
    description: "Work out whether your belongings fit a space, and how to arrange them so they do.",
    question: "Will my things fit, and how should they be arranged?",
    primary: "spaceplanner",
    secondary: ["item_scanner", "location_search"],
    objectives: ["plan", "fit", "optimise_space"],
    phrases: ["will it fit", "how do i fit", "arrange my things", "storage layout"],
    publish: true,
  },
  {
    id: "capability_space_estimate",
    kind: "capability",
    path: "/tools/space-estimate",
    title: "Space Estimate",
    description: "See what a garage, loft or spare room you are not using could be worth as storage.",
    question: "What could my unused space be worth?",
    primary: "space_estimate",
    secondary: ["space_scanner"],
    objectives: ["earn", "list_space", "estimate"],
    phrases: ["make money from my garage", "rent out my spare room", "monetise unused space"],
    publish: true,
  },
  {
    id: "capability_location_search",
    kind: "capability",
    path: "/tools/location-search",
    title: "Location Search",
    description: "Find storage space published by hosts near you, with distance, price and fit shown.",
    question: "Where can I actually store my things?",
    primary: "location_search",
    secondary: ["spaceplanner"],
    objectives: ["find", "store", "compare"],
    phrases: ["storage near me", "where can i store", "find storage"],
    publish: true,
  },

  /* ------------------------------------------------------------- problem */
  {
    id: "problem_how_much_storage",
    kind: "problem",
    path: "/guides/how-much-storage-do-i-need",
    title: "How much storage space do I need?",
    description: "Work out the storage space your belongings need, from a real list of what you have.",
    question: "How much storage space do my belongings need?",
    primary: "item_scanner",
    secondary: ["spaceplanner", "location_search"],
    objectives: ["estimate", "measure", "plan"],
    phrases: [
      "how much storage do i need",
      "how much space do i need",
      "how much room do i need",
      "storage space for a 3 bed house",
      "how much space do 50 boxes need",
      "how much room for moving boxes",
    ],
    publish: true,
    sections: [
      {
        heading: "Start from what you actually have",
        body: "A storage estimate is only as good as the list behind it. Photograph your belongings and let EarnRoom AI propose the items and their approximate sizes, then correct anything it has wrong. The volume is calculated from the list you confirmed — not from a generic guess about your home.",
      },
      {
        heading: "Add a packing allowance",
        body: "Belongings never stack to their exact volume. EarnRoom applies a packing allowance on top of the raw item volume so the figure reflects a space you can actually load and walk into, rather than a theoretical cube.",
      },
      {
        heading: "Check it against a real space",
        body: "Once you know the volume you need, SpacePlanner checks it against a specific space — one you scanned yourself, or one published on EarnRoom — and shows whether it fits and what is left over.",
      },
    ],
    faq: [
      {
        question: "Do I need to measure everything myself?",
        answer:
          "No. EarnRoom AI proposes sizes from your photos and you correct them. The figures are estimates you confirm, not measurements.",
      },
      {
        question: "Is the estimate a quote?",
        answer:
          "No. It is a space requirement in cubic metres. Prices depend on the individual space you choose on the marketplace.",
      },
    ],
  },
  {
    id: "problem_organise_belongings",
    kind: "problem",
    path: "/guides/organise-your-belongings",
    title: "How to organise your belongings",
    description: "Get a clear list of what you own, what it takes up, and where it could go.",
    question: "How do I get my belongings under control?",
    primary: "item_scanner",
    secondary: ["spaceplanner"],
    objectives: ["organise", "identify", "declutter", "manage_inventory"],
    phrases: [
      "how do i organise my stuff",
      "best way to organise belongings",
      "organise my things",
      "declutter my house",
      "sort out my belongings",
    ],
    publish: true,
    sections: [
      {
        heading: "Step one: see what you have",
        body: "Most people underestimate both how much they own and how much room it takes. The Item Scanner turns photos into a reviewed list with quantities and approximate sizes, which is the only reliable starting point.",
      },
      {
        heading: "Step two: decide what stays close",
        body: "Once the list exists, splitting it is straightforward: things you use, things you use seasonally, and things you simply need to keep. Only the last two groups usually need to leave the house.",
      },
      {
        heading: "Step three: place it somewhere sensible",
        body: "SpacePlanner arranges what is left into a specific space, so you can see whether the loft is enough or whether you need somewhere else. If you need somewhere else, Location Search shows what is actually published near you.",
      },
    ],
  },
  {
    id: "problem_maximise_space",
    kind: "problem",
    path: "/guides/make-the-most-of-your-space",
    title: "How to make the most of a space",
    description: "Understand the usable volume in a garage, loft or room and plan what goes in it.",
    question: "How do I get more out of the space I already have?",
    primary: "space_scanner",
    secondary: ["spaceplanner", "space_estimate"],
    objectives: ["optimise_space", "measure", "free_up_space"],
    phrases: [
      "maximise my garage",
      "make the most of my garage",
      "how to organise a garage",
      "get more space out of",
      "use my loft better",
    ],
    publish: true,
    sections: [
      {
        heading: "Usable space is not floor area",
        body: "A garage's floor area tells you very little. Access width, ceiling height, the boiler in the corner and the bikes by the door all reduce what you can genuinely use. The Space Scanner estimates usable volume rather than the raw footprint.",
      },
      {
        heading: "Plan before you move anything",
        body: "SpacePlanner arranges your items inside the scanned space, so you find out whether the plan works before you spend a Saturday carrying furniture.",
      },
      {
        heading: "If space is left over",
        body: "Space you genuinely do not need can be listed on EarnRoom. Space Estimate gives a price range for that specific space, based on its own characteristics.",
      },
    ],
  },
  {
    id: "problem_earn_from_unused_space",
    kind: "problem",
    path: "/guides/earn-from-unused-space",
    title: "Earn from space you are not using",
    description: "See what an empty garage, loft or spare room could be worth, then list it if it suits you.",
    question: "Could the space I am not using be worth something?",
    primary: "space_estimate",
    secondary: ["space_scanner"],
    objectives: ["earn", "list_space", "free_up_space"],
    phrases: [
      "make money from my garage",
      "make money from unused space",
      "earn from spare room",
      "rent out my garage for storage",
      "side income from storage space",
      "how can i earn extra income from my house",
    ],
    publish: true,
    sections: [
      {
        heading: "What an estimate is — and is not",
        body: "Space Estimate produces a monthly price range for your specific space from its size, type and access. It is a starting point for your own pricing decision. It is not an offer, a guarantee, or a prediction of how much demand exists where you live.",
      },
      {
        heading: "What hosting actually involves",
        body: "You set the price, you decide what you will accept, and you agree handover and collection with the renter. Payments run through EarnRoom, and a host payout is released after the agreed hold period once the booking has started.",
      },
      {
        heading: "Nothing is earned until a booking completes",
        body: "Listing a space costs nothing and commits you to nothing. Income only exists once a real renter books and the booking runs.",
      },
    ],
    faq: [
      {
        question: "How much will I earn?",
        answer:
          "That depends entirely on your space and on real demand in your area. EarnRoom shows an estimated price range for your space and never promises a figure.",
      },
      {
        question: "Do I have to accept everything?",
        answer: "No. You set what you will and will not store, and you approve each request yourself.",
      },
    ],
  },

  /* ------------------------------------------------------------ use case */
  {
    id: "use_case_moving_house",
    kind: "use_case",
    path: "/guides/moving-house-storage",
    title: "Storage when you are moving house",
    description: "Plan what needs to go into storage during a move, and for how long.",
    question: "Where do my things go between houses?",
    primary: "spaceplanner",
    secondary: ["item_scanner", "location_search"],
    objectives: ["move", "store", "plan", "relocate"],
    phrases: [
      "storage while moving",
      "where to store furniture while moving",
      "moving house storage",
      "storage between houses",
      "temporary storage for a move",
    ],
    publish: true,
    sections: [
      {
        heading: "Work out the volume before you book anything",
        body: "Moves go wrong when the storage is booked before the belongings are counted. Scan your items first so the space you look for is the space you actually need.",
      },
      {
        heading: "Match the duration to the move",
        body: "Storage for a move is usually short. EarnRoom hosts set their own minimum period, which is shown on each listing before you request it, so you can match the space to your dates.",
      },
      {
        heading: "Find something close to one end of the move",
        body: "Location Search shows spaces published near a postcode with approximate distance and price. Availability depends entirely on which hosts have published nearby.",
      },
    ],
  },
  {
    id: "use_case_furniture_storage",
    kind: "use_case",
    path: "/guides/furniture-storage",
    title: "Storing furniture",
    description: "What furniture storage needs in practice: volume, access, condition and fit.",
    question: "Where can I store furniture, and what does it need?",
    primary: "spaceplanner",
    secondary: ["item_scanner", "location_search"],
    objectives: ["store", "protect", "fit"],
    phrases: [
      "furniture storage",
      "where to store furniture",
      "store my sofa",
      "storage for a wardrobe",
      "somewhere to store a bed",
    ],
    publish: true,
    sections: [
      {
        heading: "Furniture is about access, not just volume",
        body: "A sofa that fits a garage may not fit through its door. EarnRoom listings publish door width and height and ground-floor access, and SpacePlanner checks the items you confirmed against those constraints.",
      },
      {
        heading: "Condition matters for long stays",
        body: "Hosts describe the condition of their space, including moisture. Read that section on a listing before committing furniture to it for months.",
      },
    ],
  },
  {
    id: "use_case_business_stock",
    kind: "use_case",
    path: "/guides/business-stock-storage",
    title: "Storing business stock",
    description: "Plan overflow space for stock and equipment, and check what fits before you commit.",
    question: "Where can I put business stock that no longer fits?",
    primary: "spaceplanner",
    secondary: ["location_search", "item_scanner"],
    objectives: ["store", "manage_inventory", "plan"],
    phrases: [
      "where can i put my business stock",
      "storage for stock",
      "too much inventory for my shop",
      "business storage space",
    ],
    publish: true,
    sections: [
      {
        heading: "Start with what the stock actually occupies",
        body: "Stock volume is easier to estimate than household belongings because it is usually boxed and repeated. Add one box type with a quantity and the requirement follows.",
      },
      {
        heading: "Check the host accepts it",
        body: "Every EarnRoom listing states which categories the host will accept and any restrictions. Business stock is only suitable where the host has said so.",
      },
    ],
  },
  {
    id: "use_case_student_storage",
    kind: "use_case",
    path: "/guides/student-storage",
    title: "Student storage between terms",
    description: "Plan practical storage for your belongings when you are away from university between terms.",
    question: "Where can I keep my things between university terms?",
    primary: "location_search",
    secondary: ["item_scanner", "spaceplanner"],
    objectives: ["store", "find", "move"],
    phrases: [
      "student storage",
      "university storage",
      "storage between terms",
      "storage between semesters",
      "store my things over summer",
    ],
    publish: true,
    sections: [
      {
        heading: "Plan for the gap between addresses",
        body: "Student storage is usually a short transition: the dates between leaving one room and arriving at the next. Start with the belongings you actually need to keep, then check the host's minimum stay and collection arrangements.",
      },
      {
        heading: "Check the space before you request it",
        body: "Photograph or list your boxes, bags and furniture so you can estimate the volume. SpacePlanner can then help you check the confirmed items against a published space before you send a request.",
      },
      {
        heading: "Availability depends on local hosts",
        body: "EarnRoom only shows spaces hosts have published. Approximate location and price are shown before a request; exact addresses are shared only after a booking is confirmed.",
      },
    ],
  },
];

const BY_ID = new Map(CLUSTERS.map((c) => [c.id, c] as const));
const BY_PATH = new Map(CLUSTERS.map((c) => [c.path, c] as const));

export function clusterById(id: string): IntentCluster | null {
  return BY_ID.get(id) ?? null;
}

export function clusterByPath(path: string): IntentCluster | null {
  return BY_PATH.get(path) ?? null;
}

/** Published guide clusters only — capability clusters live under /tools. */
export const GUIDE_CLUSTERS = CLUSTERS.filter((c) => c.publish && c.path.startsWith("/guides/"));

export function guideBySlug(slug: string): IntentCluster | null {
  return GUIDE_CLUSTERS.find((c) => c.path === `/guides/${slug}`) ?? null;
}

/**
 * Finds the canonical cluster for a reading. Phrase evidence wins over
 * objective overlap, so synonyms of one need converge on one destination.
 */
export function matchCluster(reading: IntentReading): { cluster: IntentCluster; score: number } | null {
  let best: { cluster: IntentCluster; score: number } | null = null;

  for (const cluster of CLUSTERS) {
    let score = 0;
    for (const problem of reading.problems) {
      if (cluster.id === "problem_earn_from_unused_space" && ["underused_space", "monetisation_unknown"].includes(problem.value)) score += 0.9 * problem.weight;
      if (cluster.id === "use_case_business_stock" && ["business_overflow", "excess_inventory", "commercial_space_optimisation"].includes(problem.value)) score += 0.9 * problem.weight;
      if (cluster.id === "use_case_student_storage" && reading.segment === "student" && problem.value === "transition") score += 0.9 * problem.weight;
    }
    if (cluster.id === "use_case_business_stock" && reading.segment === "business") score += 1.8;
    if (cluster.id === "use_case_student_storage" && reading.segment === "student") score += 1.8;
    for (const phrase of cluster.phrases) {
      if (reading.query.includes(phrase)) score += 1;
      // Partial credit when most words of a cluster phrase appear.
      else {
        const words = phrase.split(" ").filter((w) => w.length > 3);
        if (words.length >= 2 && words.every((w) => reading.query.includes(w))) score += 0.6;
      }
    }
    for (const objective of reading.objectives) {
      if (cluster.objectives.includes(objective.value)) score += 0.35 * objective.weight;
    }
    if (score <= 0) continue;
    if (!best || score > best.score || (score === best.score && cluster.id < best.cluster.id)) {
      best = { cluster, score: Math.round(score * 100) / 100 };
    }
  }

  return best;
}
