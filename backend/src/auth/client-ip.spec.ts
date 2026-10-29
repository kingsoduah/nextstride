import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { IncomingMessage } from 'node:http';
import {
  MIN_PROXY_SECRET_LENGTH,
  PROXY_CLIENT_IP_HEADER,
  PROXY_SIGNATURE_HEADER,
  PROXY_TIMESTAMP_HEADER,
  VERIFIED_CLIENT_IP_HEADER,
  resetProxyWarningState,
  signClientIp,
  trustedClientIpMiddleware,
  verifyTrustedClientIp,
} from './client-ip';

const SECRET = 'test-only-proxy-secret-0123456789abcdef';
const IP = '203.0.113.7';
const NOW = 1_800_000_000;

let savedSecret: string | undefined;

beforeEach(() => {
  savedSecret = process.env.AUTH_PROXY_SECRET;
  process.env.AUTH_PROXY_SECRET = SECRET;
  resetProxyWarningState();
});

afterEach(() => {
  if (savedSecret === undefined) delete process.env.AUTH_PROXY_SECRET;
  else process.env.AUTH_PROXY_SECRET = savedSecret;
});

function signedHeaders(
  over: Record<string, string> = {},
  opts: { ip?: string; timestamp?: string; secret?: string } = {},
) {
  const ip = opts.ip ?? IP;
  const timestamp = opts.timestamp ?? String(NOW);
  return {
    [PROXY_CLIENT_IP_HEADER]: ip,
    [PROXY_TIMESTAMP_HEADER]: timestamp,
    [PROXY_SIGNATURE_HEADER]: signClientIp(opts.secret ?? SECRET, ip, timestamp),
    ...over,
  };
}

function request(over: Record<string, string> = {}): IncomingMessage {
  // Middleware verification uses the real clock, unlike the pure tests above.
  const timestamp = String(Math.floor(Date.now() / 1000));
  return { headers: signedHeaders(over, { timestamp }) } as unknown as IncomingMessage;
}

describe('verifyTrustedClientIp', () => {
  it('accepts a valid HMAC-signed IP inside the clock window', () => {
    expect(verifyTrustedClientIp(signedHeaders(), SECRET, NOW)).toEqual({ ok: true, ip: IP });
  });

  it('accepts the documented clock-skew boundaries', () => {
    for (const timestamp of [String(NOW - 60), String(NOW + 60)]) {
      expect(
        verifyTrustedClientIp(signedHeaders({}, { timestamp }), SECRET, NOW),
      ).toEqual({ ok: true, ip: IP });
    }
  });

  it('rejects a tampered IP (signature binds the IP)', () => {
    const headers = signedHeaders({ [PROXY_CLIENT_IP_HEADER]: '198.51.100.9' });
    expect(verifyTrustedClientIp(headers, SECRET, NOW)).toEqual({
      ok: false,
      reason: 'bad_signature',
    });
  });

  it('rejects a tampered or re-used timestamp outside the signature', () => {
    const headers = signedHeaders({ [PROXY_TIMESTAMP_HEADER]: String(NOW + 10) });
    expect(verifyTrustedClientIp(headers, SECRET, NOW)).toEqual({
      ok: false,
      reason: 'bad_signature',
    });
  });

  it('rejects expired and future timestamps even with a valid signature', () => {
    for (const timestamp of [String(NOW - 61), String(NOW + 61)]) {
      expect(
        verifyTrustedClientIp(signedHeaders({}, { timestamp }), SECRET, NOW),
      ).toEqual({ ok: false, reason: 'stale_timestamp' });
    }
  });

  it('rejects malformed timestamps and IPs', () => {
    const badTimestamp = signedHeaders({ [PROXY_TIMESTAMP_HEADER]: 'not-a-number' });
    expect(verifyTrustedClientIp(badTimestamp, SECRET, NOW)).toEqual({
      ok: false,
      reason: 'invalid_timestamp',
    });

    const badIp = signedHeaders({ [PROXY_CLIENT_IP_HEADER]: 'not-an-ip' });
    expect(verifyTrustedClientIp(badIp, SECRET, NOW)).toEqual({ ok: false, reason: 'invalid_ip' });
  });

  it('rejects missing headers', () => {
    expect(verifyTrustedClientIp({}, SECRET, NOW)).toEqual({
      ok: false,
      reason: 'missing_headers',
    });
  });

  it('rejects a missing or short secret, and a signature made with another secret', () => {
    expect(verifyTrustedClientIp(signedHeaders(), undefined, NOW)).toEqual({
      ok: false,
      reason: 'missing_secret',
    });
    expect(verifyTrustedClientIp(signedHeaders(), 'too-short', NOW)).toEqual({
      ok: false,
      reason: 'weak_secret',
    });
    expect(verifyTrustedClientIp(signedHeaders({}, { secret: 'x'.repeat(40) }), SECRET, NOW)).toEqual({
      ok: false,
      reason: 'bad_signature',
    });
    expect(MIN_PROXY_SECRET_LENGTH).toBe(32);
  });

  it('never reads x-forwarded-for', () => {
    const headers = {
      'x-forwarded-for': IP,
      [PROXY_TIMESTAMP_HEADER]: String(NOW),
      [PROXY_SIGNATURE_HEADER]: signClientIp(SECRET, IP, String(NOW)),
    };
    expect(verifyTrustedClientIp(headers, SECRET, NOW)).toEqual({
      ok: false,
      reason: 'missing_headers',
    });
  });
});

describe('trustedClientIpMiddleware', () => {
  it('sets the verified header and strips signed control headers', () => {
    const req = request({ 'x-nf-client-connection-ip': '198.51.100.9' });
    let called = false;
    trustedClientIpMiddleware(req, {} as never, () => {
      called = true;
    });
    expect(called).toBe(true);
    expect(req.headers[VERIFIED_CLIENT_IP_HEADER]).toBe(IP);
    expect(req.headers[PROXY_CLIENT_IP_HEADER]).toBeUndefined();
    expect(req.headers[PROXY_TIMESTAMP_HEADER]).toBeUndefined();
    expect(req.headers[PROXY_SIGNATURE_HEADER]).toBeUndefined();
    expect(req.headers['x-nf-client-connection-ip']).toBeUndefined();
  });

  it('discards a client-supplied verified header when the request is unsigned', () => {
    const req = {
      headers: { [VERIFIED_CLIENT_IP_HEADER]: '1.2.3.4', 'x-nf-client-connection-ip': '1.2.3.4' },
    } as unknown as IncomingMessage;
    trustedClientIpMiddleware(req, {} as never, () => undefined);
    expect(req.headers[VERIFIED_CLIENT_IP_HEADER]).toBeUndefined();
    expect(req.headers['x-nf-client-connection-ip']).toBeUndefined();
  });

  it('never trusts unsigned or forged key material without a verified signature', () => {
    delete process.env.AUTH_PROXY_SECRET;
    const req = request({ [VERIFIED_CLIENT_IP_HEADER]: '1.2.3.4' });
    trustedClientIpMiddleware(req, {} as never, () => undefined);
    expect(req.headers[VERIFIED_CLIENT_IP_HEADER]).toBeUndefined();
  });
});
