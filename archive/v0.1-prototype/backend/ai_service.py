import copy
import re
import uuid

# ---------------------------------------------------------------------------
# NextStride AI Service (initial working version)
#
# PRD source of truth: Section 18-20 (AI Requirements, Priority Reasoning
# Framework, Safety and Decision Rules).
#
# This is a rule-based starter implementation. It does NOT call an external
# LLM. It extracts structure from natural language, detects conflicts, and
# reasons using the PRD's 10 factors. The function signatures are kept
# LLM-compatible so a real model can replace them later without changing
# the backend orchestration.
# ---------------------------------------------------------------------------

CATEGORY_KEYWORDS = {
    "academic": ["lecture", "class", "assignment", "exam", "study", "tutorial", "lab", "school", "homework", "test", "course"],
    "fellowship": ["fellowship", "church", "program", "service", "choir", "volunteer", "community"],
    "business": ["customer", "delivery", "business", "order", "client", "shop", "sale", "product"],
    "work": ["work", "job", "shift", "boss", "office", "employer"],
    "personal": ["family", "health", "doctor", "rest", "sleep", "friend", "personal"],
}

DELEGATION_HINTS = ["assistant", "colleague", "teammate", "partner", "cover", "delegate", "someone", "staff", "friend", "coordinator"]

TIME_PATTERN = re.compile(
    r"(\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*(?:-|–|to)\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?"
    r"|\d{1,2}(?::\d{2})?\s*(?:am|pm)"
    r"|tonight|tomorrow\s*morning|tomorrow|morning|afternoon|evening|today)",
    re.IGNORECASE,
)

SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+|\n+|,\s*(?=[A-Z0-9])")


def _detect_category(sentence):
    lowered = sentence.lower()
    for category, keywords in CATEGORY_KEYWORDS.items():
        if any(k in lowered for k in keywords):
            return category
    return "other"


def _extract_time_ref(sentence):
    match = TIME_PATTERN.search(sentence)
    return match.group(0).strip() if match else ""


def _is_fixed_time(sentence):
    lowered = sentence.lower()
    fixed_hints = ["lecture", "class", "starts at", "from", "shift", "service", "program", "meeting", "exam"]
    return bool(TIME_PATTERN.search(sentence)) and any(h in lowered for h in fixed_hints)


def _is_delegatable(sentence):
    lowered = sentence.lower()
    return any(h in lowered for h in DELEGATION_HINTS) or "coordinat" in lowered or "lead" in lowered


def understand_situation(text):
    """Natural language -> structured context (PRD 18: Understanding)."""
    text = (text or "").strip()
    if not text:
        return {
            "responsibilities": [],
            "conflicts": [],
            "uncertainties": ["No situation text was provided."],
        }

    # Split into candidate responsibility chunks.
    raw_parts = [p.strip(" .") for p in re.split(r"\band\b|\n+|(?<=[.!?])\s+", text) if p.strip()]
    if not raw_parts:
        raw_parts = [text]

    responsibilities = []
    for part in raw_parts[:8]:  # MVP cap: keep it reviewable
        if len(part) < 4:
            continue
        responsibilities.append({
            "id": uuid.uuid4().hex[:8],
            "title": part[:120],
            "category": _detect_category(part),
            "time_ref": _extract_time_ref(part),
            "fixed_time": _is_fixed_time(part),
            "flexible": not _is_fixed_time(part),
            "delegatable": _is_delegatable(part),
            "detail": part,
        })

    conflicts = analyze_conflicts(responsibilities)

    uncertainties = []
    if len(responsibilities) <= 1:
        uncertainties.append("Only one responsibility was clearly detected. Add more detail if something else is competing for your attention.")
    if not any(r["time_ref"] for r in responsibilities):
        uncertainties.append("No clear times or deadlines were detected. Adding times (e.g. '2-5:30pm', 'tonight', 'tomorrow morning') improves the recommendation.")
    if not any(r["delegatable"] for r in responsibilities):
        uncertainties.append("No delegation option was mentioned. If anyone could cover part of this, mention them for a better plan.")

    return {
        "responsibilities": responsibilities,
        "conflicts": conflicts,
        "uncertainties": uncertainties,
    }


def analyze_conflicts(responsibilities):
    """Identify meaningful competition between responsibilities (PRD 18)."""
    conflicts = []
    timed = [r for r in responsibilities if r.get("time_ref")]
    # Heuristic v1: if 2+ timed items exist, flag a time overlap for user review.
    # A future version (calendar integration) can do exact overlap math.
    if len(timed) >= 2:
        conflicts.append({
            "id": uuid.uuid4().hex[:8],
            "description": f"Possible time overlap between '{timed[0]['title'][:60]}' and '{timed[1]['title'][:60]}'.",
            "involves": [timed[0]["id"], timed[1]["id"]],
        })
    # Fixed-time vs everything else is the classic NextStride conflict.
    fixed = [r for r in responsibilities if r.get("fixed_time")]
    if fixed and len(responsibilities) > 1:
        others = [r["title"][:60] for r in responsibilities if r["id"] != fixed[0]["id"]][:3]
        if others and not any(c["involves"] == [fixed[0]["id"]] for c in conflicts):
            conflicts.append({
                "id": uuid.uuid4().hex[:8],
                "description": f"'{fixed[0]['title'][:60]}' has a fixed time and competes with: {', '.join(others)}.",
                "involves": [fixed[0]["id"]] + [r["id"] for r in responsibilities if r["id"] != fixed[0]["id"]][:2],
            })
    return conflicts


