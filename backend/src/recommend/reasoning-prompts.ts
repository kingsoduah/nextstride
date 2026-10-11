import type { DecisionAnalysisV2 } from '../analysis/analysis';
import type { DecisionContextV2 } from '../decision/spec';
import type { AnalysisDiff } from './diff';

/** V2 reasoning prompt version — stored on every RecommendationV2 row and AiRun. */
export const REASONING_VERSION = 'v2-reason-v1';

const REASONING_SYSTEM_PROMPT = `You are NextStride, a calm decision-support assistant. You help an overwhelmed person decide the single most realistic next move. You advise; you never command.

Three layers, never mixed:
- FACTS: the structured situation and the deterministic analysis below. Its numbers (available minutes, buffers, shortfalls, feasibility, windows) are already computed and CORRECT. Do not recalculate, reinterpret, or override them. Never invent your own arithmetic.
- INTERPRETATION: your judgment about what the facts mean (trade-offs, urgency vs importance, consequences).
- RECOMMENDATION: the concrete next move, in the exact JSON shape requested.

Rules:
- Respect hard constraints and protected needs (sleep, fixed commitments). Never recommend violating them; if nothing fits, say so and offer only legitimate alternatives (reduce scope, negotiate a deadline the user can negotiate, use help that is explicitly available).
- Never invent facts: no deadlines, effort, durations, delegation, permissions, extensions, or completions beyond what is stated. Unknown stays unknown.
- Never suggest delegation unless the facts say help is explicitly available and agreed.
- Treat sleep/rest as protected unless the user says otherwise. Never invent a sleep duration.
- If feasibility is INFEASIBLE, do not answer "just prioritize better". State the shortfall plainly and give realistic options.
- Weigh urgency against importance using deadline proximity, consequence, effort, dependencies, windows, and flexibility — not deadline alone.
- Respect dependency order: never recommend a dependent task before its unmet prerequisite.
- Consider downstream deadlines: work that must start now to stay feasible counts, even without the earliest deadline.
- Preserve uncertainty: reason with approximation windows as given; never collapse "around 7 PM" to 7:00 PM. If AM/PM is unresolved and it changes the answer, ask exactly one minimal question via NEEDS_INPUT.
- Ask only when blocked: proceed with stated assumptions when the unknown does not change the move.
- Be concise and glanceable: short sentences, no essays, no filler, no repeating the whole situation back. The user must grasp what/why/next in seconds.
- Stay domain-neutral: no profession-specific assumptions.
- If reassessment context is provided, reason explicitly about what changed using its numbers. If nothing material changed, keep the recommendation stable instead of inventing novelty.

Respond with a single JSON object only, no markdown fences, matching this shape exactly:
{"nextMove": "one concrete action", "why": "2-4 sentences grounded in the facts", "plan": ["short realistic steps using only the given time windows"], "whatCanWait": ["responsibilities that can wait without harm"], "risk": "main risk incl. shortfall when infeasible", "reassessmentTrigger": "concrete condition to reassess", "assumptions": ["material assumptions only, or []"], "unknowns": [{"field": ..., "whyItMatters": ..., "blocking": ...}] (material only, or []) , "options": ["constraint-safe alternatives, or []"], "status": "RECOMMEND | REASSESS | NEEDS_INPUT | INFEASIBLE"}`;

export interface ReasoningInput {
  situationText: string;
  context: DecisionContextV2;
  analysis: DecisionAnalysisV2;
  previous?: {
    recommendation: Record<string, unknown>;
    analysis: DecisionAnalysisV2;
    diffSummary: AnalysisDiff;
  };
}

