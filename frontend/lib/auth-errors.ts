/**
 * User-facing messages for Better Auth calls.
 *
 * Better Fetch returns `{ data, error }` for HTTP errors, but rejects the
 * promise for network failures/timeouts. Keep both paths honest: never collapse
 * an unreachable server or a gateway 5xx into "Login failed".
 */

export interface AuthErrorLike {
  message?: string;
  status?: number;
  statusText?: string;
}

const CONNECTION_MESSAGE = "Could not reach the server. Check your connection and try again.";
const TIMEOUT_MESSAGE = "The server took too long to respond. Please try again.";
const SERVER_MESSAGE = "The server is temporarily unavailable. Please try again in a moment.";

export function authErrorMessage(error: AuthErrorLike | null | undefined, fallback: string): string {
  if (!error) return fallback;
  // Classify by status BEFORE trusting `message`: gateway 5xx bodies and raw
  // provider/server text must never reach the user.
  if (error.status === 429) return "Too many attempts. Please wait a moment and try again.";
  if (typeof error.status === "number" && error.status >= 500) return SERVER_MESSAGE;
  if (!error.status) return CONNECTION_MESSAGE;
  // A 4xx from Better Auth carries a precise, safe message (invalid
  // credentials, origin check, validation).
  if (error.message) return error.message;
  return fallback;
}

/** Message for a rejected promise (offline, DNS, reset, or our 60 s timeout). */
export function authCatchMessage(e: unknown, fallback: string): string {
  const name = typeof e === "object" && e !== null ? (e as { name?: unknown }).name : undefined;
  if (name === "AbortError" || name === "TimeoutError") return TIMEOUT_MESSAGE;
  if (e instanceof Error && e.message) return CONNECTION_MESSAGE;
  return fallback;
}
