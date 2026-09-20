# **NextStride — Product Requirements Document**

**Product:** NextStride  
**Version:** MVP v1.0  
**Product Type:** AI-powered priority decision assistant  
**Primary Users:** Students managing multiple significant responsibilities  
**Core Promise:** **When everything matters, know what to do next.**

---

# **1\. Product Overview**

NextStride is an AI-powered priority decision assistant designed to help students make better decisions when important responsibilities compete for limited time, attention, energy, and resources.

Rather than functioning primarily as a task manager, calendar, or generic chatbot, NextStride focuses on the decision that occurs when a user cannot adequately handle everything at once:

> **What should I focus on now, what can wait, what should I delegate or communicate, and what should I do next?**

Users describe their situation naturally. NextStride understands the context, identifies competing responsibilities and conflicts, evaluates the available options, recommends what deserves attention next, explains why, and provides a concrete next action.

When circumstances change, the user can update the situation and NextStride reassesses the recommendation.

---

# **2\. Problem Statement**

Students increasingly manage responsibilities beyond academics, including:

* leadership  
* fellowships and community activities  
* businesses  
* employment  
* online courses  
* personal commitments  
* family responsibilities  
* projects  
* social obligations

These responsibilities frequently compete for the same limited time and attention.

A student may have a lecture while coordinating a fellowship program, a customer waiting for a delivery, and an assignment due the next morning.

The challenge is not simply knowing that these tasks exist.

The challenge is determining:

* What should happen first?  
* What can wait?  
* What can be delegated?  
* What should be communicated?  
* What consequence should be accepted?  
* What should I actually do right now?

Existing approaches often require users to manually reason through these situations using personal judgment, advice from other people, calendars, task managers, notes, or general-purpose AI.

NextStride aims to make this decision process more structured and actionable.

---

# **3\. Product Vision**

NextStride aims to become a trusted decision-support layer for people whose responsibilities frequently compete for limited time and attention.

The long-term vision is not to help users **do everything**.

It is to help them consistently make **better decisions about what deserves attention next**.

---

# **4\. Target User**

## **Primary User**

Students who carry multiple significant responsibilities alongside their academic work and regularly have to make tradeoffs about where to invest their limited time, attention, and energy.

### **Examples**

* Student leaders  
* Fellowship/church workers  
* Student entrepreneurs  
* Working students  
* Students taking professional courses  
* Students involved in community organizations  
* Students managing multiple projects  
* Highly involved university students

### **Preliminary Persona**

**The Multi-Role Student**

A student who has two or more meaningful responsibility areas and frequently encounters situations where they cannot adequately handle everything at once.

Their desired feeling is:

> **“I know what I should focus on right now.”**

---

# **5\. Product Goals**

## **Primary Goal**

Help users reach greater clarity and confidence about what to do next when important responsibilities compete.

## **Supporting Goals**

NextStride should help users:

1. Understand their current situation.  
2. Identify competing responsibilities.  
3. Detect meaningful conflicts.  
4. Understand the consequences and constraints surrounding those responsibilities.  
5. Determine what deserves attention now.  
6. Understand why that recommendation was made.  
7. Identify a concrete next action.  
8. Determine what should happen to competing responsibilities.  
9. Reassess when circumstances change.  
10. Provide feedback about whether the recommendation was useful.

---

# **6\. Non-Goals**

The MVP will **not** attempt to become:

* A full task-management platform  
* A calendar replacement  
* A habit tracker  
* A project-management platform  
* A social network  
* A team collaboration platform  
* A comprehensive student management system  
* A generic AI chatbot  
* A personal finance manager  
* A fully autonomous AI agent  
* A notification-heavy productivity ecosystem

These may be considered later if validated by users.

---

# **7\. Core Product Principle**

The central product principle is:

> **NextStride does not determine what is objectively most important in a user's life. It helps the user reason through competing responsibilities using the context, constraints, consequences, and options available at that moment.**

Therefore:

