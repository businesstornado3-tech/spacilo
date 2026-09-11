/* eslint-disable @typescript-eslint/no-explicit-any -- the outreach table was
 * added after the generated Supabase types were last produced in some
 * environments; every row read below is narrowed explicitly. */
/**
 * Gmail outreach — server side only.
 *
 * This is a DELIVERY CHANNEL for EarnRoom's existing market-intelligence and
 * outreach-eligibility architecture. It creates no signals of its own: a
 * message is only ever built from a signal the intelligence layer detected,
 * and only ever sent when the existing eligibility gate returns ELIGIBLE.
 *
 * Credentials live in the server runtime and are never returned to the
 * browser, written to the database or logged.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  OUTREACH_SENDER,
  buildOutreachMessage,
  buildRawEmail,
  gmailStatusView,
  looksLikeEmailAddress,
  type GmailStatusView,
  type OutreachSignal,
} from "@/lib/growth/gmail";

async function assertAdmin(supabase: any): Promise<void> {
  const { data, error } = await supabase.rpc("is_platform_admin");
  if (error || data !== true) throw new Error("You don't have access to this area.");
}

export type GmailOutreachSnapshot = {
  account: string;
  /** The address Gmail itself reported at the last check. */
  verifiedAccount: string | null;
  view: GmailStatusView;
  lastTestAt: string | null;
  /** When Gmail last actually accepted a founder test message. */
  lastTestSendAt: string | null;
  /** The last test-send outcome, in plain words. */
  lastTestSendDetail: string | null;
  lastOutreachAt: string | null;
  sentToday: number;
  errors: { at: string; detail: string }[];
  recent: {
    at: string;
    recipient: string;
    prospectType: string | null;
    source: string;
    status: string;
    messageId: string | null;
  }[];
};

/** Last successful/failed profile check, kept as a small audit row. */
async function readChecks(admin: any) {
  const { data } = await admin
    .from("marketing_audit")
    .select("action, detail, created_at")
    .in("action", ["gmail_connection_verified", "gmail_connection_failed"])
    .order("created_at", { ascending: false })
    .limit(20);
  return (data ?? []) as { action: string; detail: string; created_at: string }[];
}

/** The last founder test send Gmail actually accepted. */
async function readSendProof(admin: any) {
  const { data } = await admin
    .from("marketing_audit")
    .select("action, detail, created_at")
    .in("action", ["gmail_send_verified", "gmail_send_failed"])
    .order("created_at", { ascending: false })
    .limit(5);
  return (data ?? []) as { action: string; detail: string; created_at: string }[];
}

async function buildSnapshot(admin: any): Promise<GmailOutreachSnapshot> {
  const [
    { gmailCredentialsPresent },
    { channelMayTransmit, channelBlockReason },
    { outboundHalted },
    { activateGmailEmailChannel },
  ] = await Promise.all([
    import("@/lib/growth/gmail.server"),
    import("@/lib/growth/channels"),
    import("@/lib/growth/config"),
    import("@/lib/growth/gmail-channel.server"),
  ]);

  const [checks, sendProofs] = await Promise.all([readChecks(admin), readSendProof(admin)]);
  const lastCheck = checks[0] ?? null;
  const lastGood = checks.find((row) => row.action === "gmail_connection_verified") ?? null;
  const verifiedAccount = lastGood ? (lastGood.detail.match(/[^\s<]+@[^\s>]+/)?.[0] ?? null) : null;
  const lastSendProof = sendProofs.find((row) => row.action === "gmail_send_verified") ?? null;

  // Authorise the existing email channel from the facts, before it is read.
  activateGmailEmailChannel({ verifiedAccount, sendVerified: Boolean(lastSendProof) });

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { data: rows } = await admin
    .from("growth_outreach_emails")
    .select(
      "created_at, recipient_email, prospect_type, source, status, failure_reason, provider_message_id",
    )
    .order("created_at", { ascending: false })
    .limit(50);
  const records = (rows ?? []) as any[];
  const sent = records.filter((row) => row.status === "SENT");

  return {
    account: OUTREACH_SENDER,
    verifiedAccount,
    lastTestSendAt: lastSendProof?.created_at ?? null,
    lastTestSendDetail: sendProofs[0]?.detail ?? null,
    view: gmailStatusView({
      credentialsPresent: gmailCredentialsPresent(),
      accountVerified: Boolean(lastGood),
      verifiedAccount,
      authorisationFailed: lastCheck?.action === "gmail_connection_failed",
      channelMayTransmit: channelMayTransmit("email"),
      channelBlockReason: channelBlockReason("email"),
      sendVerified: Boolean(lastSendProof),
      outboundHalted: outboundHalted(),
    }),
    lastTestAt: lastCheck?.created_at ?? null,
    lastOutreachAt: sent[0]?.created_at ?? null,
    sentToday: sent.filter((row) => Date.parse(row.created_at) >= startOfDay.getTime()).length,
    errors: records
      .filter((row) => row.status !== "SENT" && row.failure_reason)
      .slice(0, 5)
      .map((row) => ({ at: row.created_at, detail: String(row.failure_reason) })),
    recent: records.slice(0, 10).map((row) => ({
      at: row.created_at,
      recipient: row.recipient_email,
      prospectType: row.prospect_type ?? null,
      source: row.source,
      status: row.status,
      messageId: row.provider_message_id ?? null,
    })),
  };
}

