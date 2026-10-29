import { createHmac, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { Logger } from '@nestjs/common';
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Trusted client-IP hand-off.
 *
 * The Render API is publicly reachable, so it cannot trust a client-IP header
 * merely because it is present. The Netlify middleware signs the client IP and
 * a Unix timestamp with HMAC-SHA256 using a shared server-only secret:
 *
 *   payload   = "v1|<ip>|<unix-seconds>"
 *   signature = HMAC-SHA256(AUTH_PROXY_SECRET, payload), lowercase hex
 *
 * The API verifies the signature, rejects timestamps outside a short window,
 * and only then exposes the IP to Better Auth through a private header. This
 * binds the IP to the credential (tampering fails) and limits replay of a
 * captured header to the timestamp window. Within that window, a captured
 * same-IP header can still be replayed — it grants no different IP than the
 * victim's own rate-limit bucket.
 */

export const PROXY_CLIENT_IP_HEADER = 'x-nextstride-client-ip';
export const PROXY_TIMESTAMP_HEADER = 'x-nextstride-timestamp';
export const PROXY_SIGNATURE_HEADER = 'x-nextstride-signature';
export const VERIFIED_CLIENT_IP_HEADER = 'x-nextstride-verified-client-ip';

export const PROXY_SIGNATURE_VERSION = 'v1';
export const PROXY_CLOCK_SKEW_SECONDS = 60;
/** HMAC keys shorter than this are refused rather than silently weakened. */
export const MIN_PROXY_SECRET_LENGTH = 32;

export type ProxyVerificationFailure =
  | 'missing_secret'
  | 'weak_secret'
  | 'missing_headers'
  | 'invalid_timestamp'
  | 'stale_timestamp'
  | 'invalid_ip'
  | 'bad_signature';

export type ProxyVerificationResult =
  | { ok: true; ip: string }
  | { ok: false; reason: ProxyVerificationFailure };

type HeaderBag = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // timingSafeEqual requires equal lengths; length is not secret here.
  return a.length === b.length && timingSafeEqual(a, b);
}

function signaturesMatch(provided: string, expected: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(provided)) return false;
  return secretsMatch(provided.toLowerCase(), expected.toLowerCase());
}

/** Canonical signed payload. The frontend middleware must use this exact form. */
export function proxySignaturePayload(ip: string, timestamp: string): string {
  return `${PROXY_SIGNATURE_VERSION}|${ip}|${timestamp}`;
}

/** HMAC-SHA256 of the canonical payload, lowercase hex. Exported for tests. */
export function signClientIp(secret: string, ip: string, timestamp: string): string {
  return createHmac('sha256', secret).update(proxySignaturePayload(ip, timestamp)).digest('hex');
}

/**
 * Verifies a signed proxy request. Returns the IP only when the secret,
 * timestamp window, signature, and IP syntax all pass.
 */
export function verifyTrustedClientIp(
  headers: HeaderBag,
  secret: string | undefined,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): ProxyVerificationResult {
  if (!secret) return { ok: false, reason: 'missing_secret' };
  if (secret.length < MIN_PROXY_SECRET_LENGTH) return { ok: false, reason: 'weak_secret' };

  const ip = single(headers[PROXY_CLIENT_IP_HEADER]).trim();
  const timestamp = single(headers[PROXY_TIMESTAMP_HEADER]).trim();
  const signature = single(headers[PROXY_SIGNATURE_HEADER]).trim();
  if (!ip || !timestamp || !signature) return { ok: false, reason: 'missing_headers' };

  if (!/^\d{1,12}$/.test(timestamp)) return { ok: false, reason: 'invalid_timestamp' };
  const issuedAt = Number(timestamp);
  if (!Number.isSafeInteger(issuedAt)) return { ok: false, reason: 'invalid_timestamp' };
  if (Math.abs(nowSeconds - issuedAt) > PROXY_CLOCK_SKEW_SECONDS) {
    return { ok: false, reason: 'stale_timestamp' };
  }

  if (!isIP(ip)) return { ok: false, reason: 'invalid_ip' };

  const expected = signClientIp(secret, ip, timestamp);
  if (!signaturesMatch(signature, expected)) return { ok: false, reason: 'bad_signature' };
  return { ok: true, ip };
}

const logger = new Logger('auth-client-ip');
const warned = new Set<ProxyVerificationFailure>();

const FAILURE_MESSAGES: Record<ProxyVerificationFailure, string> = {
  missing_secret:
    'AUTH_PROXY_SECRET is not configured; verified client IPs are unavailable and Better Auth will use one shared rate-limit bucket. Set the same 32+ character secret on Netlify and the API.',
  weak_secret:
    'AUTH_PROXY_SECRET is shorter than 32 characters; signed client IPs are refused and Better Auth will use one shared rate-limit bucket. Use the same high-entropy secret on Netlify and the API.',
  missing_headers:
    'Signed proxy headers were not present on an auth request; using the shared rate-limit bucket. Check that the Netlify middleware runs and forwards request headers to the API.',
  invalid_timestamp:
    'Signed proxy timestamp was malformed; using the shared rate-limit bucket. Check the Netlify middleware clock/header forwarding.',
  stale_timestamp:
    'Signed proxy timestamp was outside the allowed clock window; using the shared rate-limit bucket. Check clock skew between Netlify and the API.',
  invalid_ip:
    'Signed proxy client IP was not a valid IP address; using the shared rate-limit bucket.',
  bad_signature:
    'Proxy signature verification failed; using the shared rate-limit bucket. Netlify and the API may have different AUTH_PROXY_SECRET values.',
};

/** Logs a secret-free, actionable diagnostic once per failure reason. */
export function warnProxyVerificationFailure(reason: ProxyVerificationFailure): void {
  if (warned.has(reason)) return;
  warned.add(reason);
  logger.warn(FAILURE_MESSAGES[reason]);
}

/** Test helper: forget which diagnostics have already been emitted. */
export function resetProxyWarningState(): void {
  warned.clear();
}

/**
 * Express middleware mounted before Better Auth on /api/auth. It always
 * discards any inbound verified-IP or signed-proxy headers, and only re-adds
 * the verified IP after HMAC validation, so direct callers can never choose
 * their rate-limit bucket.
 */
export function trustedClientIpMiddleware(
  req: IncomingMessage,
  _res: ServerResponse,
  next: (err?: unknown) => void,
): void {
  const headers = req.headers as HeaderBag;
  delete headers[VERIFIED_CLIENT_IP_HEADER];
  // Do not let forged platform/proxy headers reach anything downstream.
  delete headers['x-nf-client-connection-ip'];

  const result = verifyTrustedClientIp(headers, process.env.AUTH_PROXY_SECRET);
  delete headers[PROXY_CLIENT_IP_HEADER];
  delete headers[PROXY_TIMESTAMP_HEADER];
  delete headers[PROXY_SIGNATURE_HEADER];

  if (result.ok) {
    headers[VERIFIED_CLIENT_IP_HEADER] = result.ip;
  } else {
    warnProxyVerificationFailure(result.reason);
  }
  next();
}
