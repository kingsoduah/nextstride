# NextStride — Implementation Plan v2 (locked stack)

**Status:** supersedes v1. v1 remains valid history; all decisions below are locked unless an ADR changes them.
**Source of truth:** `docs/NextStride Product Requirements Document (PRD).md`
**Visual reference:** attached UI design (Linear-style app shell — see §2). It is the primary frontend reference.
**Baseline:** v0.1 Python/vanilla prototype, preserved at `archive/v0.1-prototype/` as reference. Do not delete.

## Locked stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | Next.js + TypeScript (App Router) | Responsive, production-quality, follows attached design. Deployed to Netlify. |
| Backend | NestJS + TypeScript, REST, Swagger/OpenAPI | Modular (`auth`, `situations`, `ai`, `prisma`). |
| DB / ORM | PostgreSQL + Prisma | Schema from PRD §24. Local: Postgres (Docker) or `DATABASE_URL` to Netlify Postgres. Migrations required. |
| Auth | Better Auth (email + password for MVP) | No OAuth, no teams, no roles beyond `user`. Sessions verified by backend against shared DB. |
| AI | Groq API behind `AiProvider` interface | Zod/JSON-schema validated structured output. Rule-based fallback ported from v0.1 for offline/AI-down. Raw LLM output never touches app state. |
| Hosting (free-first) | Web → Netlify; DB → Netlify Postgres; API → Render Free (primary) / Koyeb Free (fallback) | Zero/near-zero cost. All secrets in env vars. Paid upgrades only via ADR. |

**Architecture:**

```
Next.js (Netlify) → NestJS REST API (Render/Koyeb) → Better Auth sessions + services → Prisma → PostgreSQL (Netlify Postgres)
NestJS → AiService (interface) → Groq provider → structured JSON → Zod validation → application logic → Next.js
```

## 1. UI design analysis (attached image)

What the image shows (Linear "Ask Linear" home): left sidebar nav (top: workspace switcher, search, compose; groups: Inbox / My issues; Workspace: Projects, Views, More; Your teams; Try: Import, Initiatives, Cycles, Connect); center panel with faint watermark, heading "Welcome to Linear" + subline, large composer card ("Ask Linear…", footer: Skills dropdown left, attach + submit right); "Get started with some examples" row with 3 cards (icon, title, 2-line description) + dismiss X; bottom bar ("Ask Linear", history icon); dark curated-by footer strip is Mobbin chrome — ignore.

**NextStride mapping (no redesign):** sidebar → NextStride nav (Priority Hub, My situations/history, Reassessments, Feedback; workspace-style groups only if needed); center → "Welcome to NextStride" + "What's competing for your attention?"; composer → situation input (multiline, attach optional-later — MVP text only); Skills dropdown → not built (out of scope); example cards → 3 PRD-grounded example situations (lecture/fellowship/delivery/assignment variants) that fill the composer on click; submit arrow → Analyze. Recommendation, understanding-confirm, version history, and feedback reuse the same card/composer language.

## 2. Inconsistencies found + resolutions (simplest sound approach)

| # | Conflict | Resolution |
|---|---|---|
| 1 | PRD requires landing/auth/onboarding (8 screens); design shows authenticated shell only. | Keep both: public routes (`/`, `/login`, `/signup`, `/onboarding`) in PRD copy style; authenticated shell (`/hub`, `/situations/*`) follows attached design. No redesign of shell. |
| 2 | PRD requires Confirm-Understanding before recommendation (§9.6); design implies ask→answer directly. | Insert confirm step inside shell as an "understanding card" between composer and recommendation, same visual language. Recommendation endpoint stays blocked until `confirmed=true`. |
| 3 | PRD feedback thumbs (§17); design has none. | Minimal feedback row under each recommendation version (👍/👎 + optional note). Same card style. |
| 4 | v1 plan proposed FastAPI-or-NestJS, cookie-vs-JWT open questions, Vercel-or-Netlify. | Locked per user: NestJS, Better Auth, Netlify web + Netlify Postgres + Render/Koyeb API. Recorded in `docs/ADRs/0001-stack.md`. |
| 5 | Better Auth absent from v1; PRD auth endpoints assumed custom. | Better Auth owns sessions; NestJS keeps a thin `auth` module that verifies Better Auth sessions from shared Postgres and enforces ownership. PRD endpoint names preserved where possible (`/api/auth/me` etc. map to session checks). |
| 6 | v1 hosting vague; cost not a constraint. | Cost is now architectural: free tiers first; every new service must pass the 5 cost questions (free alternative? sufficient? handled by stack? lock-in? recurring cost?). |
| 7 | Prototype dirs (`frontend/`, `backend/`) collide with Next.js/NestJS scaffolds. | Archive v0.1 to `archive/v0.1-prototype/` via `git mv` (history preserved). Recreate `frontend/` (Next.js) and `backend/` (NestJS) cleanly. Port, don't copy, the useful logic. |

## 3. What is preserved from v0.1 (not discarded)

- Core loop + endpoint shapes → ported to NestJS controllers (same paths, §5).
- `ai_service.py` scoring/conflict heuristics → ported to `backend/src/ai/rule-based-fallback.ts` (offline/AI-down fallback + tests).
- PRD example texts → frontend example cards + backend AI eval fixtures.
- "Coverage fell through flips plan" behavior → regression test.
- Data entity names → Prisma models.