export const getGmailOutreachStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<GmailOutreachSnapshot> => {
    const supabase = context.supabase as any;
    await assertAdmin(supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return buildSnapshot(supabaseAdmin as any);
  });

/**
 * The safe connection test.
 *
 * It asks Gmail which account is authorised. It sends nothing, reads no
 * message, and cannot reach any prospect.
 */
export const testGmailOutreachConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
      context,
    }): Promise<{ ok: boolean; detail: string; snapshot: GmailOutreachSnapshot }> => {
      const supabase = context.supabase as any;
      await assertAdmin(supabase);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { gmailProfile } = await import("@/lib/growth/gmail.server");

      const profile = await gmailProfile();
      const ok = profile.ok && profile.value.emailAddress === OUTREACH_SENDER;
      const detail = profile.ok
        ? ok
          ? `Gmail confirmed the authorised account is ${profile.value.emailAddress}. Nothing was sent.`
          : `Gmail is connected to ${profile.value.emailAddress}, but outreach may only be sent from ${OUTREACH_SENDER}.`
        : profile.error;

      await (supabaseAdmin as any).from("marketing_audit").insert({
        action: ok ? "gmail_connection_verified" : "gmail_connection_failed",
        detail,
        actor: "human",
        actor_id: context.userId,
      });

      return { ok, detail, snapshot: await buildSnapshot(supabaseAdmin as any) };
    },
  );

const sendSchema = z.object({
  campaignId: z.string().min(3).max(120),
  opportunityKey: z.string().max(200).optional(),
  recipientEmail: z.string().min(5).max(320),
  prospectType: z.enum(["RENTER", "HOST"]),
  sourceName: z.string().min(2).max(200),
  sourceContext: z.string().min(2).max(600),
  lookingFor: z.string().min(2).max(400),
  statedProblem: z.string().max(600).nullish(),
  location: z.string().max(120).nullish(),
  /** Facts the intelligence layer established about the source and route. */
  sourceTermsPermitOutreach: z.boolean(),
  sourceTermsReviewed: z.boolean(),
  contactMechanismPermitsOutreach: z.boolean(),
  consent: z.string().max(40),
  suppressed: z.boolean(),
  hoursSinceLastContact: z.number().nullish(),
  duplicateFingerprint: z.boolean(),
  /** The founder's explicit go-ahead for this one message. */
  founderApproved: z.literal(true),
});

export type OutreachSendResult = {
  sent: boolean;
  status: string;
  detail: string;
  messageId: string | null;
};

/**
 * Sends ONE approved outreach email.
 *
 * Order of gates, all of which must pass before Gmail is contacted:
 * founder is an admin → founder approved this message → the address is real →
 * the Gmail connection is genuinely ready → the existing eligibility gate
 * returns ELIGIBLE. Every attempt is recorded either way.
 */
