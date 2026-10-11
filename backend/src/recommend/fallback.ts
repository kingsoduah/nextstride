import type { DecisionAnalysisV2, ResponsibilityAnalysis } from '../analysis/analysis';
import type { DecisionContextV2, ResponsibilityV2 } from '../decision/spec';
import type { RecommendationV2 } from './recommendation';

/**
 * Phase 4 deterministic fallback: used when Groq is unavailable or its
 * output fails validation twice. Conservative and mechanical — it only
 * restates analysis facts and never invents reasoning it cannot support:
 * - blocked on material unknowns → NEEDS_INPUT naming the first one
 * - any INFEASIBLE → INFEASIBLE with only context-supported options
 * - otherwise earliest-deadline feasible work, honoring dependency order
 */

function fmtTime(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: timezone,
  }).format(new Date(iso));
}

function fmtRange(startIso: string, endIso: string, timezone: string): string {
  return `${fmtTime(startIso, timezone)}–${fmtTime(endIso, timezone)}`;
}

function contextResp(context: DecisionContextV2, title: string): ResponsibilityV2 | undefined {
  return context.responsibilities.find((r) => r.title === title);
}

function safeOptions(context: DecisionContextV2, target: ResponsibilityV2, shortfall: number | null): string[] {
  const options: string[] = [
    `Reduce the scope of "${target.title}"${shortfall != null ? ` to fit the available time (shortfall ${shortfall} minutes)` : ''}.`,
  ];
  if (target.flexibility !== 'fixed') {
    options.push(`Negotiate the deadline for "${target.title}" if the other party allows it.`);
  }
  if (target.delegation?.agreed) {
    options.push(`Use the agreed help for "${target.title}" to cover part of the work.`);
  }
  return options;
}

function orderForAction(
  context: DecisionContextV2,
  candidates: ResponsibilityAnalysis[],
): ResponsibilityAnalysis {
  const byTitle = new Map(context.responsibilities.map((r) => [r.title.toLowerCase(), r]));
  for (const c of candidates) {
    const full = byTitle.get(c.title.toLowerCase());
    const prereq = (full?.dependsOn ?? [])
      .map((d) => context.responsibilities.find((r) => r.title.toLowerCase() === d.toLowerCase()))
      .find((r) => r && r.status !== 'done');
    if (prereq) {
      const preEntry = candidates.find((x) => x.title.toLowerCase() === prereq.title.toLowerCase());
      if (preEntry) return preEntry;
    }
  }
  return candidates[0];
}

export class FallbackRecommender {
  static readonly name = 'deterministic-fallback';

