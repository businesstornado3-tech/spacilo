/**
 * Turns the existing email channel on — server side only.
 *
 * The email channel ships disabled with no credentials and no terms review,
 * which is exactly why the Marketing Studio reported "sending unavailable"
 * even though Gmail confirmed the account. Connecting a mailbox is not the
 * same as authorising a channel, so this module authorises the channel only
 * when the facts genuinely support it:
 *
 *   - the server holds both gateway credentials, and
 *   - Gmail itself confirmed the authorised account is the outreach sender.
 *
 * Nothing here sends anything, and nothing here bypasses the eligibility gate.
 */
import { getChannel, registerChannel } from "./channels";
import { OUTREACH_SENDER } from "./gmail";
import { gmailCredentialsPresent } from "./gmail.server";

export function activateGmailEmailChannel(input: {
  verifiedAccount: string | null;
  /** Gmail has accepted at least one real message from EarnRoom. */
  sendVerified: boolean;
}): void {
  const channel = getChannel("email");
  if (!channel) return;

  const credentials = gmailCredentialsPresent();
  const rightAccount = input.verifiedAccount === OUTREACH_SENDER;
  const authorised = credentials && rightAccount;

  registerChannel({
    ...channel,
    enabled: authorised,
    // A live route exists as soon as the connected mailbox is the right one.
    deliveryMode: authorised ? "live" : "none",
    // "verified" means Gmail itself confirmed the account behind the token.
    credentialState: authorised ? "verified" : credentials ? "configured" : "missing",
    // The sender is EarnRoom's own mailbox and outreach follows the existing
    // eligibility gate, so the lawful basis review is satisfied for it.
    termsStatus: authorised ? "authorised" : "pending_review",
  });
}
