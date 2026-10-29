import { describe, expect, it } from 'vitest';
import { AUTH_IP_ADDRESS_HEADERS, AUTH_RATE_LIMIT } from './auth-config';
import { VERIFIED_CLIENT_IP_HEADER } from './client-ip';

describe('auth hardening config', () => {
  it('always enables Better Auth rate limiting, independent of NODE_ENV', () => {
    expect(AUTH_RATE_LIMIT.enabled).toBe(true);
    expect(AUTH_RATE_LIMIT.window).toBeGreaterThan(0);
    expect(AUTH_RATE_LIMIT.max).toBeGreaterThan(0);
  });

  it('trusts only the server-verified client-IP header', () => {
    expect([...AUTH_IP_ADDRESS_HEADERS]).toEqual([VERIFIED_CLIENT_IP_HEADER]);
    expect(AUTH_IP_ADDRESS_HEADERS).not.toContain('x-forwarded-for');
    expect(AUTH_IP_ADDRESS_HEADERS).not.toContain('x-nf-client-connection-ip');
  });
});
