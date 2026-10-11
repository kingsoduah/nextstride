# **NextStride V2 Benchmark Suite v1.0**

The purpose of this benchmark is not to test whether NextStride can simply say **"do Task A first."**

It tests whether NextStride can:

> **Understand the user's real situation at a specific point in time, account for deadlines, available time, fixed commitments, sleep, effort, consequences and uncertainty, determine what is realistically possible, and recommend the best next move without violating the user's constraints.**

The benchmark is deliberately **student-first and domain-neutral**.

---

## **Global rules for every benchmark**

These are principles that every V2 scenario should test against.

### **Time**

NextStride must understand:

* Current date  
* Current clock time  
* User timezone  
* Relative dates such as "tomorrow", "Friday", "in two days"  
* Fixed time commitments  
* Available work windows  
* Sleep/rest windows  
* Time remaining before deadlines  
* Time that passes between an initial recommendation and reassessment

**Important:** The system should derive available time from actual clock windows where possible, rather than trusting a user's vague statement such as "I have about 5 hours."

### **Constraints**

NextStride must distinguish between:

**Hard constraints**

> "I must attend this."

**Soft constraints**

> "I'd prefer not to do this."

**User preferences**

> "I don't want to work after midnight."

It must not silently turn a preference into a hard constraint, nor treat a hard constraint as negotiable.

### **Effort**

It should distinguish:

* Estimated total effort  
* Remaining effort  
* Time available  
* Buffer

### **Feasibility**

Every major plan should effectively fall into:

* **Feasible**  
* **Tight**  
* **At risk**  
* **Infeasible**

### **Uncertainty**

NextStride should not invent missing information.

If an unknown materially changes the decision, it should ask.

If it doesn't materially change the decision, it can proceed with a clearly stated assumption.

### **User control**

NextStride recommends.

It does not command.

It should not casually tell users to:

* cancel commitments  
* skip sleep  
* break promises  
* sacrifice important responsibilities  
* delegate something without evidence that delegation is possible

---

# **Scenario 1 — Enough Time, But Almost No Buffer**

### **User situation**

**Current time:** Tuesday, 6:00 PM  
 **Timezone:** Africa/Lagos

> I have an academic assignment due tomorrow at 7 AM. I still need about 6 hours to finish it. I can work from now until midnight, then I need to sleep for 6 hours. I'll be awake at 6 AM and can work until 7 AM. I also have another assignment due in three days. What should I focus on?

### **Known facts**

* Current time: 6 PM  
* Deadline: Wednesday, 7 AM  
* Work required: 6 hours  
* Work windows: 6 PM–12 AM \+ 6 AM–7 AM  
* Total available work time: 7 hours  
* Sleep: 12 AM–6 AM  
* Buffer: 1 hour  
* Second assignment: later deadline

### **Expected feasibility**

**Feasible, but tight.**

### **Expected direction**

Prioritize the first assignment.

But NextStride should recognize that **the plan has only one hour of buffer**.

### **Must not do**

Say:

> "You have plenty of time."

---

# **Scenario 2 — The Deadline Is Actually Impossible**

### **User situation**

**Current time:** Wednesday, 8:00 PM

> I have an assignment due tomorrow at 7 AM. I estimate I need 8 hours to finish it. I need at least 6 hours of sleep because I have an exam tomorrow afternoon. I can work until midnight tonight and from 6 AM to 7 AM tomorrow. I can't reduce my sleep. What should I do?

### **Time calculation**

8 PM–12 AM \= 4 hours

6 AM–7 AM \= 1 hour

Total available \= **5 hours**

Required \= **8 hours**

Gap \= **3 hours**

### **Expected feasibility**

**Infeasible.**

### **Expected direction**

NextStride should not pretend the assignment can simply be completed.

It should surface options such as:

* reduce scope if possible  
* submit partial work if appropriate  
* communicate with lecturer  
* seek legitimate assistance where appropriate  
* determine what minimum viable submission is possible

### **Must not do**

Tell the user:

> "Just wake up earlier."

That violates the stated sleep constraint.

---

# **Scenario 3 — Two Deadlines, Different Urgency**

### **User situation**

**Current time:** Thursday, 5:00 PM

> I have an academic assignment due tomorrow at 10 AM that needs 3 hours. I also have a fellowship application due tomorrow at 11:59 PM that needs about 5 hours. I have 3 hours tonight, 6 hours tomorrow afternoon, and 2 hours tomorrow evening. I need to sleep normally tonight. Both are important.

### **Expected reasoning**

The system should recognize:

* Assignment has earlier deadline.  
* Fellowship has later deadline.  
* Both are feasible.  
* There is no reason to treat them as equally urgent simply because both are important.

### **Expected direction**

Complete the assignment first, then use the later available windows for the fellowship application.

### **Must not do**

Simply say:

> "Both are equally important, so work on whichever you prefer."

---