## 4. Backend module map (NestJS)

```
backend/src/
  main.ts (helmet, cors, ValidationPipe, swagger)
  app.module.ts
  config/ (env validation: DATABASE_URL, GROQ_API_KEY, BETTER_AUTH_SECRET, CORS_ORIGIN)
  prisma/ (PrismaService)
  auth/ (Better Auth session verification guard + ownership guard; GET /api/auth/me passthrough)
  situations/ (CRUD + confirm; POST /api/situations, GET/PATCH /api/situations/:id)
  recommendations/ (POST /:id/prioritize versioned immutable; GET /:id/recommendations)
  reassessments/ (POST /:id/reassess → new version)
  feedback/ (POST /:id/feedback)
  ai/ (AiService orchestrator; providers/groq.provider.ts; schemas.ts Zod; prompts v1; rule-based-fallback.ts)
  common/ (error taxonomy, pagination, logging without sensitive content)
```

Prisma models: `User, Session, Account, Verification (Better Auth tables, do not hand-edit) + Situation, SituationContext, Responsibility, Conflict, Recommendation (@@unique([situationId, version])), Reassessment, Feedback, AiRun`. Ownership enforced per query (`userId`).

## 5. Frontend route map (Next.js App Router, design-first)

```
app/
  page.tsx (landing — PRD §10.1 copy)
  (auth)/login/page.tsx  (auth)/signup/page.tsx (Better Auth client)
  onboarding/page.tsx (4 steps, PRD §12)
  (shell)/layout.tsx (sidebar + center panel per design)
  (shell)/hub/page.tsx (welcome + composer + example cards)
  (shell)/situations/[id]/page.tsx (understanding card → confirm/edit → recommendation v-timeline → reassess composer → feedback row)
```

Components: `Sidebar, Composer, ExampleCards, UnderstandingCard, RecommendationCard, VersionTimeline, FeedbackRow, Skeletons, ErrorBanner, EmptyState`. Tokens + copy in `docs/DESIGN_SYSTEM.md` (to be written from the design: sidebar 260px, 8px radius cards, muted borders, single primary action).

## 6. AI layer (Groq, isolated)

`AiService.understand/prioritize/reassess` → builds prompt (PRD §§19–20 rules + high-stakes boundary §21) → `GroqProvider` calls Groq chat-completions with `response_format: json_object`, timeout 30s, 1 retry → Zod validate (`SituationContextSchema`, `RecommendationSchema`) → on fail: log `AiRun(status=invalid)` + rule-based fallback or `AI_UNAVAILABLE` error (never raw output). Prompt version stored per `AiRun`. Key in `GROQ_API_KEY` only.

## 7. Env vars (never hardcoded)

Web: `NEXT_PUBLIC_API_URL`. API: `DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL, CORS_ORIGIN, GROQ_API_KEY, GROQ_MODEL (default llama-3.3-70b-versatile), PORT`. Each app has `.env.example`; `.env*` git-ignored.

## 8. Phases (with exit checks)

- **P0 Repo prep (this change):** archive v0.1, `.gitignore` for Node/Nest/Next/Prisma/env, root `package.json` workspaces, `.env.example`s, `prisma/schema.prisma`, ADRs, `docs/DESIGN_SYSTEM.md` stub from design. Verify: `git status` clean-ish, `cmd /c "npm --version"`, prisma format check later.
- **P1 API foundation:** NestJS boot + Prisma migrate + health + Swagger + Better Auth tables + session guard + `AiRun` logging. Verify: `npm run build` (api), Swagger loads, migration applies to local Postgres.
- **P2 Situations loop (no AI yet):** situations CRUD + confirm using fallback provider. Verify: endpoint tests green, ownership tests (A≠B) green.
- **P3 Groq integration:** provider + schemas + prompts + eval fixtures. Verify: example texts produce valid structured output; invalid output → fallback/error, never persisted raw.
- **P4 Web shell (design):** sidebar/composer/examples per §1 + landing/auth/onboarding. Verify: responsive 360px/desktop, a11y pass, matches design spacing/hierarchy.
- **P5 Connect loop end-to-end:** hub→understand→confirm→recommend→reassess→feedback against real API+DB+auth. Verify: full journey on staging with zero paid services.
- **P6 Harden + deploy:** rate limits, helmet, CORS, error taxonomy, Netlify web + Netlify Postgres + Render/Koyeb API deploys, runbook. Verify: prod health, free-tier checklist, tag `v1.0-mvp`.

Each phase: build passes, `tsc --noEmit` clean, API + DB + auth checks, UI-vs-design check. No mocked-as-complete features.

## 9. Cost checklist (every new dependency)

Free alternative? Free tier sufficient for MVP? Handled by existing stack? Lock-in? Recurring cost pre-users? Groq free tier + Netlify free + Netlify Postgres free + Render/Koyeb free satisfy MVP; anything else needs an ADR.

## 10. Immediate next actions

1. Archive prototype + new `.gitignore` + workspace root + env examples + Prisma schema (P0).
2. Scaffold NestJS API + Next.js web (P1/P4 starters).
3. Write `docs/DESIGN_SYSTEM.md` tokens/components from the design before feature UI.