function verdictLine(r: {
  title: string;
  feasibility: string;
  requiredMinutes: number | null;
  availableMinutes: number;
  bufferMinutes: number | null;
  shortfallMinutes: number | null;
}): string {
  const req = r.requiredMinutes ?? '?';
  switch (r.feasibility) {
    case 'FEASIBLE':
      return `FEASIBLE: "${r.title}" needs ${req}m, has ${r.availableMinutes}m, ${r.bufferMinutes}m left over.`;
    case 'TIGHT':
      return `TIGHT: "${r.title}" needs ${req}m, has ${r.availableMinutes}m, only ${r.bufferMinutes}m left over — no room for overruns.`;
    case 'AT_RISK':
      return `AT_RISK: "${r.title}" needs ${req}m, has ${r.availableMinutes}m — risky, uncertainty could break it.`;
    case 'INFEASIBLE':
      return `INFEASIBLE: "${r.title}" needs ${req}m but only ${r.availableMinutes}m exist — shortfall ${r.shortfallMinutes}m.`;
    default:
      return `CANNOT_DETERMINE: "${r.title}" cannot be scheduled — missing deadline or effort.`;
  }
}

function compactAnalysis(analysis: DecisionAnalysisV2): string {
  return JSON.stringify({
    referenceTime: analysis.reference.nowIso,
    timezone: analysis.timezone,
    status: analysis.analysisStatus,
    totals: {
      requiredMinutes: analysis.totalRequiredMinutes,
      availableMinutes: analysis.totalAvailableMinutes,
      bufferMinutes: analysis.bufferMinutes,
      shortfallMinutes: analysis.shortfallMinutes,
    },
    responsibilities: analysis.responsibilityAnalysis.map((r) => ({
      title: r.title,
      verdict: verdictLine(r),
      deadlineKind: r.deadlineKind,
      deadlineEnd: r.deadlineEndIso,
      effortMinutes: r.effortMinutes,
      requiredMinutes: r.requiredMinutes,
      availableMinutes: r.availableMinutes,
      bufferMinutes: r.bufferMinutes,
      shortfallMinutes: r.shortfallMinutes,
      feasibility: r.feasibility,
      availableWindows: r.availableWindows,
      delegationApplied: r.delegationApplied,
      consequenceKnown: r.consequenceKnown,
    })),
    blockedWindows: analysis.blockedWindows,
    dependencies: analysis.dependencies,
    conflicts: analysis.conflicts,
    unknowns: analysis.unknowns,
    blockingUnknowns: analysis.blockingUnknowns,
  });
}

function compactContext(context: DecisionContextV2): string {
  return JSON.stringify({
    timezone: context.reference.timezone,
    responsibilities: context.responsibilities.map((r) => ({
      title: r.title,
      category: r.category,
      deadline: r.deadline,
      effort: r.effort,
      consequence: r.consequenceKnown ? r.consequence : null,
      flexibility: r.flexibility,
      delegation: r.delegation,
      dependsOn: r.dependsOn,
      status: r.status,
    })),
    constraints: context.constraints,
    humanNeeds: context.humanNeeds,
    unknowns: context.unknowns,
  });
}

export function buildReasoningPrompt(input: ReasoningInput): string {
  const parts = [
    'READ FIRST: the verdict lines below are computed facts. Restate them in natural words; do not recompute, reinterpret, or contradict them.',
    `Original situation (preserve its intent and nuance): """${input.situationText}"""`,
    `FACTS — structured context: ${compactContext(input.context)}`,
    `FACTS — deterministic analysis (authoritative numbers, do not recalculate): ${compactAnalysis(input.analysis)}`,
  ];
  if (input.previous) {
    parts.push(
      `REASSESSMENT — previous recommendation: ${JSON.stringify(input.previous.recommendation)}`,
      `REASSESSMENT — previous analysis totals: required=${input.previous.analysis.totalRequiredMinutes}, available=${input.previous.analysis.totalAvailableMinutes}, status=${input.previous.analysis.analysisStatus}`,
      `REASSESSMENT — what changed (deterministic, use these numbers, do not fabricate others): ${JSON.stringify(input.previous.diffSummary)}`,
    );
  }
  parts.push(
    'How to read the numbers (do not mix these up): availableMinutes is the TOTAL usable work time. ' +
    'requiredMinutes is the work needed. bufferMinutes is what REMAINS after the work (available minus required). ' +
    'shortfallMinutes is the deficit, present only when the work does not fit. ' +
    'feasibility is the final verdict for each responsibility — restate it, never contradict it.',
    'Return JSON matching the requested shape exactly.',
  );
  return parts.join('\n\n');
}

export { REASONING_SYSTEM_PROMPT };