**AI recommends.**  
**User decides.**  
**Backend records.**  
**New information triggers reassessment.**

---

# **8\. Core Product Loop**

The fundamental NextStride loop is:

> **Capture → Understand → Identify Conflicts → Prioritize → Explain → Recommend → Act → Update → Reassess → Act → Feedback**

This loop represents the primary product experience.

---

# **9\. User Journey**

## **9.1 Discover**

The user encounters NextStride and understands its purpose.

Core message:

> **When everything matters, know what to do next.**

---

## **9.2 Sign Up / Log In**

The user creates an account or logs into an existing account.

---

## **9.3 Onboarding**

NextStride briefly explains:

1. You don't need to handle everything at once.  
2. Tell NextStride what is competing for your attention.  
3. NextStride will help you understand what deserves attention first and why.  
4. When circumstances change, update the situation and reassess.

---

## **9.4 Enter Situation**

The user enters the Priority Hub.

The primary prompt is:

> **What's competing for your attention?**

The user describes their situation naturally.

Example:

> “I have a lecture from 2–5:30, fellowship starts at 4:30 and I'm coordinating it. A customer is also waiting for a delivery tonight, and I have an assignment due tomorrow morning.”

---

## **9.5 AI Understands**

NextStride extracts:

* responsibilities  
* deadlines  
* time constraints  
* conflicts  
* consequences  
* dependencies  
* flexibility  
* delegation opportunities  
* uncertainties

---

## **9.6 Confirm Understanding**

NextStride shows:

> **Here's what I understand.**

The user can:

* Confirm  
* Edit

The AI should not make a recommendation based on a potentially incorrect understanding without giving the user an opportunity to correct important information.

---

## **9.7 Recommendation**

NextStride evaluates the situation and presents:

### **Recommended priority**

What deserves attention now.

### **Why**

The reasoning behind the recommendation.

### **Next action**

The concrete action the user should take.

### **What happens to the others**

Which responsibilities should be:

* postponed  
* delegated  
* communicated  
* rescheduled  
* handled afterward

---

## **9.8 User Acts**

The user takes the recommended action.

NextStride does not autonomously execute consequential actions in the MVP.

---

## **9.9 Situation Changes**

If something changes, the user updates NextStride.

Example:

> “My assistant just said they can't cover the fellowship.”

---

## **9.10 Reassessment**

NextStride considers:

* original context  
* previous recommendation  
* new information

and determines whether the recommendation should change.

---

## **9.11 Feedback**

After the situation is resolved, the user can indicate whether NextStride helped and optionally describe the outcome.

---

# **10\. MVP Screens**

The MVP consists of eight primary screens/states.

## **10.1 Landing / Welcome**

### **Purpose**

Explain NextStride and provide entry into the product.

### **Core content**

**NextStride**

> When everything matters, know what to do next.

Supporting explanation:

> Bring your competing responsibilities. NextStride helps you understand what deserves attention now, why, and what to do next.

Actions:

* Get Started  
* Log In

---

# **11\. Authentication**

## **11.1 Sign Up**

Fields:

* Name  
* Email  
* Password

Backend responsibilities:

* Validate input  
* Check email uniqueness  
* Hash password  
* Create user  
* Establish authentication session/token

---

## **11.2 Login**

Fields:

* Email  
* Password

Backend:

* Authenticate credentials  
* Establish session/token  
* Return authenticated user state

---

# **12\. Onboarding**

### **Purpose**

Introduce the product's mental model.

The onboarding should be short and focused.

Potential steps:

**Step 1**

> You don't need to do everything at once.

**Step 2**

> Tell NextStride what's competing for your attention.

**Step 3**

> We'll help you understand what deserves attention first and why.

**Step 4**

> When things change, update us and we'll reassess.

No AI is required for onboarding.

---

# **13\. Priority Hub**

This is the **primary product screen**.

### **Purpose**

Allow the user to bring a real priority conflict into NextStride.

### **Primary UI**

> **What's competing for your attention?**

Large natural-language input.

Example placeholder:

