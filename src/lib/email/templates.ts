/**
 * EarnRoom email template library.
 *
 * Templates only. No provider is configured, no key is read and nothing here
 * sends anything — wiring an email provider is a separate founder
 * configuration step.
 *
 * Every template is a pure function of typed data, so wording can be reviewed
 * and tested without a mail server. Copy follows the product's evidence rule:
 * facts and next steps, never safety guarantees.
 */
import { brand } from "@/config/brand";
import { renderEmailHtml, renderEmailText, type EmailContent } from "@/lib/email/layout";

export type EmailTemplateId =
  | "welcome"
  | "verify-email"
  | "password-reset"
  | "booking-request"
  | "booking-accepted"
  | "booking-declined"
  | "booking-confirmed"
  | "booking-reminder"
  | "move-in-reminder"
  | "move-out-reminder"
  | "receipt"
  | "invoice"
  | "refund-approved"
  | "refund-processed"
  | "cancellation"
  | "review-reminder"
  | "message-notification"
  | "founder-notification"
  | "platform-announcement";

export type EmailAudience = "renter" | "host" | "both" | "internal";

export interface EmailData {
  /** Recipient's first name, when known. */
  name?: string;
  spaceTitle?: string;
  bookingReference?: string;
  startDate?: string;
  endDate?: string;
  amount?: string;
  reason?: string;
  actionUrl?: string;
  senderName?: string;
  messagePreview?: string;
  subjectLine?: string;
  body?: string;
}

export interface EmailTemplate {
  id: EmailTemplateId;
  /** Who the template is written for — drives tone, never routing. */
  audience: EmailAudience;
  subject: (data: EmailData) => string;
  content: (data: EmailData) => EmailContent;
}

const hi = (data: EmailData): string => (data.name ? `Hi ${data.name},` : "Hi there,");
const space = (data: EmailData): string => data.spaceTitle ?? "the storage space";
const url = (data: EmailData, fallback: string): string => data.actionUrl ?? fallback;
const dates = (data: EmailData): string =>
  data.startDate && data.endDate ? `${data.startDate} – ${data.endDate}` : "See your booking";

const bookingFacts = (data: EmailData) => [
  { label: "Space", value: space(data) },
  { label: "Dates", value: dates(data) },
  { label: "Booking reference", value: data.bookingReference ?? "—" },
];

