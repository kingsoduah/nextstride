# NextStride

> **When everything matters, know what to do next.**

NextStride is an AI-powered priority decision assistant for students juggling competing responsibilities. Instead of being another task manager, calendar, or generic chatbot, it answers one question: *what should I focus on now, what can wait, what should be delegated or communicated — and what should I do next?*

**Core principle:** AI recommends. The user decides. The backend records. New information triggers reassessment.

## The Problem

Students carry multiple significant responsibilities — lectures, fellowships, businesses, jobs, courses, family. These compete for the same limited time and attention. The hard part is not listing tasks; it is reasoning through tradeoffs: what goes first, what can be delegated, what must be communicated, and which consequence to accept.

## Who It Is For

Students with two or more meaningful responsibility areas who regularly face tradeoffs — student leaders, fellowship workers, student entrepreneurs, working students, and highly involved university students.

## How It Works

1. **Describe** what is competing for your attention in natural language (Priority Hub).
2. **Confirm** NextStride's understanding — responsibilities, conflicts, uncertainties — or edit it. No recommendation is made from an unconfirmed reading.
3. **Receive** a recommendation: what deserves attention now, why, a concrete next action, what happens to the other responsibilities, and what would trigger a rethink.
4. **Update** when circumstances change; NextStride reassesses and versions the recommendation (v1 → v2), preserving history.
5. **Give feedback** (helpful / not helpful) so usefulness can be measured.

## Features (MVP)

- Landing, email/password signup and login, 4-step onboarding
- Priority Hub with example situations
- AI situation understanding with confirm/edit gate
- Versioned recommendations (immutable, never overwritten)
- Reassessment on new information
- Feedback capture and decision history
- Swagger/OpenAPI docs at `/docs`
- AI observability (`AiRun` log: provider, model, prompt version, latency, validation status)

Out of scope for this MVP: calendar integrations, automated messaging, notifications, collaboration, gamification, analytics dashboards, billing, OAuth/social login.

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 15 + TypeScript + React 19 |
| Backend | NestJS 11 + TypeScript, REST, Swagger |
| Database | PostgreSQL + Prisma ORM (migrations) |
| Auth | Better Auth (email + password, 7-day sessions) |
| AI | Groq API (`openai/gpt-oss-20b`) behind a provider interface, Zod-validated structured output, deterministic rule-based fallback |

## Architecture

```
Browser → Next.js (Netlify)
            ├─ same-origin /api/* ──proxy (rewrite)──▶ NestJS API (Render)
            │                                            ├─ Better Auth sessions ─▶ PostgreSQL (Neon/Netlify DB)
            │                                            ├─ Prisma persistence
            │                                            └─ AiService → Groq → Zod validation → fallback on failure
            └─ static pages + client UI
```

Same-origin API proxying keeps session cookies first-party (`SameSite=Lax`, `HttpOnly`). Raw LLM output is never persisted: every AI response must pass Zod schemas or the request falls back / fails safely.

## Local Development

Prerequisites: Node 20+, Python 3.11+ (only for the optional local Postgres helper), a Groq API key.

```powershell
# 1. PostgreSQL (real, local, no Docker needed)
pip install pgserver
python scripts/pg_local.py start     # prints DATABASE_URL, syncs backend/.env

# 2. Backend
cd backend
npm install
npx prisma migrate dev               # creates all tables
npm run start:dev                    # http://localhost:3001, docs at /docs

# 3. Frontend (new terminal)
cd frontend
npm install
npm run dev                          # http://localhost:3000
```

## Environment Variables

Never commit real values (`.env` files are git-ignored). See `backend/.env.example` and `frontend/.env.example`.

Backend (`backend/.env`):

| Variable | Purpose |
|---|---|
| `PORT` | API port (local: `3001`) |
| `DATABASE_URL` | PostgreSQL connection string |
| `BETTER_AUTH_SECRET` | Session signing secret (generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) |
| `BETTER_AUTH_URL` | Public API origin (local: `http://localhost:3001`) |
| `CORS_ORIGIN` | Allowed web origin (local: `http://localhost:3000`) |
| `GROQ_API_KEY` | Server-side Groq key (never exposed to the browser) |
| `GROQ_MODEL` | Groq model id (e.g. `openai/gpt-oss-20b`) |

Frontend (`frontend/.env.local`):

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_API_URL` | API origin for the browser (local: `http://localhost:3001`; production: empty = same-origin proxy) |
| `BACKEND_URL` | Build-time API target for Next.js `/api/*` + `/docs*` proxy rewrites (local default: `http://localhost:3001`) |

## Deployment

| Service | Target | Status |
|---|---|---|
| Frontend | Netlify (`netlify.toml` in repo root) | _URL added after deploy_ |
| Backend | Render Free web service (`render.yaml` Blueprint) | _URL added after deploy_ |
| Database | Managed PostgreSQL (Neon/Netlify DB), Prisma `migrate deploy` on build | _provisioned at deploy_ |

Production notes: set `BETTER_AUTH_URL` to the Render URL, `CORS_ORIGIN` to the Netlify URL, `BACKEND_URL` (Netlify) to the Render URL, and keep `NEXT_PUBLIC_API_URL` empty so the browser uses the same-origin proxy. Render Free sleeps after inactivity (cold starts ~1 min); Groq free-tier limits apply.

## Project Layout

```
frontend/          Next.js app (routes, components, API client, Better Auth client)
backend/           NestJS API (auth, situations, ai/, prisma/, Swagger)
backend/prisma/    schema.prisma + migrations
docs/              PRD, implementation plan, design system, ADRs
archive/           v0.1 Python/vanilla prototype (reference only)
scripts/           local Postgres helper
```

## Known MVP Limitations

- Email/password auth only; no password reset, no OAuth.
- AI quality depends on Groq model availability and free-tier limits; offline/AI-down degrades to the rule-based fallback.
- Free-tier hosting sleeps when idle (first request after sleep is slow).
- Single-language (English) UI; desktop-first responsive design.