> “I have a lecture at 2 PM, fellowship starts at 4:30 PM, a customer is waiting for a delivery, and an assignment is due tomorrow…”

Action:

> **Analyze My Situation**

### **Backend**

`POST /api/situations`

The backend:

1. Authenticates the user.  
2. Creates the situation.  
3. Sends the relevant information to the AI.  
4. Receives structured context.  
5. Validates the response.  
6. Stores the context.  
7. Returns it to the frontend.

---

# **14\. Situation Understanding**

### **Purpose**

Show the user how NextStride interpreted the situation.

Example:

**Here's what I understand**

**Academic**

* Lecture: 2:00–5:30 PM

**Fellowship**

* Program: 4:30 PM  
* You are coordinating it

**Business**

* Customer delivery: Tonight

**Academic**

* Assignment: Tomorrow morning

**Conflict detected**

Lecture overlaps with fellowship.

The user can:

> Confirm

or

> Edit

---

# **15\. Recommendation / NextStride**

This is the core product experience.

### **Required information**

**Recommended priority**

What should receive attention now.

**Why**

Reasoned explanation.

**Next action**

Concrete action.

**Other responsibilities**

What should happen to them.

**Reassessment triggers**

Circumstances that could change the recommendation.

Example:

> **Recommended next step:** Remain in class until released.

> **Why:** The lecture has a fixed time and leaving creates an academic consequence, while fellowship coverage may be possible.

> **Do this now:** Contact your fellowship assistant and arrange coverage.

> **Then:** Attend the lecture, handle the customer delivery, and complete the assignment according to their remaining deadlines.

> **Reassess if:** Your assistant cannot cover the fellowship or the lecture schedule changes.

---

# **16\. Reassessment**

### **Purpose**

Allow NextStride to respond to changing circumstances.

Input:

> “My assistant can't cover the fellowship.”

Backend:

`POST /api/situations/:id/reassess`

The backend retrieves:

* original situation  
* structured context  
* previous recommendation  
* new information

The AI evaluates the change.

The result becomes a new recommendation version.

Previous recommendations remain preserved.

---

# **17\. Feedback / Outcome**

### **Purpose**

Determine whether the product actually helped.

User options:

> 👍 Helpful

> 👎 Not helpful

Optional:

> “Tell us what happened.”

The feedback is stored for future product improvement.

---

# **18\. AI Requirements**

AI is the reasoning backbone of NextStride.

The AI must perform:

### **Understanding**

Natural language → structured context.

### **Conflict Detection**

Identify meaningful competition between responsibilities.

### **Priority Reasoning**

Evaluate competing responsibilities using defined factors.

### **Recommendation**

Generate a recommended priority and next action.

### **Explanation**

Explain why the recommendation was made.

### **Reassessment**

Re-evaluate recommendations when circumstances change.

---

# **19\. Priority Reasoning Framework**

The AI should consider:

1. Fixed time constraints  
2. Deadline proximity  
3. Consequences of delay  
4. Irreversibility  
5. Dependencies  
6. Delegation possibilities  
7. Flexibility  
8. User-specific role/context  
9. Available time and resources  
10. New information

The AI must not assume that:

> Academics always outrank business.

or:

> Work always outranks fellowship.

The recommendation must be based on the actual context.

---

# **20\. AI Safety and Decision Rules**

The AI must:

### **Not invent facts**

Unknown information must remain unknown.

### **Not assume importance**

The AI should not impose a universal hierarchy on the user's responsibilities.

### **Not rely solely on urgency**

Urgency is one factor among several.

### **Consider alternatives**

Before recommending that one responsibility be sacrificed, consider:

* delegation  
* communication  
* postponement  
* rescheduling  
* partial completion  
* scope reduction

### **Explain tradeoffs**

The user should understand what happens to the responsibilities that are not prioritized.

### **Surface uncertainty**

If the AI lacks critical information, it should either:

* ask a clarification question, or  
* explicitly state the uncertainty.

### **Remain advisory**

The AI recommends.