export const EMAIL_TEMPLATES: Record<EmailTemplateId, EmailTemplate> = {
  welcome: {
    id: "welcome",
    audience: "both",
    subject: () => `Welcome to ${brand.name}`,
    content: (data) => ({
      preheader: `Get set up on ${brand.name} in a couple of minutes.`,
      heading: `Welcome to ${brand.name}`,
      paragraphs: [
        hi(data),
        `${brand.name} connects people who need storage with neighbours who have spare space. ${brand.ai} helps both sides estimate what actually fits before anyone commits.`,
        "Two things worth doing first: complete your profile, and tell us what you need to store or what space you have.",
      ],
      button: { label: "Open my account", url: url(data, "/") },
      footnote: `Estimates from ${brand.ai} are guidance, not a guarantee of fit.`,
    }),
  },

  "verify-email": {
    id: "verify-email",
    audience: "both",
    subject: () => "Confirm your email address",
    content: (data) => ({
      preheader: "Confirm your email address to finish setting up your account.",
      heading: "Confirm your email address",
      paragraphs: [hi(data), "Please confirm this address so we can secure your account."],
      button: { label: "Confirm email", url: url(data, "/") },
      footnote: "If you didn't create an account, you can safely ignore this email.",
    }),
  },

  "password-reset": {
    id: "password-reset",
    audience: "both",
    subject: () => "Reset your password",
    content: (data) => ({
      preheader: "A link to choose a new password.",
      heading: "Reset your password",
      paragraphs: [hi(data), "Use the link below to choose a new password."],
      button: { label: "Choose a new password", url: url(data, "/reset-password") },
      footnote:
        "This link expires shortly. If you didn't ask for it, ignore this email — your password stays unchanged.",
    }),
  },

  "booking-request": {
    id: "booking-request",
    audience: "host",
    subject: (data) => `New storage request for ${space(data)}`,
    content: (data) => ({
      preheader: "A renter has asked to store with you.",
      heading: "You have a new storage request",
      paragraphs: [
        hi(data),
        "A renter has asked to store with you. Review what they plan to store and the dates before you respond.",
      ],
      facts: bookingFacts(data),
      button: { label: "Review request", url: url(data, "/host/bookings") },
      footnote: "Requests expire if they aren't answered, so a quick reply helps both sides.",
    }),
  },

  "booking-accepted": {
    id: "booking-accepted",
    audience: "renter",
    subject: (data) => `Your request for ${space(data)} was accepted`,
    content: (data) => ({
      preheader: "Your host accepted — payment is the next step.",
      heading: "Your request was accepted",
      paragraphs: [
        hi(data),
        "Your host has accepted your request. Your booking is confirmed once payment completes.",
      ],
      facts: bookingFacts(data),
      button: { label: "Continue to payment", url: url(data, "/renter/bookings") },
    }),
  },

  "booking-declined": {
    id: "booking-declined",
    audience: "renter",
    subject: (data) => `Your request for ${space(data)} wasn't accepted`,
    content: (data) => ({
      preheader: "This host can't take your booking — here's what to do next.",
      heading: "Your request wasn't accepted",
      paragraphs: [
        hi(data),
        data.reason
          ? `The host declined this request. Reason given: ${data.reason}`
          : "The host declined this request. No reason was given.",
        "Other spaces near you may suit what you're storing.",
      ],
      facts: bookingFacts(data),
      button: { label: "Find another space", url: url(data, "/renter/search") },
    }),
  },

  "booking-confirmed": {
    id: "booking-confirmed",
    audience: "both",
    subject: (data) => `Booking confirmed — ${space(data)}`,
    content: (data) => ({
      preheader: "Payment received and your booking is confirmed.",
      heading: "Your booking is confirmed",
      paragraphs: [
        hi(data),
        "Payment has been received and your booking is confirmed. The exact address and access notes are now on your booking page.",
      ],
      facts: [...bookingFacts(data), { label: "Total paid", value: data.amount ?? "—" }],
      button: { label: "View booking", url: url(data, "/renter/bookings") },
    }),
  },

  "booking-reminder": {
    id: "booking-reminder",
    audience: "both",
    subject: (data) => `Upcoming booking — ${space(data)}`,
    content: (data) => ({
      preheader: "A reminder about your upcoming storage booking.",
      heading: "Your booking is coming up",
      paragraphs: [hi(data), "Here's a reminder of the details so nothing gets missed."],
      facts: bookingFacts(data),
      button: { label: "View booking", url: url(data, "/renter/bookings") },
    }),
  },

  "move-in-reminder": {
    id: "move-in-reminder",
    audience: "both",
    subject: (data) => `Move-in day for ${space(data)}`,
    content: (data) => ({
      preheader: "Confirm the handover once your items are in.",
      heading: "Move-in day",
      paragraphs: [
        hi(data),
        "Your storage period starts today. Agree access with the other party, then confirm the handover in the app — both sides confirm, and photos help if anything is queried later.",
      ],
      facts: bookingFacts(data),
      button: { label: "Confirm handover", url: url(data, "/renter/bookings") },
    }),
  },

  "move-out-reminder": {
    id: "move-out-reminder",
    audience: "both",
    subject: (data) => `Collection day for ${space(data)}`,
    content: (data) => ({
      preheader: "Arrange collection and confirm it in the app.",
      heading: "Time to collect your items",
      paragraphs: [
        hi(data),
        "Your storage period ends soon. Arrange a collection time with the other party and confirm collection in the app once everything is out.",
      ],
      facts: bookingFacts(data),
      button: { label: "Confirm collection", url: url(data, "/renter/bookings") },
    }),
  },

  receipt: {
    id: "receipt",
    audience: "renter",
    subject: (data) => `Your ${brand.name} receipt${data.amount ? ` — ${data.amount}` : ""}`,
    content: (data) => ({
      preheader: "A receipt for your storage payment.",
      heading: "Payment receipt",
      paragraphs: [hi(data), "Thanks — your payment has been received."],
      facts: [...bookingFacts(data), { label: "Amount paid", value: data.amount ?? "—" }],
      button: { label: "View transactions", url: url(data, "/renter/payments") },
    }),
  },

  invoice: {
    id: "invoice",
    audience: "renter",
    subject: (data) => `Invoice ${data.bookingReference ?? ""} from ${brand.name}`.trim(),
    content: (data) => ({
      preheader: "Your itemised storage invoice.",
      heading: "Your invoice",
      paragraphs: [
        hi(data),
        "Here's the itemised invoice for your storage. You can download a copy at any time from your transactions.",
      ],
      facts: [...bookingFacts(data), { label: "Total", value: data.amount ?? "—" }],
      button: { label: "Download invoice", url: url(data, "/renter/payments") },
    }),
  },

  "refund-approved": {
    id: "refund-approved",
    audience: "renter",
    subject: () => "Your refund has been approved",
    content: (data) => ({
      preheader: "Your refund is approved and being processed.",
      heading: "Refund approved",
      paragraphs: [
        hi(data),
        "Your refund has been approved and is being processed. You'll get a second email once it has been sent to your payment method.",
      ],
      facts: [
        { label: "Booking reference", value: data.bookingReference ?? "—" },
        { label: "Refund amount", value: data.amount ?? "—" },
      ],
      button: { label: "View transactions", url: url(data, "/renter/payments") },
    }),
  },

  "refund-processed": {
    id: "refund-processed",
    audience: "renter",
    subject: () => "Your refund has been processed",
    content: (data) => ({
      preheader: "Your refund is on its way back to you.",
      heading: "Refund processed",
      paragraphs: [
        hi(data),
        "Your refund has been sent back to the payment method you used. Banks usually take a few working days to show it.",
      ],
      facts: [
        { label: "Booking reference", value: data.bookingReference ?? "—" },
        { label: "Refund amount", value: data.amount ?? "—" },
      ],
      button: { label: "View transactions", url: url(data, "/renter/payments") },
    }),
  },

  cancellation: {
    id: "cancellation",
    audience: "both",
    subject: (data) => `Booking cancelled — ${space(data)}`,
    content: (data) => ({
      preheader: "This booking has been cancelled.",
      heading: "Booking cancelled",
      paragraphs: [
        hi(data),
        data.reason
          ? `This booking has been cancelled. Reason given: ${data.reason}`
          : "This booking has been cancelled.",
        "Any refund due is shown on your transactions page along with its status.",
      ],
      facts: bookingFacts(data),
      button: { label: "View booking", url: url(data, "/renter/bookings") },
    }),
  },

  "review-reminder": {
    id: "review-reminder",
    audience: "both",
    subject: (data) => `How did storing at ${space(data)} go?`,
    content: (data) => ({
      preheader: "Leave a review to help the next person decide.",
      heading: "Leave a review",
      paragraphs: [
        hi(data),
        "Your booking has finished. An honest review helps the next person decide, and reviews only appear from people who actually booked.",
      ],
      facts: bookingFacts(data),
      button: { label: "Write a review", url: url(data, "/renter/bookings") },
    }),
  },

  "message-notification": {
    id: "message-notification",
    audience: "both",
    subject: (data) => `New message from ${data.senderName ?? "your host"}`,
    content: (data) => ({
      preheader: "You have a new message about a storage booking.",
      heading: "You have a new message",
      paragraphs: [
        hi(data),
        `${data.senderName ?? "Someone"} sent you a message${
          data.spaceTitle ? ` about ${data.spaceTitle}` : ""
        }.`,
        data.messagePreview ? `"${data.messagePreview}"` : "Open the app to read and reply.",
      ],
      button: { label: "Read and reply", url: url(data, "/renter/messages") },
      footnote: "Keep conversations and payments on EarnRoom so support can help if something goes wrong.",
    }),
  },

  "founder-notification": {
    id: "founder-notification",
    audience: "internal",
    subject: (data) => `[${brand.name}] ${data.subjectLine ?? "Operational alert"}`,
    content: (data) => ({
      preheader: data.subjectLine ?? "An operational alert from your marketplace.",
      heading: data.subjectLine ?? "Operational alert",
      paragraphs: [data.body ?? "An event on the platform needs your attention."],
      button: { label: "Open admin dashboard", url: url(data, "/admin/dashboard") },
      footnote: "Internal notification — not sent to renters or hosts.",
    }),
  },

  "platform-announcement": {
    id: "platform-announcement",
    audience: "both",
    subject: (data) => data.subjectLine ?? `An update from ${brand.name}`,
    content: (data) => ({
      preheader: data.subjectLine ?? `An update from ${brand.name}.`,
      heading: data.subjectLine ?? `An update from ${brand.name}`,
      paragraphs: [hi(data), data.body ?? "We've made a change that affects how you use EarnRoom."],
      button: { label: `Open ${brand.name}`, url: url(data, "/") },
      footnote: "Service update about your account — not a marketing email.",
    }),
  },
};

export const EMAIL_TEMPLATE_IDS = Object.keys(EMAIL_TEMPLATES) as EmailTemplateId[];

export interface RenderedEmail {
  id: EmailTemplateId;
  subject: string;
  html: string;
  text: string;
}

/** Renders one template to HTML plus a plain-text alternative. */
export function renderEmail(id: EmailTemplateId, data: EmailData = {}): RenderedEmail {
  const template = EMAIL_TEMPLATES[id];
  if (!template) throw new Error(`Unknown email template: ${id}`);
  const content = template.content(data);
  return {
    id,
    subject: template.subject(data),
    html: renderEmailHtml(content),
    text: renderEmailText(content),
  };
}
