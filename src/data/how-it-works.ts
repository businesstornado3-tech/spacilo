import { brand } from "@/config/brand";

export interface JourneyStep {
  number: number;
  title: string;
  body: string;
}

export const renterJourney: JourneyStep[] = [
  {
    number: 1,
    title: "Show us your stuff",
    body: "Use " + brand.ai + " to scan or photograph what you need to store, or add items the manual way — whichever suits you.",
  },
  {
    number: 2,
    title: "Review the result",
    body: brand.ai + " proposes the items it detects and an estimated storage requirement. Nothing is confirmed automatically — you review and correct anything that isn't right.",
  },
  {
    number: 3,
    title: "Find storage nearby",
    body: "Search available spaces in your neighbourhood, filtered to the requirement you've confirmed.",
  },
  {
    number: 4,
    title: "Understand possible fit",
    body: "Each space shows fit, policy and suitability information to help you judge whether it works for you. This is never a guarantee that your belongings will fit.",
  },
  {
    number: 5,
    title: "Ask the host",
    body: "Send a pre-booking question to the host before you commit, if anything needs clarifying.",
  },
  {
    number: 6,
    title: "Send a request",
    body: "Review the space, your declared inventory and the authoritative price, then send your request to the host.",
  },
  {
    number: 7,
    title: "Review price changes",
    body: "If the price changes before you book, you'll always be shown the new amount and asked to review it before continuing.",
  },
  {
    number: 8,
    title: "Book",
    body: "Complete your booking through our secure checkout once you're happy with everything.",
  },
];

export const hostJourney: JourneyStep[] = [
  {
    number: 1,
    title: "Show us your space",
    body: "Use " + brand.ai + " live scan, photos, or manual measurements to describe the space you have available.",
  },
  {
    number: 2,
    title: "Understand usable space",
    body: "Combine the scan with the boundary editor to define exactly what's usable. Measurements may be estimates — you can adjust them.",
  },
  {
    number: 3,
    title: "Review pricing guidance",
    body: "See honest pricing guidance based on your space and area. This is guidance only, not a promise of income.",
  },
  {
    number: 4,
    title: "Create your listing",
    body: "Review and confirm your space details before publishing your listing.",
  },
  {
    number: 5,
    title: "Complete safety declarations",
    body: "Answer the required safety declarations about your space before it can accept requests.",
  },
  {
    number: 6,
    title: "Receive requests",
    body: "See how a renter's requirement compares with your usable capacity, along with their declarations and request details.",
  },
  {
    number: 7,
    title: "Decide",
    body: "Accept or decline each request through your existing dashboard workflow.",
  },
  {
    number: 8,
    title: "Earn through completed storage",
    body: "Once a booking completes, you receive your host amount after the " + brand.name + " fee. Earnings depend on bookings you accept — nothing is guaranteed in advance.",
  },
];

export const aiExplanation = {
  heading: brand.ai + ": what it actually does",
  intro:
    "Both journeys start the same way: show us your stuff, or show us your space. " + brand.ai + " looks at what you share and proposes a starting point — you always stay in control of the details.",
  forRenters: [
    "Belongings it thinks it can see",
    "An estimated storage requirement",
    "Packing and fit guidance, where available",
  ],
  forHosts: [
    "Observations about the space",
    "Usable-capacity guidance",
    "A measurement workflow to speed things up",
    "Pricing guidance, where available",
  ],
  disclaimers: [
    brand.ai + " output is an estimate or proposal, not a confirmed fact.",
    "You review and correct anything important before it's used.",
    brand.ai + " does not replace your declarations.",
    brand.ai + " does not guarantee fit.",
    brand.ai + " does not guarantee earnings.",
  ],
};

export const howItWorksFaq: { question: string; answer: string }[] = [
  {
    question: "What is " + brand.name + "?",
    answer:
      brand.name + " connects people who need storage with people who have useful space nearby, in your local neighbourhood.",
  },
  {
    question: "How does neighbourhood storage work?",
    answer:
      "Hosts list spare space such as garages, lofts, sheds or spare rooms. Renters search nearby, request the space that fits their needs, and book it once both sides are happy.",
  },
  {
    question: "What is " + brand.ai + "?",
    answer:
      brand.ai + " helps renters describe their belongings and helps hosts describe their space, proposing estimates that you can review and correct.",
  },
  {
    question: "Do I have to use " + brand.ai + "?",
    answer: "No — you can always add items or describe your space manually instead.",
  },
  {
    question: "How is storage space estimated?",
    answer:
      "From the items or measurements you confirm, using a consistent set of rules so the same inputs always give the same estimate.",
  },
  {
    question: "Can I correct an AI result?",
    answer: "Yes. Every proposal from " + brand.ai + " can be edited or removed before it's used anywhere.",
  },
  {
    question: "What items can I store?",
    answer:
      "Most household belongings are fine. Some items are restricted or prohibited for safety and legal reasons — see Trust & Safety for details.",
  },
  {
    question: "How does a host decide whether to accept?",
    answer:
      "Hosts see your declared inventory, your estimated requirement against their usable capacity, and can ask questions before deciding.",
  },
  {
    question: "What happens if the price changes?",
    answer:
      "If the authoritative price changes before you book, you'll be shown the new amount and asked to review it before continuing.",
  },
  {
    question: "Can I ask a host a question before booking?",
    answer: "Yes — use Ask the Host to clarify anything before you send a request.",
  },
  {
    question: "How do hosts measure available space?",
    answer:
      brand.ai + " live scan, photos or manual measurement, refined with the boundary editor. These are estimates that hosts can adjust.",
  },
  {
    question: "Does " + brand.name + " guarantee everything will fit?",
    answer:
      "No. Fit, policy and suitability information is provided to help you judge a space, but it is never a guarantee.",
  },
  {
    question: "How do I list unused space?",
    answer: "Start at List Your Space, show us your space, confirm the details and publish your listing.",
  },
];