def _score(responsibility):
    """Score using PRD Section 19 factors (simplified, transparent)."""
    score = 0
    reasons = []
    detail = responsibility.get("detail", "").lower()
    if responsibility.get("fixed_time"):
        score += 3
        reasons.append("fixed time — cannot easily move")
    if any(w in detail for w in ["exam", "due tomorrow", "due", "deadline", "tonight", "exam", "consequence", "fail", "grade"]):
        score += 2
        reasons.append("deadline proximity / consequence of delay")
    if any(w in detail for w in ["coordinat", "lead", "customer waiting", "exam", "lecture"]):
        score += 1
        reasons.append("role responsibility / dependency")
    if responsibility.get("delegatable"):
        score -= 1  # delegatable items can be covered another way
        reasons.append("delegation possible — lowers need to do it personally now")
    if responsibility.get("flexible"):
        score -= 0.5
    return score, reasons


def generate_recommendation(situation_text, context, previous=None, new_info=""):
    """Prioritize -> Recommend -> Explain (PRD 18-20). Advisory only."""
    responsibilities = copy.deepcopy(context.get("responsibilities", []))
    if not responsibilities:
        return {
            "version": (previous["version"] + 1) if previous else 1,
            "recommended_priority": "Clarify your situation first",
            "why": "No responsibilities could be extracted, so no tradeoff can be evaluated yet.",
            "next_action": "Rewrite your situation with each competing responsibility and its time (e.g. lecture 2-5:30pm, fellowship 4:30pm, delivery tonight).",
            "others": [],
            "reassess_if": ["You add times, deadlines, or who could help."],
            "uncertainty_notes": "Unknown information remains unknown — no facts were invented.",
        }

    scored = []
    for r in responsibilities:
        s, reasons = _score(r)
        # Reassessment adjustment: if delegation explicitly failed, it is no longer delegatable.
        if new_info and any(w in new_info.lower() for w in ["can't cover", "cannot cover", "no cover", "assistant can't", "nobody", "no one"]):
            if r.get("delegatable"):
                r["delegatable"] = False
                s += 2
                reasons.append("new information: coverage fell through — must handle personally or renegotiate")
        scored.append((s, r, reasons))

    scored.sort(key=lambda x: x[0], reverse=True)
    top_score, top, top_reasons = scored[0]

    others = []
    for s, r, _ in scored[1:]:
        if r.get("delegatable"):
            action = f"Delegate or arrange coverage for '{r['title'][:80]}' ({r['time_ref'] or 'no time given'})."
        elif r.get("flexible"):
            action = f"Postpone / reschedule '{r['title'][:80]}' until after the top priority ({r['time_ref'] or 'no deadline given'})."
        else:
            action = f"Communicate early about '{r['title'][:80]}' — explain the conflict and agree a new expectation."
        others.append({"responsibility_id": r["id"], "title": r["title"][:100], "suggested_handling": action})

    delegatable = [r for _, r, _ in scored[1:] if r.get("delegatable")]
    if delegatable:
        next_action = f"Contact cover for '{delegatable[0]['title'][:80]}' now, then focus on '{top['title'][:80]}'."
    else:
        next_action = f"Focus on '{top['title'][:80]}' now ({top['time_ref'] or 'no time given'}), then handle the next item in order."

    return {
        "version": (previous["version"] + 1) if previous else 1,
        "recommended_priority": top["title"][:140],
        "why": "Prioritized by fixed time, deadline proximity, consequences, and delegation options. " + "; ".join(top_reasons) + ".",
        "next_action": next_action,
        "others": others,
        "reassess_if": [
            "Coverage / delegation falls through.",
            "A lecture, shift, or program time changes.",
            "A deadline moves closer or a new consequence appears.",
        ],
        "uncertainty_notes": "Based only on what you provided. If times or consequences change, reassess rather than treating this as final.",
    }


def reassess_situation(situation_text, context, previous_recommendation, new_info):
    """Re-evaluate when circumstances change. Returns a new versioned recommendation."""
    updated_context = copy.deepcopy(context)
    # Append any newly mentioned responsibilities without dropping history.
    extra = understand_situation(new_info or "")
    existing_titles = {r["title"] for r in updated_context.get("responsibilities", [])}
    for r in extra.get("responsibilities", []):
        if r["title"] not in existing_titles:
            updated_context.setdefault("responsibilities", []).append(r)
    updated_context["conflicts"] = analyze_conflicts(updated_context.get("responsibilities", []))
    recommendation = generate_recommendation(
        situation_text, updated_context, previous=previous_recommendation, new_info=new_info or ""
    )
    return updated_context, recommendation
