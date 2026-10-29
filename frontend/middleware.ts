import { NextResponse, type NextRequest } from "next/server";

/**
 * Sign the client IP for auth requests proxied to the Render API.
 *
 * Netlify sets `x-nf-client-connection-ip` at its edge. The Render API is
 * publicly reachable, so the IP must be authenticated: this middleware signs
 * `v1|<ip>|<unix-seconds>` with HMAC-SHA256 using AUTH_PROXY_SECRET. The API
 * verifies the signature and a short timestamp window before trusting the IP.
 *
 * Scope limitation: the matcher covers only /api/auth/*. Netlify must forward
 * these modified request headers through the Next.js external rewrite for the
 * scheme to work. That propagation is not exercised by local builds; if it is
 * dropped, the API logs a secret-free "missing signed proxy headers" warning
 * and falls back to its shared rate-limit bucket. Rate limiting is never
 * disabled by this path.
 */
const CLIENT_IP_HEADER = "x-nextstride-client-ip";
const TIMESTAMP_HEADER = "x-nextstride-timestamp";
const SIGNATURE_HEADER = "x-nextstride-signature";
const VERIFIED_CLIENT_IP_HEADER = "x-nextstride-verified-client-ip";
const NETLIFY_CLIENT_IP_HEADER = "x-nf-client-connection-ip";

const SIGNATURE_VERSION = "v1";
const MIN_SECRET_LENGTH = 32;
const LOG_PREFIX = "[auth-proxy]";

let warnedMissingConfig = false;
let warnedMissingIp = false;
let warnedSigningFailure = false;

function warnOnce(kind: "config" | "ip" | "signing", message: string) {
  if (kind === "config" && warnedMissingConfig) return;
  if (kind === "ip" && warnedMissingIp) return;
  if (kind === "signing" && warnedSigningFailure) return;
  if (kind === "config") warnedMissingConfig = true;
  if (kind === "ip") warnedMissingIp = true;
  if (kind === "signing") warnedSigningFailure = true;
  // Secret-free, value-free diagnostic for Netlify function logs.
  console.warn(`${LOG_PREFIX} ${message}`);
}

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Must match `proxySignaturePayload` in backend/src/auth/client-ip.ts. */
function payload(ip: string, timestamp: string): string {
  return `${SIGNATURE_VERSION}|${ip}|${timestamp}`;
}

async function sign(secret: string, value: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return toHex(signature);
}

export async function middleware(request: NextRequest) {
  const headers = new Headers(request.headers);
  // Never forward caller-supplied control headers.
  headers.delete(CLIENT_IP_HEADER);
  headers.delete(TIMESTAMP_HEADER);
  headers.delete(SIGNATURE_HEADER);
  headers.delete(VERIFIED_CLIENT_IP_HEADER);

  const clientIp = request.headers.get(NETLIFY_CLIENT_IP_HEADER)?.trim();
  // Never forward the Netlify-specific header downstream.
  headers.delete(NETLIFY_CLIENT_IP_HEADER);

  const secret = process.env.AUTH_PROXY_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    warnOnce(
      "config",
      "AUTH_PROXY_SECRET is missing or shorter than 32 characters; signed client-IP headers will not be sent. The API will fall back to its shared rate-limit bucket.",
    );
    return NextResponse.next({ request: { headers } });
  }

  if (!clientIp) {
    warnOnce(
      "ip",
      "Netlify did not provide x-nf-client-connection-ip; signed client-IP headers will not be sent.",
    );
    return NextResponse.next({ request: { headers } });
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();
  try {
    const signature = await sign(secret, payload(clientIp, timestamp));
    headers.set(CLIENT_IP_HEADER, clientIp);
    headers.set(TIMESTAMP_HEADER, timestamp);
    headers.set(SIGNATURE_HEADER, signature);
  } catch {
    warnOnce(
      "signing",
      "Could not sign the client-IP headers; the API will fall back to its shared rate-limit bucket.",
    );
  }

  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Only Better Auth needs the verified client IP. Keeping the matcher narrow
  // avoids forwarding auth-related private headers on unrelated API traffic.
  matcher: ["/api/auth/:path*"],
};