The user decides.

---

# **21\. High-Stakes Boundary**

NextStride is a productivity decision-support system.

It should not present itself as an authority for:

* medical emergencies  
* legal decisions  
* professional financial advice  
* crisis intervention  
* other high-stakes professional matters

The system should appropriately encourage qualified human/professional assistance where necessary.

---

# **22\. AI Input Contract**

For a new situation, the AI receives:

System instructions

\+

User's natural-language situation

\+

Relevant structured context

For reassessment:

System instructions

\+

Original situation

\+

Current structured context

\+

Previous recommendation

\+

New information

The backend controls what information is provided.

---

# **23\. AI Output Contract**

The AI should return structured JSON rather than arbitrary prose.

The major output structures are:

SituationContext

Responsibility\[\]

Conflict\[\]

Recommendation

Reassessment

The backend validates the output before persistence.

---

# **24\. Core Data Model**

The conceptual database model is:

User

&nbsp;│

&nbsp;└── Situation

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;│

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;├── SituationContext

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;│

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;├── Responsibilities

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;│

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;├── Conflicts

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;│

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;├── Recommendations

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;│

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;├── Reassessments

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;│

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;└── Feedback

Initial database entities:

users

situations

situation\_contexts

responsibilities

conflicts

recommendations

reassessments

feedback

The exact PostgreSQL/Prisma implementation will be finalized during technical design.

---

# **25\. Recommendation Versioning**

Recommendations are immutable.

If circumstances change:

Recommendation v1

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;↓

New information

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;↓

Reassessment

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;↓

Recommendation v2

The system should never simply overwrite the previous recommendation.

This allows NextStride to preserve the decision history.

---

# **26\. API Requirements**

Initial conceptual API surface:

### **Authentication**

POST /api/auth/register

POST /api/auth/login

POST /api/auth/logout

GET  /api/auth/me

### **Situations**

POST /api/situations

GET  /api/situations/:id

PATCH /api/situations/:id

### **Recommendations**

POST /api/situations/:id/prioritize

GET  /api/situations/:id/recommendations

### **Reassessment**

POST /api/situations/:id/reassess

### **Feedback**

POST /api/situations/:id/feedback

These are conceptual at the PRD stage. Exact REST conventions and request/response schemas will be defined during technical design.

---

# **27\. Backend Responsibilities**

The backend is the orchestration layer.

It owns:

* authentication  
* authorization  
* situation lifecycle  
* AI orchestration  
* AI input construction  
* AI output validation  
* business rules  
* database persistence  
* recommendation versioning  
* reassessment lifecycle  
* feedback storage  
* error handling

The backend should **not** rely on the frontend for core decision logic.

---

# **28\. Frontend Responsibilities**

The frontend owns:

* rendering  
* navigation  
* form interaction  
* loading states  
* error states  
* displaying AI understanding  
* allowing corrections  
* displaying recommendations  
* collecting user updates  
* collecting feedback

The frontend should not contain the core prioritization algorithm.

---

# **29\. AI Service Responsibilities**

The AI service owns:

understandSituation()

analyzeConflicts()

generateRecommendation()

reassessSituation()

These can initially use the same underlying LLM.

We do **not** need multiple AI agents for the MVP.

---

# **30\. Success Criteria**

The MVP succeeds if users experiencing genuine priority conflicts can use NextStride to:

1. Explain their situation naturally.  
2. See an accurate representation of their situation.  
3. Understand the identified conflict.  
4. Receive a recommendation they understand.  
5. Identify a concrete next action.  
6. Act on that recommendation.  
7. Reassess when circumstances change.  
8. Find the system useful enough to return with another genuine situation.

The primary product question is:

> **Did NextStride help the user make a clearer and more confident decision about what to do next?**

---

# **31\. MVP Validation**

The MVP should test the following hypothesis:

> **If students provide NextStride with their competing responsibilities and relevant context, an AI-powered prioritization system can help them determine what deserves attention next, understand why, and take a concrete action that they find useful enough to return to when another conflict arises.**

