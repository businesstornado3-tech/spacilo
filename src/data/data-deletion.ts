import { brand } from "@/config/brand";

/**
 * Public data deletion instructions.
 *
 * EarnRoom has no self-service "delete my account" button today, so this page
 * documents the real, manual request route and must not imply otherwise.
 * No response time is stated because no response-time policy exists.
 */

export const deletionIntro = `You can ask ${brand.name} to delete the personal information we hold about you, including any data connected to a Facebook, Instagram, Google or other platform account you linked to ${brand.name}. This page explains exactly how to do that and what happens next.`;

export const deletionSections: { heading: string; body: string; bullets?: string[] }[] = [
  {
    heading: "Your right to ask for deletion",
    body: `You can ask us to delete your ${brand.name} personal data at any time, and you do not have to give a reason. If you connected a Meta (Facebook or Instagram) account, a Google/YouTube account, or another platform account, you can ask us to remove that authorisation and the data held with it.`,
  },
  {
    heading: "How to send a deletion request",
    body: `${brand.name} does not currently have a self-service delete button. Deletion requests are handled by a person, so please send one of the following:`,
    bullets: [
      `Email ${brand.supportEmail} with the subject line “Data deletion request”.`,
      `If you are signed in to ${brand.name}, you can also raise the request through the in-app support area and we will treat it the same way.`,
    ],
  },
  {
    heading: "What to include so we can find your data",
    body: "So we can identify the right records and avoid deleting someone else's data, please tell us:",
    bullets: [
      `The email address you used for your ${brand.name} account.`,
      "Whether you want everything deleted, or only a specific platform connection removed.",
      "If it relates to a linked platform account, the platform name and the account or page/channel name (for example the Facebook Page, Instagram username or YouTube channel).",
      "Send the request from the email address on the account where possible — it helps us confirm it is really you. If you cannot, we may ask you another question to confirm your identity before we delete anything.",
    ],
  },
  {
    heading: "What happens after we receive your request",
    body: "We confirm we have received it, check that the request comes from the account holder, then delete or anonymise the personal data we are able to delete. We tell you when it is done, and we tell you plainly if there is anything we cannot delete and why. We do not publish a guaranteed turnaround time, so we will not promise one here; we handle requests as quickly as we reasonably can.",
  },
  {
    heading: "Platform connections and access tokens",
    body: `Where you connected a platform account, the stored authorisation (the access token) is encrypted on our server and is deleted when the connection is removed or your deletion request is completed. After that, ${brand.name} can no longer read from or post to that account. You can also remove ${brand.name}'s access directly from the platform: in Facebook or Instagram under the app/business integrations settings, and in Google under Third-party apps with account access.`,
  },
  {
    heading: "What we may have to keep",
    body: "Some records cannot simply be erased. Where we have a legal, accounting, tax, fraud-prevention or security reason to keep a record — for example payment and invoice records, or a log that an action took place — we keep the minimum needed for that purpose and nothing more. Those retained records never contain access tokens or platform secrets. If this applies to your request, we tell you which records are affected.",
  },
  {
    heading: "Contact",
    body: `Send deletion and privacy questions to ${brand.supportEmail}. This is the monitored inbox for ${brand.name} data requests.`,
  },
];
