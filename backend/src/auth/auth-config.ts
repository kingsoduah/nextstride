import { VERIFIED_CLIENT_IP_HEADER } from './client-ip';

/**
 * Auth hardening is explicit: rate limiting must remain enabled regardless of
 * NODE_ENV, and Better Auth may only read the server-verified client-IP header
 * (never x-forwarded-for or x-nf-client-connection-ip, which public callers can
 * spoof against the Render API).
 */
export const AUTH_RATE_LIMIT = {
  enabled: true,
  window: 10,
  max: 100,
} as const;

export const AUTH_IP_ADDRESS_HEADERS = [VERIFIED_CLIENT_IP_HEADER] as const;
