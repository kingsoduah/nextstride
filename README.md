# NextStride — Initial Working Version (MVP v0.1)

> **When everything matters, know what to do next.**

## What NextStride Is

NextStride is an AI-powered priority decision assistant. It is **not** a task manager, calendar, or generic chatbot. It focuses on the single decision that happens when important responsibilities compete for limited time:

> What should I focus on now, what can wait, what should be delegated or communicated, and what should I do next?

Users describe their situation in natural language. NextStride understands the context, identifies conflicts, recommends what deserves attention next, explains why, gives a concrete next action, and reassesses when circumstances change.

Source of truth: `docs/NextStride Product Requirements Document (PRD).md`.

Core principle: **AI recommends. User decides. Backend records. New information triggers reassessment.**

## The Problem It Solves

Students carry multiple significant responsibilities — leadership, fellowships, businesses, jobs, courses, family, projects. These compete for the same time and attention (e.g. a lecture 2–5:30pm while coordinating a 4:30pm fellowship, with a customer delivery and an assignment due tomorrow).

The hard part is not listing tasks. It is deciding:

- What should happen first?
- What can wait, be delegated, or be communicated?
- What consequence should be accepted?
- What should I actually do right now?

Calendars and task managers store tasks but do not reason through tradeoffs. NextStride makes that decision process structured and actionable.

## Who It Is For

Primary user: **students with 2+ meaningful responsibility areas** who regularly face tradeoffs — student leaders, fellowship/church workers, student entrepreneurs, working students, students in professional courses or community organizations.

Desired feeling: *“I know what I should focus on right now.”*

## Main User Journey

1. **Discover** — Landing page: “When everything matters, know what to do next.”
2. **Sign Up / Log In** — Name, email, password → authenticated session.
3. **Onboarding** — 4-step mental model (no AI): you don’t need to do everything at once; tell us what competes; we’ll help prioritize; update us to reassess.
4. **Enter Situation (Priority Hub)** — `What's competing for your attention?` → natural-language input → `POST /api/situations`.
5. **Confirm Understanding** — “Here’s what I understand” (responsibilities, conflicts, uncertainties) → Confirm or Edit.
6. **Recommendation** — Recommended priority + why + next action + what happens to the others + reassess-if triggers → `POST /api/situations/:id/prioritize`.
7. **Act** — User acts. The MVP never autonomously executes consequential actions.
8. **Update + Reassess** — New info (e.g. “assistant can’t cover”) → `POST /api/situations/:id/reassess` → versioned Recommendation v2. History is preserved, never overwritten.
9. **Feedback** — 👍/👎 + optional outcome note → `POST /api/situations/:id/feedback`.

## Current Status

**Working v0.1 — implemented and runnable locally.**

| Area | Status |
|---|---|
| Frontend (`frontend/`) | Landing, auth, onboarding, Priority Hub, understanding, recommendation, reassessment, feedback — static HTML/CSS/JS |
| Backend (`backend/server.py`) | Auth, situation lifecycle, AI orchestration, versioning, feedback — Python stdlib HTTP server |
| AI service (`backend/ai_service.py`) | Rule-based `understandSituation / analyzeConflicts / generateRecommendation / reassessSituation` aligned with PRD §§18–20. LLM-ready signatures; no external API needed |
| Storage (`data/*.json`) | File-based JSON mirroring PRD §24 entities (users, situations, contexts, responsibilities, conflicts, recommendations, reassessments, feedback). PostgreSQL/Prisma migration planned |
| API | `POST /api/auth/register, /login, /logout`, `GET /api/auth/me`, `POST /api/situations`, `GET/PATCH /api/situations/:id`, `POST /:id/prioritize`, `GET /:id/recommendations`, `POST /:id/reassess`, `POST /:id/feedback` |

### Run It

```powershell
python backend/server.py
# open http://localhost:8000
```

No dependencies to install (Python 3.11+ stdlib only).

### What Is Intentionally Out of Scope (per PRD §32)

Calendar/WhatsApp integrations, automated messaging, voice, notifications, task automation, collaboration, gamification, analytics, billing, multiple AI agents — all deferred until the core loop is validated.

### Next Steps

- Replace rule-based `ai_service.py` with LLM calls using the PRD §§22–23 input/output contracts (structured JSON + validation).
- Migrate `data/*.json` to PostgreSQL/Prisma per PRD §24.
- Add loading/error states polish, logging/observability (PRD §33), and real-user validation (PRD §§30–31).
