# **NEXTSTRIDE V2 IMPLEMENTATION PLAN**

> **Document status (2026-10-09):** Phases 1–5 are IMPLEMENTED and verified locally, NOT yet committed. Phase 1–4 backend work is the protected baseline. This document is the source of truth for what each phase means; the roadmap below reflects confirmed decisions and supersedes earlier wording where noted.

## **Cross-phase requirements**

These apply to every remaining phase:

1. V2 is the primary user experience. Preserve necessary V1 regression coverage and shared infrastructure (auth, API, database, hosting).
2. Improve context fidelity so responsibilities, deadlines, effort, fixed events, progress, and human needs are correctly represented.
3. Never invent facts, exact times, delegation, or user commitments.
4. User-facing labels, errors, recommendation history, and status descriptions must be human-friendly and must not expose internal enum values or raw extraction artifacts.
5. Recommendation history should support opening historical snapshots where the underlying API provides the required data.
6. Phase 7 must validate decision quality across realistic scenarios and edge cases, not merely repeat the Phase 6 implementation tests.
7. Phase 8 owns voice input and spoken responses.
8. Phase 9 owns PWA conversion and Android APK packaging.
9. Complete phases sequentially, verifying each phase before moving on.
10. Keep planned, implemented, tested, and deployed states distinct. Do not mark a feature complete without evidence.

**State definitions:** PLANNED = described here, not built. IMPLEMENTED = code exists in the working tree. TESTED = verified per the phase's own criteria (tests and/or manual verification recorded). DEPLOYED = live in production. COMMITTED = recorded in git history.

## **Phase 1 — Decision Specification & Temporal Model — IMPLEMENTED**

> Status: implemented in `backend/src/decision/spec.ts` + `backend/src/temporal/` (verified present with unit specs). Uncommitted.

**Goal:** Define exactly what NextStride must understand before making a recommendation.

We establish:

### **Situation**

* User's raw description  
* Current timestamp  
* User timezone

### **Responsibilities**

Each responsibility can contain:

* title  
* description  
* category  
* deadline  
* deadline precision  
* effort estimate  
* effort confidence  
* consequence  
* flexibility  
* delegation possibility  
* dependencies  
* status

### **Temporal information**

Support:

* exact date/time  
* approximate date/time  
* relative date  
* relative time  
* unknown deadline

Examples:

> "Tomorrow at 7 AM"

> "Tomorrow around 7"

> "Friday"

> "By tomorrow"

> "Sometime this week"

> "After class"

The system should preserve uncertainty rather than invent precision.

### **Constraints**

* hard  
* soft  
* preference  
* unknown

### **Human needs**

Including:

* sleep  
* rest  
* meals  
* personal commitments  
* religious/community commitments  
* class  
* work  
* other fixed events

### **Unknowns**

Explicitly tracked.

### **Decision state**

Known  
Inferred  
Unknown  
Needs clarification  
---

# **Phase 2 — Structured Decision Context — IMPLEMENTED**

> Status: implemented (`backend/src/decision/`: parser service, expression builder, extraction, versioned `DecisionContext` rows + migration). Unit specs present. Uncommitted.

**Goal:** Convert messy user input into a structured representation.

Flow:

User's natural language  
        ↓  
Situation Parser  
        ↓  
Structured Decision Context

For example:

> "My assignment is due tomorrow around 7\. I haven't started and I need to sleep."

becomes conceptually:

Current time: known from system  
Deadline: tomorrow \~7  
Deadline precision: approximate  
Task status: not started  
Effort: unknown  
Sleep requirement: stated, duration unknown

Then NextStride can determine what it actually needs to know.

This phase should also prevent the AI from repeatedly asking for information that isn't necessary.

---

# **Phase 3 — Temporal, Constraint & Conflict Engine — IMPLEMENTED**

> Status: implemented (`backend/src/analysis/`: deterministic engine + API). Unit specs present. Uncommitted.

This is one of the most important phases.

**Goal:** Make time and constraints computationally reliable.

The engine should calculate:

### **Time remaining**

deadline \- current time

### **Available work windows**

For example:

Current time: 6 PM  
Sleep: 12 AM–6 AM  
Deadline: 7 AM

Available:  
6 PM–12 AM \= 6h  
6 AM–7 AM \= 1h

Total \= 7h

### **Required effort**

If known:

Required \= 6h  
Available \= 7h  
Buffer \= 1h

