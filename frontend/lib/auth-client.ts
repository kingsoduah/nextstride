"use client";
import { createAuthClient } from "better-auth/react";

// Better Auth server lives ONLY in the NestJS API at /api/auth/* (same Postgres).
// This file creates the client only — never a second server.
// baseURL must be absolute when provided: better-auth validates it eagerly and
// throws "Invalid base URL" for relative values during `next build` prerender.
// - Local: NEXT_PUBLIC_API_URL=http://localhost:3001 (absolute, unchanged).
// - Netlify: NEXT_PUBLIC_API_URL is empty, so we pass undefined and the client
//   uses the browser's own origin at runtime → same-origin /api/auth proxy.
const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL;
export const authClient = createAuthClient({
  baseURL: configuredApiUrl ? `${configuredApiUrl}/api/auth` : undefined,
  fetchOptions: { credentials: "include" },
});
