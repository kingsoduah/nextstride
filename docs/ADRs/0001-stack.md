# ADR 0001 — Locked stack (2026-10-04)
- Frontend: Next.js + TypeScript (App Router), hosted on Netlify.
- Backend: NestJS + TypeScript REST + Swagger, hosted on Render Free (primary) / Koyeb Free (fallback).
- DB: PostgreSQL via Netlify Postgres, accessed with Prisma. Migrations required.
- Auth: Better Auth, email + password only for MVP.
- AI: Groq API behind an `AiProvider` interface; Zod-validated structured output; rule-based fallback ported from v0.1.
- Cost: free tiers first; any new paid service needs an ADR.
