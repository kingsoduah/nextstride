"use client";
import { createAuthClient } from "better-auth/react";
import { API_URL } from "./api";

// Better Auth server lives in the NestJS API at /api/auth/* (same Postgres).
export const authClient = createAuthClient({
  baseURL: `${API_URL}/api/auth`,
  fetchOptions: { credentials: "include" },
});