# **Scenario 4 — Fixed Community Commitment**

### **User situation**

**Current time:** Friday, 4:00 PM

> I have a school project due Saturday at 10 AM. I need about 5 hours to finish it. I have 3 hours tonight and 2 hours tomorrow morning. I also have a community meeting tomorrow from 5 PM to 7 PM, but that doesn't conflict with the project deadline. I have another personal task due Sunday.

### **Purpose**

This tests whether the system can recognize that the community meeting is **not actually a conflict**.

### **Expected direction**

Focus on the project because of its earlier deadline.

The Saturday evening commitment is irrelevant to the immediate deadline.

### **Must not do**

Invent a conflict merely because there is a commitment tomorrow.

---

# **Scenario 5 — Delegation Is Actually Available**

### **User situation**

**Current time:** Monday, 6:00 PM

> I have a group presentation tomorrow at 2 PM. My part needs about 4 hours. One of my teammates has already agreed to handle the research section, which would save me about 1.5 hours. I also have an assignment due Friday that needs about 4 hours. What should I do tonight?

### **Expected reasoning**

The system should recognize:

* Genuine delegation exists.  
* Delegation has already been agreed upon.  
* Remaining effort becomes approximately 2.5 hours.  
* Tomorrow's deadline is more immediate.

### **Expected direction**

Use the delegation and complete the remaining presentation work.

### **Must not do**

Ignore the delegation opportunity.

---

# **Scenario 6 — Delegation Is Not Available**

### **User situation**

**Current time:** Monday, 6:00 PM

> I have a group presentation tomorrow at 2 PM. My part needs about 4 hours. I asked my teammate to help with some of it, but they said they can't. I also have an assignment due Friday. What should I do tonight?

### **Expected direction**

NextStride should understand that delegation is **not available**.

### **Must not do**

Say:

> "Ask your teammate to handle part of it."

The user already established that this isn't possible.

---

# **Scenario 7 — The Missing Deadline Matters**

### **User situation**

**Current time:** Tuesday, 7:00 PM

> I have three things to work on tonight: an assignment, a fellowship task and some preparation for a student association activity. The assignment is due tomorrow morning. I know the fellowship task is important, but I can't remember exactly when it's due. The student association activity is tomorrow evening. I have about four hours tonight.

### **Expected behavior**

Prioritize the assignment because its deadline is known and imminent.

But NextStride should recognize that the unknown fellowship deadline **could materially affect the longer-term plan**.

It can either ask:

> "When is the fellowship task due?"

or proceed with the immediate assignment while flagging the unknown.

### **Must not do**

Invent a fellowship deadline.

---

# **Scenario 8 — The Estimate Changes**

### **Initial situation**

**Current time:** Wednesday, 6:00 PM

> I have an academic project due tomorrow at 10 AM. I originally thought it would take 4 hours, but I've now realized it will probably take 7 hours. I have 3 hours tonight and 2 hours tomorrow morning. I also have a fellowship task due Saturday.

### **Calculation**

Required: 7 hours

Available: 5 hours

Shortfall: **2 hours**

### **Expected feasibility**

**At risk / infeasible under current constraints.**

### **Expected direction**

NextStride should reassess the situation.

Possible options:

* reduce project scope  
* seek legitimate assistance  
* communicate about the deadline if appropriate  
* determine what can realistically be completed  
* reconsider flexible responsibilities

### **Must not do**

Continue using the old 4-hour estimate.

---

# **Scenario 9 — Sleep Is Explicitly Protected**

### **User situation**

**Current time:** Tuesday, 9:00 PM

> I have an assignment due tomorrow at 10 AM. I need about 6 hours to finish it. I can work until midnight and from 6 AM to 10 AM tomorrow. I need to sleep from midnight to 6 AM because I have an exam tomorrow afternoon. I don't want to reduce my sleep. I also have another assignment due next week.

### **Calculation**

9 PM–12 AM \= 3 hours

6 AM–10 AM \= 4 hours

Total \= **7 hours**

Required \= 6 hours

Buffer \= **1 hour**

### **Expected feasibility**

Feasible with a one-hour buffer.

### **Expected direction**

Work on the assignment while protecting the stated sleep window.

### **Must not do**

Suggest working through the night.

---

# **Scenario 10 — Nothing Is Immediately Due**

### **User situation**

**Current time:** Saturday, 2:00 PM

> I have an assignment due Tuesday, a fellowship task due Thursday, some personal errands, and preparation for a student association event next weekend. None of them is urgent today. I have three hours free this afternoon. What should I work on?

### **Purpose**

This tests whether NextStride can prioritize without an emergency.

### **Expected reasoning**

The system should consider:

* deadlines  
* effort  
* consequences  
* dependencies  
* future workload  
* whether doing something now reduces future pressure

It shouldn't automatically say:

> "Do the assignment because it has the earliest deadline."

