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
    " is built to work on the smallest amount of personal information that still lets storage happen safely between two people. This page explains, in plain English, what we measure on the public site and what we deliberately don't.",
};

export const measurementSections: { heading: string; body: string }[] = [
  {
    heading: "We measure our own site, and nothing else",
    body:
      "Our analytics are first-party: the measurement is ours, the data stays in our own systems, and there is no advertising network, no third-party tracking script and no data sold or shared for marketing. We can't see what you do on other websites, and we don't try to.",
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
    body:
      "A page view records the page path with any identifiers and query parameters stripped out, the website you arrived from (the site name only, never the full link), any campaign tag in the link you clicked, and a coarse device type — mobile, tablet or desktop. That's it.",
  },
  {
    heading: "What we never record",
    body:
      "Analytics never contains photos, camera frames from a scan, inventory images, message contents, addresses or postcodes, payment details, safety declarations, or anything you typed as free text. This is enforced in code, not just by policy: values that don't look like a simple count, category or status are discarded before anything is sent.",
  },
  {
    heading: "Counting visitors honestly",
    body: UNIQUE_VISITOR_DEFINITION,
  },
  {
    heading: "How long we keep it",
    body:
      "Granular anonymous events are removed after " +
      ANALYTICS_RETENTION_DAYS +
      " days. Reporting is bucketed in " +
      REPORTING_TIMEZONE +
      " time so figures line up with UK calendar days, including across the clock change.",
  },
  {
    heading: "Respecting your choice",
    body:
      "If your browser sends a Do Not Track or Global Privacy Control signal, we don't measure your visit at all and nothing is stored in your browser for analytics. Because this measurement is first-party, strictly limited and not used for advertising or profiling, we haven't put an intrusive consent banner in front of the site.",
  },
  {
    heading: "Your account data is separate",
    body:
      "Information you give us as an account holder — your profile, your inventory, your messages, your bookings — is handled under the terms you agree to when you sign up, and is not part of the anonymous site measurement described above. Hosts never see your photos or item-level inventory; they see summaries relevant to the space they're offering.",
  },
];

export const legalReviewNotice =
  "This page describes how the product actually behaves today. It is a plain-English explanation, not a legal notice: the wording, and our position under UK data protection and PECR requirements, still needs review by a qualified adviser before launch. Nothing here should be read as confirmation that such a review has taken place.";