We should not assume this hypothesis is true merely because the product concept makes sense.

Real users must validate it.

---

# **32\. MVP Out of Scope**

The first version will intentionally exclude:

* Google Calendar integration  
* Outlook integration  
* WhatsApp integration  
* automated messaging  
* automatic calendar changes  
* voice interaction  
* advanced notifications  
* task automation  
* team collaboration  
* social features  
* gamification  
* productivity analytics  
* advanced personalization  
* multiple AI agents  
* sophisticated scheduling algorithms  
* complex dashboards  
* subscription/billing system

These can be considered after validation.

---

# **33\. Non-Functional Requirements**

## **Reliability**

The system should handle AI failures gracefully.

If the AI fails, the user should receive a useful error rather than a broken interface.

## **Security**

User situations may contain sensitive personal information.

The system must:

* authenticate requests  
* authorize access  
* prevent users from accessing other users' situations  
* securely store credentials  
* avoid exposing internal AI prompts  
* validate API input

## **Performance**

The application should provide clear loading feedback while AI processing occurs.

AI latency should not make the interface appear broken.

## **Observability**

The backend should eventually log:

* AI requests  
* AI response status  
* validation failures  
* latency  
* errors  
* recommendation version  
* reassessment events

Sensitive user content should be handled carefully in logs.

---

# **34\. Product Success Metrics**

For the initial validation phase, focus on behavioral evidence rather than arbitrary numerical targets.

Observe whether users:

* understand the recommendation  
* identify the next action  
* actually act  
* return with another situation  
* use reassessment  
* report the recommendation as useful  
* prefer the workflow over their current method

Potential future quantitative metrics include:

* recommendation usefulness  
* decision confidence  
* action completion  
* repeat usage  
* reassessment frequency  
* retention  
* feedback rate

---

# **35\. Future Evolution**

If MVP validation supports the core hypothesis, NextStride could evolve toward:

### **Personal Context**

Remember recurring responsibilities and preferences.

### **Calendar Integration**

Use actual schedules as context.

### **Automated Actions**

With explicit user permission, help communicate, reschedule, or update commitments.

### **Intelligent Planning**

Move from resolving one conflict to helping users anticipate conflicts.

### **Personal Decision History**

Learn how the user typically handles different types of tradeoffs.

### **Multi-Role Context**

Understand academic, professional, business, leadership, and personal contexts.

### **Proactive Conflict Detection**

Identify upcoming conflicts before they become emergencies.

But these are **future possibilities**, not MVP requirements.

---

# **36\. Final MVP Architecture**

The complete conceptual architecture is:

&nbsp;

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;NEXTSTRIDE

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;│

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;▼

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;FRONTEND

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;│

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;HTTP / API

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;│

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;▼

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;BACKEND / ORCHESTRATOR

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;│

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;┌────────────────┼────────────────┐

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;│                │                │

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;▼                ▼                ▼

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;DATABASE          AI SERVICE       BUSINESS

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;RULES

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;│                │

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;│                ▼

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;│        ┌───────────────┐

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;│        │ Understand    │

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;│        │ Conflicts     │

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;│        │ Prioritize    │

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;│        │ Recommend     │

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;│        │ Reassess      │

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;│        └───────────────┘

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;│                │

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;└────────────────┘

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;│

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;▼

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;VALIDATED RESULT

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;│

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;▼

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;FRONTEND

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;│

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;▼

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;USER

And the actual product loop remains:

> **Capture → Understand → Confirm → Prioritize → Explain → Recommend → Act → Update → Reassess → Act → Feedback**

---

# **37\. MVP Definition in One Sentence**

If we need to describe the entire MVP in one sentence:

> **NextStride allows students to describe a real situation where important responsibilities compete, uses AI to understand and reason through the conflict, recommends what deserves attention next and why, provides a concrete next action, and reassesses that recommendation when circumstances change.**

That is the **MVP**.

Everything else should be judged against whether it strengthens that core loop.

---

