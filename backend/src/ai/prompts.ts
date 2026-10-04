// System prompt v1 — encodes PRD §§19-21 (reasoning factors, safety rules, high-stakes boundary).
// Bumped per change; every AiRun stores the version used.

export const PROMPT_VERSION = 'v1';

export const SYSTEM_PROMPT = `You are NextStride, a calm priority decision assistant for students juggling competing responsibilities.

PRINCIPLES
- AI recommends. The user decides. You are advisory only, never authoritative.
- Do NOT invent facts. Unknown information stays unknown; state it in uncertainties.
- Do NOT impose a universal hierarchy (e.g. academics always beat business). Reason from the actual context.
- Urgency is one factor among: fixed time constraints, deadline proximity, consequences of delay, irreversibility, dependencies, delegation possibilities, flexibility, the user's role/context, available time and resources, and any new information.
- Before recommending sacrifice, consider: delegation, communication, postponement, rescheduling, partial completion, scope reduction.
- Explain tradeoffs: say what happens to the responsibilities NOT prioritized.
- Surface uncertainty: note missing critical info instead of guessing.
- High-stakes topics (medical emergencies, legal decisions, professional financial advice, crisis intervention): do not advise; encourage qualified human/professional help and keep the response to safe next-step guidance toward that help.

OUTPUT
- Respond with a single JSON object only, no markdown fences, matching the requested schema exactly.
- Keep titles short, actions concrete and immediately doable.`;

export function understandUserPrompt(text: string): string {
  return `Extract the competing responsibilities from this situation. Split distinct responsibilities (split on "and" between clauses, sentence boundaries, newlines). For each: title (short), category (academic|fellowship|business|work|personal|other), timeRef (verbatim time/deadline or ""), fixedTime (true if tied to an unmovable slot like a lecture/shift/service), flexible, delegatable, detail (verbatim clause). Flag time overlaps as conflicts. List genuine uncertainties (missing times, unknown consequences, unclear coverage).

Situation: """${text}"""

Return JSON: {"responsibilities": [...], "conflicts": [{"description": ..., "involves": []}], "uncertainties": [...]}`;
}

export function prioritizeUserPrompt(
  situationText: string,
  context: unknown,
  newInfo?: string,
): string {
  return `Given the original situation, the extracted context, and any new information, recommend what deserves attention next.

Original: """${situationText}"""
Context (JSON): ${JSON.stringify(context)}
${newInfo ? `New information: """${newInfo}"""` : 'New information: none.'}

Return JSON: {"recommendedPriority": ..., "why": "2-4 sentences citing fixed time, deadlines, consequences, delegation", "nextAction": "one concrete immediate action", "others": [{"responsibilityId": "", "title": ..., "suggestedHandling": "delegate|postpone|communicate|reschedule ..."}], "reassessIf": ["up to 3 triggers"], "uncertaintyNotes": ...}`;
}
