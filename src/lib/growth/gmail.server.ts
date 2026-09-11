/**
 * Gmail transport — server only.
 *
 * The connection is gateway-backed: credentials never leave the server and are
 * never returned to the browser, logged or stored in the database. EarnRoom's
 * code calls exactly two Gmail endpoints:
 *
 *   GET  /users/me/profile   — to prove which account is connected
 *   POST /users/me/messages/send — to send one approved outreach email
 *
 * Nothing here lists, reads, searches or modifies mail.
 */
const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";

export type GmailCallResult<T> =
  { ok: true; value: T } | { ok: false; authorisation: boolean; status: number; error: string };

function credentials(): { lovableKey: string; connectionKey: string } | null {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const connectionKey = process.env["GOOGLE_MAIL_API_KEY"];
  if (!lovableKey || !connectionKey) return null;
  return { lovableKey, connectionKey };
}

export function gmailCredentialsPresent(): boolean {
  return credentials() !== null;
}

/** Strips anything token-shaped out of a provider message before it is stored. */
export function sanitiseGmailError(text: string): string {
  return text.replace(/[A-Za-z0-9_\-.]{40,}/g, "[redacted]").slice(0, 500);
}

async function call<T>(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown },
): Promise<GmailCallResult<T>> {
  const creds = credentials();
  if (!creds) {
    return { ok: false, authorisation: true, status: 0, error: "No Gmail account is connected." };
  }
  const response = await fetch(`${GATEWAY_URL}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${creds.lovableKey}`,
      "X-Connection-Api-Key": creds.connectionKey,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
  });

  if (!response.ok) {
    const text = sanitiseGmailError(await response.text());
    return {
      ok: false,
      authorisation: response.status === 401 || response.status === 403,
      status: response.status,
      error: text || `Gmail refused the request (${response.status}).`,
    };
  }
  return { ok: true, value: (await response.json()) as T };
}

/** Which account is connected. Reads no messages. */
export async function gmailProfile(): Promise<GmailCallResult<{ emailAddress: string }>> {
  return call<{ emailAddress: string }>("/users/me/profile", { method: "GET" });
}

/** Sends one message. Returns Gmail's own message id, or an honest failure. */
export async function gmailSend(
  raw: string,
): Promise<GmailCallResult<{ id: string; threadId: string | null }>> {
  const result = await call<{ id?: string; threadId?: string }>("/users/me/messages/send", {
    method: "POST",
    body: { raw },
  });
  if (!result.ok) return result;
  if (!result.value.id) {
    return {
      ok: false,
      authorisation: false,
      status: 200,
      error: "Gmail accepted the request but returned no message id, so the send is not confirmed.",
    };
  }
  return { ok: true, value: { id: result.value.id, threadId: result.value.threadId ?? null } };
}