It should consider whether beginning a high-effort assignment now meaningfully reduces future pressure.

---

# **Scenario 11 — Consequence Matters**

### **User situation**

**Current time:** Monday, 7:00 PM

> I have a small personal task that will take one hour and a client project that will take four hours. The personal task is due tomorrow afternoon, while the client project is due Wednesday morning. If I miss the client project deadline, I could damage the client's trust and potentially lose future work. I have four hours tonight and two hours tomorrow evening.

### **Expected reasoning**

The client project may deserve priority despite its later deadline because of its **higher consequence and limited future work window**.

### **Expected direction**

Start the client project, while considering the personal task's deadline in the overall plan.

### **Must not do**

Use deadline alone as the ranking mechanism.

---

# **Scenario 12 — Dependencies**

### **User situation**

**Current time:** Tuesday, 6:00 PM

> I have a report due Thursday at 10 AM. I need to collect and clean the data first, which will take about 3 hours. After that, writing the report will take another 3 hours. I also have a fellowship presentation tomorrow at 9 AM that needs 2 hours of preparation. I have four hours tonight and two hours tomorrow afternoon.

### **Expected reasoning**

NextStride should recognize:

**Data → Report**

The report cannot be completed until the data preparation happens.

And the presentation has an earlier deadline.

### **Expected direction**

Prepare for the presentation while ensuring the data work begins early enough to leave sufficient time for the report.

### **Must not do**

Treat the report as one undifferentiated six-hour task.

---

# **Scenario 13 — A Personal Commitment With Meaning**

### **User situation**

**Current time:** Wednesday, 6:00 PM

> I have a school project due tomorrow at 10 AM and I need about 5 hours to finish it. I have four hours tonight and two hours tomorrow morning. I also promised my younger sibling that I would spend one hour with them tonight. I really value keeping that promise, but if absolutely necessary I can shorten the time. I also have another assignment due next week.

### **Expected reasoning**

This is **not automatically a hard constraint**.

The user has clearly expressed:

> "I really value it, but if absolutely necessary I can shorten it."

So NextStride should treat it as a **strong preference/value**, not an immovable commitment.

### **Expected direction**

It may recommend protecting the one-hour commitment if the schedule still allows the project to fit, or explain the trade-off if it doesn't.

---

# **Scenario 14 — The Overwhelmed Student**

### **User situation**

**Current time:** Sunday, 8:00 PM

> I feel overwhelmed. I have an assignment, an upcoming exam, a fellowship responsibility, a church responsibility, some personal errands and a small business thing I need to handle. Everything feels important and I don't know where to start. I have about five hours tonight.

### **Expected behavior**

This is deliberately underspecified.

NextStride should not hallucinate:

* deadlines  
* durations  
* consequences  
* commitments  
* importance

It should identify what it can determine and ask for the **minimum information necessary**.

For example:

> "Let's simplify this. Which of these has the earliest deadline, and which one has the biggest consequence if you don't do it?"

Or it could ask for deadlines and estimated effort.

### **Must not do**

Invent a priority ordering from nothing.

---

# **Scenario 15 — Real-Time Reassessment**

This is one of our most important tests.

### **Initial state**

**Monday, 6:00 PM**

> I have a client project due Tuesday at 7 AM. I estimate it will take 5 hours. I need 6 hours of sleep, from midnight to 6 AM. I also have an academic assignment due Wednesday.

NextStride recommends a plan.

---

### **Changed state**

The user returns at **9:30 PM**.

> I have only completed about one hour of the project. I now estimate I still need 5 hours of work. I still need my six hours of sleep, and the deadline is still 7 AM.

### **New calculation**

Remaining work: 5 hours

Available:

9:30 PM–12 AM \= 2.5 hours

6 AM–7 AM \= 1 hour

Total \= **3.5 hours**

Shortfall \= **1.5 hours**

### **Expected behavior**

NextStride must recognize that the original plan is no longer feasible.

It should **not simply repeat the original recommendation**.

It should say, in effect:

> The situation has changed. You now have 3.5 hours available before the deadline but about 5 hours of work remaining, leaving a 1.5-hour gap.

Then it should explore realistic options.

This is the benchmark that tests whether NextStride actually understands **state over time**.

---

# **Additional benchmark: The Clock Itself Changes the Answer**

I want to add one special test because of the point you raised.

## **Scenario 16 — Same Situation, Different Time**

Rather than treating this as another independent scenario, we should use it as a **paired test**.

### **Version A**

**Current time: 2:00 PM**

> I have an assignment due tomorrow at 8 AM. It needs about 5 hours. I need 7 hours of sleep.

### **Version B**

**Current time: 11:00 PM**

Same exact situation.

The responsibilities haven't changed.

The effort hasn't changed.

The deadline hasn't changed.

**Only the current time changed.**

And NextStride should produce materially different planning because the available work windows are now different.

This is a critical test for our temporal engine.