export const sendOutreachEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => sendSchema.parse(data))
  .handler(async ({ data, context }): Promise<OutreachSendResult> => {
    const supabase = context.supabase as any;
    await assertAdmin(supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { evaluateOutreachEligibility } = await import("@/lib/growth/eligibility");
    const { gmailSend } = await import("@/lib/growth/gmail.server");

    const signal: OutreachSignal = {
      lookingFor: data.lookingFor,
      statedProblem: data.statedProblem ?? null,
      location: data.location ?? null,
      sourceContext: data.sourceContext,
      sourceName: data.sourceName,
      prospectType: data.prospectType,
    };
    const message = buildOutreachMessage(signal);

    const record = async (
      status: string,
      failure: string | null,
      verdict: string,
      messageId: string | null,
      threadId: string | null,
    ) => {
      await (supabaseAdmin as any).from("growth_outreach_emails").insert({
        campaign_id: data.campaignId,
        opportunity_key: data.opportunityKey ?? null,
        source: data.sourceName,
        detected_intent: data.lookingFor,
        prospect_type: data.prospectType,
        location_label: data.location ?? null,
        channel: "email",
        recipient_email: data.recipientEmail,
        sender_account: OUTREACH_SENDER,
        content_version: message.contentVersion,
        subject: message.subject,
        eligibility_verdict: verdict,
        status,
        failure_reason: failure,
        provider_message_id: messageId,
        provider_thread_id: threadId,
      });
    };

    if (!looksLikeEmailAddress(data.recipientEmail)) {
      await record(
        "BLOCKED",
        "The address is not a valid email address.",
        "NOT_ELIGIBLE",
        null,
        null,
      );
      return {
        sent: false,
        status: "BLOCKED",
        detail: "That is not a valid email address, so nothing was sent.",
        messageId: null,
      };
    }

    const snapshot = await buildSnapshot(supabaseAdmin as any);
    if (!snapshot.view.sendingReady) {
      await record("BLOCKED", snapshot.view.detail, "NOT_ELIGIBLE", null, null);
      return {
        sent: false,
        status: snapshot.view.status,
        detail: snapshot.view.detail,
        messageId: null,
      };
    }

    // The existing gate decides. Nothing here can overrule it.
    const eligibility = evaluateOutreachEligibility({
      recipient: data.recipientEmail,
      channel: "email",
      sourceTermsPermitOutreach: data.sourceTermsPermitOutreach,
      sourceTermsReviewed: data.sourceTermsReviewed,
      contactMechanismPermitsOutreach: data.contactMechanismPermitsOutreach,
      consent: data.consent,
      suppressed: data.suppressed,
      hoursSinceLastContact: data.hoursSinceLastContact ?? null,
      duplicateFingerprint: data.duplicateFingerprint,
    });
    if (!eligibility.mayContact) {
      await record("BLOCKED", eligibility.reason, eligibility.verdict, null, null);
      return {
        sent: false,
        status: eligibility.verdict,
        detail: eligibility.reason,
        messageId: null,
      };
    }

    const result = await gmailSend(
      buildRawEmail({
        to: data.recipientEmail,
        from: OUTREACH_SENDER,
        subject: message.subject,
        body: message.body,
      }),
    );

    if (!result.ok) {
      await record("FAILED", result.error, eligibility.verdict, null, null);
      return { sent: false, status: "FAILED", detail: result.error, messageId: null };
    }

    await record("SENT", null, eligibility.verdict, result.value.id, result.value.threadId);
    await (supabaseAdmin as any).from("marketing_audit").insert({
      action: "outreach_email_sent",
      detail: `Outreach email sent from ${OUTREACH_SENDER}; Gmail message id ${result.value.id}.`,
      actor: "human",
      actor_id: context.userId,
    });

    return {
      sent: true,
      status: "SENT",
      detail: `Gmail confirmed the send. Message id ${result.value.id}.`,
      messageId: result.value.id,
    };
  });

/**
 * The founder-only test send.
 *
 * This proves the Gmail *send* action really works, which an identity check
 * can never do. The message goes to the connected outreach mailbox itself, so
 * no prospect and no third party can be reached, and success is claimed only
 * when Gmail returns a real message id.
 */
export const testGmailSendCapability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ confirm: z.literal(true) }).parse(data))
  .handler(
    async ({
      context,
    }): Promise<{
      ok: boolean;
      detail: string;
      messageId: string | null;
      snapshot: GmailOutreachSnapshot;
    }> => {
      const supabase = context.supabase as any;
      await assertAdmin(supabase);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { gmailSend } = await import("@/lib/growth/gmail.server");
      const { buildTestSendMessage } = await import("@/lib/growth/gmail");

      const before = await buildSnapshot(supabaseAdmin as any);
      if (!before.view.canTestSend) {
        return { ok: false, detail: before.view.detail, messageId: null, snapshot: before };
      }

      const test = buildTestSendMessage();
      const result = await gmailSend(
        buildRawEmail({
          to: OUTREACH_SENDER,
          from: OUTREACH_SENDER,
          subject: test.subject,
          body: test.body,
        }),
      );

      const detail = result.ok
        ? `Gmail accepted the test message and returned message id ${result.value.id}. No prospect email was sent.`
        : `Gmail send action returned an error: ${result.error}`;

      await (supabaseAdmin as any).from("marketing_audit").insert({
        action: result.ok ? "gmail_send_verified" : "gmail_send_failed",
        detail,
        actor: "human",
        actor_id: context.userId,
      });

      return {
        ok: result.ok,
        detail,
        messageId: result.ok ? result.value.id : null,
        snapshot: await buildSnapshot(supabaseAdmin as any),
      };
    },
  );
