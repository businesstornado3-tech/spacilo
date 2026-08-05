import { brand } from "@/config/brand";

export const trustCore = {
  heading: "Trust, built on clear information",
  body:
    "Storage between people works best when everyone can see what they need to. " +
    brand.name +
    " supports trust through clear information, user declarations, policy screening, suitability information, transparent requests, direct communication, price review and transaction safeguards — not promises we can't keep.",
};

export const trustSections: { heading: string; body: string }[] = [
  {
    heading: "Item safety",
    body:
      "Every request is screened against our storage policy before it goes further. Renters remain responsible for accurately describing what they intend to store, and some items are restricted or prohibited for safety and legal reasons. We don't publish the details of how screening decisions are made, but you'll always see the outcome and the reason.",
  },
  {
    heading: "Host space responsibility",
    body:
      "Hosts are responsible for accurately describing the space they offer and meeting the safety declarations required to list it. " +
      brand.ai +
      " can help a host describe their space, but an AI observation only becomes part of a listing once the host has reviewed and confirmed it — it is never treated as a confirmed fact automatically.",
  },
  {
    heading: "User responsibility",
    body:
      "Renters remain responsible for the belongings they offer for storage and for making sure those belongings are lawful to store. Hosts remain responsible for the space they offer, for using it lawfully, and for describing it accurately. This doesn't remove either side's own legal responsibilities.",
  },
  {
    heading: "Fit, policy and suitability",
    body:
      brand.name +
      " shows three separate things about a space: fit (whether your requirement looks compatible), policy (whether your items are permitted) and suitability (other information relevant to your decision). " +
      brand.name +
      " never guarantees fit — these are aids to your own judgement, not a promise.",
  },
  {
    heading: "AI transparency",
    body:
      brand.ai +
      " proposes; you review. Wherever information appears on the platform, we keep the distinction between what a host has confirmed and what " +
      brand.ai +
      " has estimated — the two are never blurred together.",
  },
  {
    heading: "Ask the host",
    body:
      "You can message a host with questions before you book. It's a good way to clarify anything the listing doesn't cover. Response times aren't guaranteed and messages aren't continuously monitored by " +
      brand.name +
      ".",
  },
  {
    heading: "Price protection",
    body:
      "Prices shown while you browse are indicative. Before you're asked to pay, we check the authoritative price on our servers. If it has changed, you'll always see the new amount and be asked to review it before your payment goes ahead — nothing is charged before you've seen and accepted the final price.",
  },
  {
    heading: "Responsiveness",
    body:
      "Where we show a host's responsiveness, it reflects real historical activity over a rolling 90-day window, with a 48-hour grace period, a minimum sample of 3 requests, and system-generated events excluded. It's factual history, not a badge such as \"trusted\" or \"verified\", and it isn't a promise about how quickly any future message will be answered.",
  },
];

export const trustFaqNote =
  "See How It Works for the step-by-step renter and host journeys referenced above.";