If unknown:

Required \= unknown

The engine shouldn't manufacture a number.

### **Feasibility**

Determine:

* Feasible  
* Tight  
* At risk  
* Infeasible  
* Cannot determine

### **Conflicts**

Detect:

* deadline conflict  
* time conflict  
* fixed commitment conflict  
* sleep/rest conflict  
* dependency conflict  
* capacity conflict

This becomes the **deterministic backbone** of NextStride.

---

# **Phase 4 — Improved AI Reasoning — IMPLEMENTED**

> Status: implemented (`backend/src/recommend/`: RecommendationV2 contract, reasoning prompt with verdict lines, deterministic diff, fallback recommender, versioned `RecommendationV2` rows + migration, guardrails, retry). Reported as 134/134 tests passing with live Groq verification. Uncommitted — protected baseline, do not revert.

Now we bring the LLM into the system more intelligently.

Instead of:

> Raw user message → LLM → recommendation

we move toward:

Raw user message  
       ↓  
Structured context  
       ↓  
Temporal calculations  
       ↓  
Constraints  
       ↓  
Conflicts  
       ↓  
Feasibility  
       ↓  
LLM reasoning  
       ↓  
Recommendation

The AI's job becomes:

* understand ambiguous human language  
* interpret context  
* reason about consequences  
* explain trade-offs  
* suggest realistic alternatives  
* ask necessary clarification questions  
* produce natural language

The deterministic system handles critical calculations.

This should also give us a much better opportunity to test whether **Groq/model quality** is actually the bottleneck.

---

# **Phase 5 — Recommendation V2 Frontend Surface — IMPLEMENTED**

> Status: implemented in the working tree (frontend only; no backend changes). Renders the Phase 4 `RecommendationV2` payload through `frontend/components/RecommendationV2.tsx` on the situation page, with all four statuses (RECOMMEND / REASSESS / NEEDS_INPUT / INFEASIBLE), NEEDS_INPUT answer → PATCH text → re-parse → new recommendation version, version history with in-session reopen, loading skeletons, friendly errors, and responsive layout reusing existing tokens. Verified: frontend `tsc` + `next build` clean; backend suite green; manual end-to-end loop exercised. Uncommitted.

The original Phase 5 concept below (a static recommendation mockup) is superseded by the implementation above and retained for reference only:

## Original concept (superseded, reference only)

The recommendation should stop looking like raw AI output.

The user should be able to understand it almost immediately.

Something closer to:

### **Your next move**

**Start the assignment now.**

Your deadline is around **7 AM tomorrow**, and you haven't started yet. Because the exact workload is unclear, let's first spend **20 minutes breaking it into parts and estimating what remains.**

**Tonight**  
 6:00 PM → focused work

**Protect**  
 Sleep

**Tomorrow**  
 Finish remaining work before submission.

**Risk**  
 The exact deadline and workload are still unclear.

**Next check**  
 Reassess after the first work block.

That's much more useful than a wall of AI-generated prose.

---

# **Phase 6 — V2 Consolidation, Decision Fidelity, and User Experience — PLANNED**

> Status: not started. Complete only after Phases 1–5 are committed.

**Goal:** consolidate the V2 loop into a coherent, trustworthy primary experience.

Scope (to be refined when Phase 6 begins; cross-phase requirements 1–5 apply throughout):

* Make V2 the primary user experience while preserving necessary V1 regression coverage and shared infrastructure.
* Improve context fidelity: responsibilities, deadlines, effort, fixed events, progress, and human needs must be correctly represented end to end.
* Harden the no-invention rule: no invented facts, exact times, delegation, or commitments anywhere in the pipeline or UI.
* Human-friendly surface: labels, errors, recommendation history, and status descriptions must never expose internal enum values or raw extraction artifacts.
* Recommendation history must support opening historical snapshots where the underlying API provides the required data (extend the API only if the UI cannot otherwise meet this).
* Verify each item above with evidence before marking Phase 6 complete. No PWA, voice, or benchmark-harness work in this phase.

## Superseded: original Phase 6 concept (reference only)

The earlier "Reassessment Engine" concept below is superseded: versioning, `previousId` chains, deterministic diffs, and the REASSESS status were already implemented in Phases 4–5. Retained for reference.

# **Phase 6 — Reassessment Engine (superseded, reference only)**

