/**
 * At-rest encryption for platform authorisation tokens.
 *
 * Tokens are AES-GCM encrypted with a server-only key before they touch the
 * database, and are only ever decrypted inside a server handler at the moment
 * of a publish. No token, ciphertext or key is ever returned to the browser.
 */
const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function key(): Promise<CryptoKey> {
  const secret = process.env["MARKETING_TOKEN_KEY"];
  if (!secret) throw new Error("Token encryption is not configured on this server.");
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/** Returns "<iv>.<ciphertext>", both base64. */
export async function encryptToken(plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await key(),
    encoder.encode(plaintext),
  );
  return `${toBase64(iv)}.${toBase64(new Uint8Array(cipher))}`;
}

export async function decryptToken(value: string): Promise<string> {
  const [ivPart, cipherPart] = value.split(".");
  if (!ivPart || !cipherPart) throw new Error("Stored authorisation is unreadable.");
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(ivPart) },
    await key(),
    fromBase64(cipherPart),
  );
  return decoder.decode(plain);
}

export function tokenEncryptionConfigured(): boolean {
  return Boolean(process.env["MARKETING_TOKEN_KEY"]);
}
