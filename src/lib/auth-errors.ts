/**
 * Maps authentication/database errors to friendly, non-technical messages.
 * Never surface raw provider messages or stack traces to users.
 */
export function friendlyAuthError(error: unknown): string {
  const raw =
    typeof error === "string"
      ? error
      : error && typeof error === "object" && "message" in error
        ? String((error as { message: unknown }).message)
        : "";

  const m = raw.toLowerCase();

  if (!m) return "Something went wrong. Please try again.";

  if (m.includes("failed to fetch") || m.includes("network") || m.includes("timeout")) {
    return "We couldn't reach the network. Check your connection and try again.";
  }
  if (m.includes("invalid login credentials")) {
    return "That email and password don't match. Please check and try again.";
  }
  if (m.includes("email not confirmed")) {
    return "Please confirm your email address first — check your inbox for the link.";
  }
  if (m.includes("already registered") || m.includes("already exists") || m.includes("duplicate")) {
    return "An account with that email already exists. Try logging in instead.";
  }
  if (m.includes("password should be") || m.includes("weak password") || m.includes("pwned")) {
    return "Please choose a stronger password — at least 8 characters, and not a common one.";
  }
  if (m.includes("invalid email") || m.includes("unable to validate email")) {
    return "That email address doesn't look right.";
  }
  if (m.includes("expired") || m.includes("invalid or has expired") || m.includes("otp")) {
    return "That link has expired. Please request a new one.";
  }
  if (m.includes("rate limit") || m.includes("too many")) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  if (m.includes("unauthorized") || m.includes("jwt") || m.includes("session")) {
    return "Your session has ended. Please log in again.";
  }

  return "Something went wrong. Please try again.";
}
