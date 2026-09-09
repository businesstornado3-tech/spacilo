import { brand } from "@/config/brand";

/**
 * Plain-English disclosure of exactly how EarnRoom handles Google user data
 * obtained through the YouTube publishing integration.
 *
 * Every statement here must match the production implementation:
 * - scopes come from `src/lib/marketing/oauth.ts` (youtube.upload, youtube.readonly)
 * - tokens are AES-GCM encrypted server-side (`src/lib/marketing/token-crypto.server.ts`)
 * - the callback validates a one-time, expiring state row (`marketing_oauth_states`)
 * - disconnecting removes the stored authorisation (`disconnectPlatform`)
 *
 * Do not add claims (certifications, retention periods, subprocessor names)
 * that are not demonstrably true in the codebase.
 */

export const GOOGLE_SECTION_ID = "google-user-data";

export const googleIntro = `${brand.name} can publish its own marketing videos to a YouTube channel that an authorised ${brand.name} operator connects. That connection uses Google OAuth. This section states exactly what Google user data ${brand.name} accesses, how it is used, who it is shared with, and how it is protected.`;

export const googleSections: { heading: string; body: string; bullets?: string[] }[] = [
  {
    heading: "What Google user data EarnRoom accesses",
    body: `${brand.name} requests two YouTube permissions and nothing else:`,
    bullets: [
      "View your YouTube account (https://www.googleapis.com/auth/youtube.readonly) — used only to read the basic details of the connected channel, such as the channel name, channel ID and thumbnail, so the operator can confirm which channel they connected and see the resulting video.",
      "Upload YouTube videos (https://www.googleapis.com/auth/youtube.upload) — used only to upload a marketing video that has already been created and approved inside EarnRoom to that connected channel.",
      `${brand.name} does not access Gmail, Google Drive, Google Contacts, Google Calendar, Google payment information, Google Search history, Google Photos or any other Google product or data.`,
      "EarnRoom does not read viewer data, comments, private messages or subscriber lists.",
    ],
  },
  {
    heading: "How EarnRoom uses Google user data",
    body: "Google user data obtained through OAuth is used solely to provide the YouTube connection and publishing feature the authorised user asked for. The workflow is:",
    bullets: [
      "The user chooses “Connect YouTube” inside EarnRoom.",
      "The user signs in with Google on Google's own screen.",
      "The user grants the two YouTube permissions listed above.",
      "Google returns an authorisation to EarnRoom's server, which EarnRoom stores securely.",
      "EarnRoom reads the connected channel so it can be identified in the console.",
      "EarnRoom can upload an EarnRoom-approved marketing video to that channel on the authorised user's behalf.",
      "EarnRoom records the publishing result — the platform video ID, the video URL where available, the status and a timestamp — so the operator has an accurate record of what was published.",
    ],
  },
  {
    heading: "What EarnRoom never does with Google user data",
    body: `${brand.name} does not sell Google user data. ${brand.name} does not use Google user data for advertising, advertising profiling, audience building, credit assessment, or any purpose unrelated to the YouTube connection you authorised. ${brand.name} does not use Google user data to train, retrain or improve AI or machine-learning models, and does not transfer Google user data to any AI service.`,
  },
  {
    heading: "Who EarnRoom shares, transfers or discloses Google user data with",
    body: "The sharing position is deliberately narrow:",
    bullets: [
      "Google and YouTube — data is sent back to Google's own APIs to perform the upload and channel lookup you authorised. This is the integration itself.",
      "EarnRoom's hosting and database infrastructure — the encrypted authorisation and the publishing records are held in EarnRoom's own hosted application and database, operated for EarnRoom by its infrastructure providers under their service terms. These providers process the data only to run EarnRoom and are not permitted to use it for their own purposes.",
      "No advertising networks, no data brokers, no analytics vendors and no other unrelated third parties receive Google user data.",
      "EarnRoom would disclose data if required by law or to protect against fraud or a security incident. No such routine disclosure programme exists.",
      `${brand.name} does not sell, rent or licence Google user data to anyone.`,
    ],
  },
  {
    heading: "How EarnRoom protects Google user data",
    body: "These protections are implemented in the production system today:",
    bullets: [
      "Google OAuth tokens are encrypted with AES-GCM using a server-only key before being written to the database.",
      "Tokens are held and used only on EarnRoom's server; they are never sent to, or stored in, the browser.",
      "Access tokens, refresh tokens and client secrets are never displayed to users, never returned by the interface and never written to logs.",
      "The Google client secret exists only in server-side configuration and is never included in front-end code.",
      "The OAuth callback validates a server-issued state value before accepting any authorisation, so an unsolicited callback cannot connect an account.",
      "That state value is single-use and expires, which protects the connection against replay.",
      "All production OAuth callbacks use HTTPS on earnroom.co.uk.",
      "The authorisation code is consumed server-side and the browser is immediately redirected to a clean URL, so the code is not left in the address bar or browser history.",
      "Reading or using a connected platform authorisation is restricted to the server-side integration and to authenticated administrator accounts, enforced by database row-level security.",
      "EarnRoom keeps an audit record of publishing actions. Those records contain the action, platform, result and timestamp — never a token or secret.",
    ],
  },
  {
    heading: "Keeping, revoking and deleting Google user data",
    body: "You stay in control of the connection:",
    bullets: [
      "Disconnecting the YouTube account inside EarnRoom removes the stored authorisation for that channel, so EarnRoom can no longer read the channel or upload to it.",
      "You can also revoke EarnRoom's access at any time from your Google Account at https://myaccount.google.com/permissions. Revoking there stops EarnRoom's access immediately.",
      `To request deletion of the stored connection and associated personal records, email ${brand.supportEmail}, or use the data deletion instructions page. Requests are handled manually by a person; ${brand.name} has not published a guaranteed response time, so no timescale is promised here.`,
      "Records of videos actually published, and the related audit entries, may be kept as an operational record of what was posted. These records never contain Google tokens or secrets.",
    ],
  },
  {
    heading: "Limited use of Google user data",
    body: `${brand.name}'s use of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements. Google user data is used only to provide and improve the YouTube connection and publishing feature that the user explicitly authorised; it is not transferred to others except as needed to provide that feature, to comply with applicable law, or as part of a merger or acquisition with prior notice. It is not used for advertising and no human reads it except with the user's consent, for security purposes, or where required by law. This is a description of how EarnRoom operates; it is not a claim that any Google review or certification has been completed.`,
  },
];