This is where NextStride starts behaving like a continuing decision system rather than a one-time chatbot.

The system records:

**State A**

Then time passes.

The user returns.

**State B**

NextStride compares:

Previous state  
       ↓  
What changed?  
       ↓  
What time passed?  
       ↓  
What work was completed?  
       ↓  
What estimates changed?  
       ↓  
Did feasibility change?  
       ↓  
New recommendation

For example:

**6 PM**

> 6 hours estimated.

**9:30 PM**

> Only 1 hour completed, 5 hours remaining.

NextStride recalculates rather than repeating itself.

---

# **Phase 7 — Decision-Quality Validation — PLANNED**

> Status: not started. Must validate decision quality across realistic scenarios and edge cases — not merely repeat Phase 6 implementation tests (requirement 6).

## Superseded: original Phase 7 concept (reference only)

The earlier "V1 vs V2 Benchmark" framing below is superseded by the decision-quality validation mandate above. The benchmark suite (`docs/NEXTSTRIDE_V2_BENCHMARK_SUITE.md`: 15 scenarios + paired time test) remains the evaluation instrument. Retained for reference.

# **Phase 7 — V1 vs V2 Benchmark (superseded, reference only)**

Now we actually run our benchmark.

The 15 core scenarios \+ the paired time test become our evaluation suite.

We compare V1 and V2 on:

* understanding  
* temporal accuracy  
* constraint adherence  
* feasibility  
* uncertainty  
* consequence reasoning  
* recommendation quality  
* clarity  
* reassessment

We should be able to demonstrate:

> **Here's what V1 did.**

versus:

> **Here's what V2 does.**

This is also where we identify remaining weaknesses before exposing the product to real students.

---

# **Phase 8 — Natural Voice Interaction — PLANNED**

> Status: not started. Phase 8 owns voice input AND spoken responses (requirement 7).

Only after the reasoning system is working properly.

The user should eventually be able to say something like:

> "I'm honestly overwhelmed. I have an assignment tomorrow, fellowship meeting in the evening, and I haven't even started the assignment. I need to sleep but I don't know how I'm going to fit everything."

And NextStride converts that speech into the same structured decision context.

So:

Voice  
  ↓  
Speech-to-text  
  ↓  
Situation understanding  
  ↓  
Temporal engine  
  ↓  
Constraint engine  
  ↓  
Decision engine  
  ↓  
Recommendation  
  ↓  
Voice/text response

The important thing is that **voice becomes another input method**, not a separate reasoning system. Spoken responses must present the same recommendation content as text — concise and glanceable even when heard.

# **Phase 9 — PWA Conversion and Android APK Packaging — PLANNED**

> Status: not started. Phase 9 owns PWA conversion and Android APK packaging (requirement 8). The earlier "STOP at Phase 8 / wait for class" deferral below is rescinded.

## Superseded: PWA deferral (reference only — rescinded)

> The roadmap previously stopped at Phase 8 pending a PWA class. That deferral is rescinded; PWA + APK is now Phase 9 below.

The roadmap becomes:

PHASE 1  
Decision Specification \+ Temporal Model  
       ↓  
PHASE 2  
Structured Decision Context  
       ↓  
PHASE 3  
Temporal \+ Constraint \+ Conflict Engine  
       ↓  
PHASE 4  
Improved AI Reasoning  
       ↓  
PHASE 5  
Recommendation V2 Frontend Surface (implemented, uncommitted)  
       ↓  
PHASE 6  
V2 Consolidation, Decision Fidelity & UX (planned)  
       ↓  
PHASE 7  
Decision-Quality Validation (planned)  
       ↓  
PHASE 8  
Natural Voice Interaction (planned)  
        ↓  
PHASE 9  
PWA Conversion + Android APK (planned)  
---

> **NextStride should not require users to provide perfectly structured information before it can help them. Users may be uncertain, overwhelmed, approximate, or unaware of the exact time and effort involved. The system must extract what is known, distinguish inference from fact, identify meaningful unknowns, use real-time temporal information to calculate the situation, and ask only the questions necessary to improve the decision.**

> **NextStride must be domain-neutral. Its reasoning should prioritize the user's actual responsibilities, constraints, deadlines, consequences and circumstances, not the type of work involved. Academic work, family responsibilities, fellowship activities, church/community commitments, employment, business, personal tasks, creative work and software engineering are all simply possible responsibilities within the user's life.**

