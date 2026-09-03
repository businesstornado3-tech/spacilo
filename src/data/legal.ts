/**
 * Legal document placeholders.
 *
 * IMPORTANT: none of this text is legal advice and none of it has been
 * reviewed by a solicitor. Every document here is a structured placeholder so
 * the product has stable, linkable URLs before launch. The wording must be
 * replaced with solicitor-approved copy before EarnRoom takes real money.
 */
import { brand } from "@/config/brand";

export const LEGAL_REVIEW_NOTICE =
  "This document is a placeholder written by the EarnRoom team. It has not been reviewed or approved by a qualified solicitor and must be replaced with professionally drafted wording before launch.";

export interface LegalSection {
  heading: string;
  body: string;
}

export interface LegalDocument {
  slug: string;
  title: string;
  /** Short description used for the meta description and the index card. */
  description: string;
  intro: string;
  sections: LegalSection[];
}

export const LEGAL_DOCUMENTS: readonly LegalDocument[] = [
  {
    slug: "terms",
    title: "Terms of service",
    description: `The agreement between you and ${brand.name} when you use the marketplace.`,
    intro: `${brand.name} is a marketplace that introduces people who need storage to people with spare space. We are not a storage operator, a warehouse, a removals company or an insurer.`,
    sections: [
      {
        heading: "What we do and don't do",
        body: `${brand.name} provides the platform, the fit estimates, the storage policy, the messaging and the payment rails. The storage itself is provided by the host, in their own property, under the arrangement the two of you agree.`,
      },
      {
        heading: "Your account",
        body: "You must be 18 or over, give accurate information, keep your login details secure, and use the platform only for lawful storage that the published storage policy permits.",
      },
      {
        heading: "Bookings and payment",
        body: "A booking is formed when a host accepts a request and payment is confirmed by our payment provider. Prices shown at review are the prices charged; if a host changes their price before you pay, you are asked to review the new price again.",
      },
      {
        heading: "Uploaded photos and AI-assisted features",
        body: `${brand.name} may process listing photos, inventory photos, host space-scan photos and booking-evidence photos to provide the feature you request. AI-assisted scans and visualisations produce estimates or proposals; you remain responsible for checking important details and the service does not identify lawful storage, guarantee fit or replace a person's judgement.`,
      },
      {
        heading: "Limits of our responsibility",
        body: `${brand.name} does not guarantee that a space is safe, dry, secure or suitable. Fit scores, scans and screening are estimates and checks, not guarantees. Nothing on the platform is insurance.`,
      },
      {
        heading: "Ending an agreement",
        body: "Either party can end a booking under the cancellation policy. Serious breaches of these terms, the storage policy or the law may result in an account being suspended.",
      },
    ],
  },
  {
    slug: "cookies",
    title: "Cookie policy",
    description: `How ${brand.name} uses browser storage, and what it deliberately doesn't do.`,
    intro: `${brand.name} keeps browser storage to the minimum needed to sign you in and to measure our own site.`,
    sections: [
      {
        heading: "Strictly necessary",
        body: "Your signed-in session is stored in your browser so you stay logged in between pages. Without it the product cannot work.",
      },
      {
        heading: "First-party measurement",
        body: "An opaque, rotating random value lets us count visits without identifying you. There is no advertising network, no third-party tracker and no cross-site profile. Do Not Track and Global Privacy Control signals disable this measurement.",
      },
      {
        heading: "Preferences",
        body: "Small local values remember things like recent searches on your own device. They never leave your browser unless you act on them.",
      },
      {
        heading: "Your control",
        body: "Clearing your browser storage removes the local values above. Blocking it may sign you out but will not stop you browsing public pages. This page does not claim that every browser-storage question has received legal review.",
      },
    ],
  },
  {
    slug: "refunds",
    title: "Refund policy",
    description: "When money is returned, how much, and how long it takes.",
    intro:
      "Refunds are handled through the original payment method by our payment provider, and are always tied to a booking reference.",
    sections: [
      {
        heading: "Before storage starts",
        body: "If a booking is cancelled before the start date, the refundable amount is shown to you in the cancellation quote before you confirm anything.",
      },
      {
        heading: "After storage starts",
        body: "Once belongings are in a space, refunds depend on how much of the paid period remains and on what the two parties agree, with support involvement where there is a dispute.",
      },
      {
        heading: "Service fees",
        body: "Platform fees are shown separately at checkout. Whether a fee is refundable is stated in the cancellation quote for that specific booking.",
      },
      {
        heading: "Timing",
        body: "Once a refund is submitted, the card issuer typically takes a few working days to show it. The refund status is visible in your payment history throughout.",
      },
    ],
  },
  {
    slug: "cancellations",
    title: "Cancellation policy",
    description: "How renters and hosts end a booking, and what happens next.",
    intro:
      "Both sides can cancel. What differs is the notice given, the effect on money, and the effect on reputation.",
    sections: [
      {
        heading: "Renter cancellation",
        body: "A renter can cancel from the booking page. The quote shown before confirming sets out the refundable amount for that booking.",
      },
      {
        heading: "Host cancellation",
        body: "A host cancelling a confirmed booking leaves someone without storage they were relying on. The renter is refunded and repeated host cancellations affect the listing.",
      },
      {
        heading: "Early termination",
        body: "Where storage has already started, either side can request early termination. The other party responds, and support can step in if no agreement is reached.",
      },
      {
        heading: "Collection of belongings",
        body: "Cancelling does not by itself move anything. Belongings must be collected before the booking closes, and both sides confirm collection in the app.",
      },
    ],
  },
  {
    slug: "host-agreement",
    title: "Host agreement",
    description: "What you commit to when you list space on EarnRoom.",
    intro:
      "Listing a space is a commitment to a real person that their belongings will be somewhere safe, accessible as described, and treated with care.",
    sections: [
      {
        heading: "You must be allowed to let the space",
        body: "You confirm you own the property or have permission to let the space, and that doing so does not breach a mortgage, lease, tenancy or insurance condition.",
      },
      {
        heading: "Describe the space honestly",
        body: "Measurements, access, damp, heating and security must reflect reality. Fit estimates depend on what you tell us, and a wrong answer misleads a renter.",
      },
      {
        heading: "Access and privacy",
        body: "Provide the access you advertised, and do not open, move or use a renter's belongings.",
      },
      {
        heading: "Payouts",
        body: "Payouts are made to your verified payout account after the relevant booking milestone. Refunds and disputes can reduce or reverse an amount owed to you.",
      },
    ],
  },
  {
    slug: "renter-agreement",
    title: "Renter agreement",
    description: "What you commit to when you store belongings with a host.",
    intro:
      "You are storing your belongings in someone's home or property, not a commercial facility.",
    sections: [
      {
        heading: "Store only what the policy allows",
        body: "You confirm your items match the published storage policy and the answers you gave during screening. Prohibited items are never permitted, whatever a host says.",
      },
      {
        heading: "Describe your items honestly",
        body: "Quantities, sizes and item types drive the fit estimate and the host's decision. Turning up with substantially more than declared can end a booking.",
      },
      {
        heading: "Access and conduct",
        body: "Access the space only as agreed, respect the household, and give reasonable notice.",
      },
      {
        heading: "Insurance",
        body: `${brand.name} does not insure your belongings. Arrange your own cover if the value matters to you.`,
      },
    ],
  },
  {
    slug: "ai-disclaimer",
    title: "AI disclaimer",
    description: `What ${brand.ai} does, what it never decides, and how to treat its output.`,
    intro: `${brand.ai} observes and proposes. People confirm. The published policy decides. The server enforces.`,
    sections: [
      {
        heading: "Estimates, not measurements",
        body: "Volumes, dimensions and fit scores produced from photos or a live scan are estimates. They can be wrong, especially in poor light or with unusual shapes. Always sanity-check against the real space.",
      },
      {
        heading: "AI never decides legality",
        body: "No AI output determines whether an item is lawful, criminal or prohibited. Item categories are confirmed by you and assessed against the published storage policy rules.",
      },
      {
        heading: "No safety guarantee",
        body: "A high fit score is not a statement that a space is safe, dry, secure or insured. It is a spatial estimate only.",
      },
      {
        heading: "Your data",
        body: `${brand.name} sends selected photos to a third-party AI service when you request a scan or visualisation. Photos are not used as anonymous site analytics or sold for advertising; storage and retention details are described on the privacy page and still require launch review.`,
      },
    ],
  },
];

export function findLegalDocument(slug: string): LegalDocument | undefined {
  return LEGAL_DOCUMENTS.find((doc) => doc.slug === slug);
}
