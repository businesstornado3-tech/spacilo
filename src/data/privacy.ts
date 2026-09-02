import { brand } from "@/config/brand";
import {
  ANALYTICS_RETENTION_DAYS,
  REPORTING_TIMEZONE,
  UNIQUE_VISITOR_DEFINITION,
  VISITOR_ROTATION_DAYS,
} from "@/lib/analytics/tracker";

/**
 * Plain-English description of the first-party measurement described in
 * `src/lib/analytics`. Kept next to the tracker constants so the page can
 * never quietly disagree with the code.
 */

export const privacyIntro = {
  heading: "Privacy and your data",
  body:
    brand.name +
    " is built to work on the smallest amount of personal information that still lets storage happen safely between two people. This page describes the data the product actually handles today, including public-site measurement, accounts, bookings, uploaded photos and AI-assisted estimates.",
};

export const measurementSections: { heading: string; body: string }[] = [
  {
    heading: "We measure our own site, and nothing else",
    body: "Our analytics are first-party: the measurement is ours, the data stays in our own systems, and there is no advertising network, no third-party tracking script and no data sold or shared for marketing. We can't see what you do on other websites, and we don't try to.",
  },
  {
    heading: "No fingerprinting, no cross-device tracking",
    body:
      "We don't build a device fingerprint and we don't try to recognise you across devices or browsers. The only reference we hold for an anonymous visit is an opaque random value stored in your own browser, which rotates every " +
      VISITOR_ROTATION_DAYS +
      " days. It carries no meaning on its own and isn't linked to anything about you.",
  },
  {
    heading: "What a page view records",
    body: "A page view records the page path with identifiers and query parameters stripped out, the website you arrived from (the site name only, never the full link), any campaign tag in the link you clicked, and a coarse device type — mobile, tablet or desktop. It does not record free text, photos, addresses or postcodes.",
  },
  {
    heading: "What account activity involves",
    body: "If you create an account, the product stores the information needed to provide the marketplace: your account and profile details, inventory, space listings, messages, bookings, payment records and support activity where you use those features. Hosts see the information needed to consider a request; a host does not receive a renter's private photos or item-level inventory unless the product explicitly shows a relevant summary.",
  },
  {
    heading: "Uploaded photos and AI processing",
    body:
      brand.name +
      " stores listing photos, inventory photos, host space-scan photos and booking-evidence photos in private storage areas. The product uses short-lived signed links when a permitted user needs to view them. When you ask for an AI scan or visualisation, the selected images are sent to our AI processing service, currently using Google Gemini models through the Lovable AI Gateway, to return an estimate or proposal. AI output is not a confirmed measurement or decision, and photos are not used as analytics data or sold for advertising.",
  },
  {
    heading: "How long information is kept",
    body:
      "Granular anonymous analytics events are removed after " +
      ANALYTICS_RETENTION_DAYS +
      " days. Reporting is bucketed in " +
      REPORTING_TIMEZONE +
      " time. Uploaded photos, account records, messages, bookings and payment records follow their product lifecycle and any applicable operational or legal requirements; a single universal retention period for those records has not been confirmed here and must be reviewed before launch.",
  },
  {
    heading: "Counting visitors honestly",
    body: UNIQUE_VISITOR_DEFINITION,
  },
  {
    heading: "Respecting your choice",
    body: "If your browser sends a Do Not Track or Global Privacy Control signal, we don't measure your visit at all and nothing is stored in your browser for analytics. Browser storage can also be cleared at any time; doing so may sign you out or remove local conveniences such as recent searches.",
  },
  {
    heading: "Requests and legal review",
    body: "The product has not yet published a complete request workflow, named legal entity, universal retention schedule, lawful-basis statement or international-transfer statement. Those details, including how access, correction and deletion requests will be handled, need qualified UK privacy advice and confirmation from the service owner before public launch. This page must not be read as a claim that a legal review or compliance assessment has happened.",
  },
];

export const legalReviewNotice =
  "This page describes how the product actually behaves today. It is a plain-English explanation, not a legal notice: the wording, and our position under UK data protection and PECR requirements, still needs review by a qualified adviser before launch. Nothing here should be read as confirmation that such a review has taken place.";