  static build(context: DecisionContextV2, analysis: DecisionAnalysisV2): RecommendationV2 {
    const timezone = analysis.timezone;
    const blocking = analysis.blockingUnknowns;

    if (blocking.length > 0) {
      const first = blocking[0];
      return {
        nextMove: `Clarify one thing first: ${first.field} — ${first.whyItMatters}`,
        why: `The plan cannot be completed responsibly without this information. Everything else is on hold until it is known.`,
        plan: [],
        whatCanWait: [],
        risk: `Proceeding without "${first.field}" risks planning around a wrong assumption.`,
        reassessmentTrigger: `Reassess once "${first.field}" is known.`,
        assumptions: [],
        unknowns: blocking,
        options: [],
        status: 'NEEDS_INPUT',
      };
    }

    const analyzable = analysis.responsibilityAnalysis.filter(
      (r) => r.feasibility !== 'CANNOT_DETERMINE' && r.requiredMinutes != null && r.deadlineEndIso != null,
    );

    const infeasible = analyzable.find((r) => r.feasibility === 'INFEASIBLE');
    if (infeasible) {
      const target = contextResp(context, infeasible.title);
      const options = target ? safeOptions(context, target, infeasible.shortfallMinutes) : [];
      return {
        nextMove: `Face the shortfall on "${infeasible.title}": ${infeasible.availableMinutes} minutes available against ${infeasible.requiredMinutes} required.`,
        why: `The deterministic analysis shows this work cannot fit before its deadline (shortfall ${infeasible.shortfallMinutes ?? '?'} minutes). No reordering fixes arithmetic.`,
        plan: [],
        whatCanWait: analyzable.filter((r) => r.title !== infeasible.title).map((r) => r.title),
        risk: `Without action, "${infeasible.title}" will miss its deadline by about ${infeasible.shortfallMinutes ?? '?'} minutes of work.`,
        reassessmentTrigger: `Reassess if effort shrinks, the deadline moves, or new help becomes explicitly available.`,
        assumptions: [],
        unknowns: analysis.unknowns.filter((u) => u.blocking),
        options,
        status: 'INFEASIBLE',
      };
    }

    if (analyzable.length === 0) {
      return {
        nextMove: `No responsibility has both a known deadline and a known effort estimate yet. Provide a deadline or effort figure to continue.`,
        why: `Nothing can be scheduled without at least one dated, estimated piece of work.`,
        plan: [],
        whatCanWait: [],
        risk: `Any plan made now would be invented rather than computed.`,
        reassessmentTrigger: `Reassess once timing or effort information is available.`,
        assumptions: [],
        unknowns: analysis.unknowns,
        options: [],
        status: 'NEEDS_INPUT',
      };
    }

    const actionable = analyzable.filter((r) => r.feasibility !== 'INFEASIBLE');
    const pick = orderForAction(
      context,
      [...actionable].sort((a, b) => (a.deadlineEndIso as string).localeCompare(b.deadlineEndIso as string)),
    );
    const steps = pick.availableWindows.slice(0, 2).map(
      (w) => `Work ${fmtRange(w.startIso, w.endIso, timezone)} (${w.minutes} minutes).`,
    );
    if (steps.length === 0) steps.push(`Start "${pick.title}" now.`);

    // Determine if the first window ends at a fixed commitment (not the deadline).
    // If so, clarify that the window ends at a blocked event, and the actual deadline is later.
    const firstWindow = pick.availableWindows[0];
    const deadlineEnd = pick.deadlineEndIso ? new Date(pick.deadlineEndIso).getTime() : null;
    const windowEnd = firstWindow ? new Date(firstWindow.endIso).getTime() : null;
    const endsAtCommitment = firstWindow && deadlineEnd && windowEnd && windowEnd < deadlineEnd;
    const blockedReason = endsAtCommitment
      ? analysis.blockedWindows.find((w) => Math.abs(new Date(w.endIso).getTime() - windowEnd) < 60000)?.reason
      : null;

    const windowClause = firstWindow
      ? `, in the ${fmtRange(firstWindow.startIso, firstWindow.endIso, timezone)} window${endsAtCommitment ? ` (ends at ${blockedReason || 'a fixed commitment'}; deadline is ${fmtTime(pick.deadlineEndIso!, timezone)})` : ''}`
      : '';
    const bufferNote =
      pick.bufferMinutes != null
        ? `Buffer remaining afterwards: about ${pick.bufferMinutes} minutes.`
        : `Time is tight with no measurable buffer.`;
    return {
      nextMove: `Start "${pick.title}" now${windowClause}.`,
      why: `"${pick.title}" is due first (${fmtTime(pick.deadlineEndIso!, timezone)}). ${pick.availableMinutes} minutes are available against ${pick.requiredMinutes} required (${pick.feasibility}).${
        pick.consequenceKnown ? ` The stakes are known, so protect this window.` : ''
      }${endsAtCommitment ? ` The available window ends at ${blockedReason || 'a fixed commitment'}; the deadline is ${fmtTime(pick.deadlineEndIso!, timezone)}.` : ''}`,
      plan: steps,
      whatCanWait: analyzable.filter((r) => r.title !== pick.title).map((r) => r.title),
      risk: pick.feasibility === 'FEASIBLE' ? bufferNote : `Schedule is ${pick.feasibility}. ${bufferNote}`,
      reassessmentTrigger: analysis.unknowns.length > 0
        ? `Reassess if "${analysis.unknowns[0].field}" becomes known or estimates change.`
        : `Reassess if time estimates or deadlines change.`,
      assumptions: [],
      unknowns: analysis.unknowns.filter((u) => u.blocking),
      options: [],
      status: 'RECOMMEND',
    };
  }
}
