import { PrismaClient } from '@prisma/client';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { AUTH_IP_ADDRESS_HEADERS, AUTH_RATE_LIMIT } from './auth-config';

// Dedicated client for Better Auth's own tables (User/Session/Account/Verification).
// Application queries use PrismaService. Both point at the same DATABASE_URL.
const db = new PrismaClient();

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3001',
  trustedOrigins: (process.env.CORS_ORIGIN ?? 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  database: prismaAdapter(db, { provider: 'postgresql' }),
  // Explicitly enabled: Better Auth would otherwise default to enabled only
  // when NODE_ENV === 'production', so a missing NODE_ENV silently disabled
  // login throttling. Never derive this from NODE_ENV again.
  rateLimit: AUTH_RATE_LIMIT,
  advanced: {
    ipAddress: {
      // The Render API is publicly reachable, so no forwarding header is
      // trusted by default. The Netlify middleware HMAC-signs the client IP
      // and timestamp with AUTH_PROXY_SECRET; the API sets this server-only
      // header only after verifying the signature. When the header is absent
      // (direct API calls, missing/mismatched secret) Better Auth keeps its
      // safe shared per-path rate-limit bucket.
      ipAddressHeaders: [...AUTH_IP_ADDRESS_HEADERS],
    },
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 6,
    requireEmailVerification: false,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
  },
});

export type AuthSession = Awaited<ReturnType<typeof auth.api.getSession>>;
