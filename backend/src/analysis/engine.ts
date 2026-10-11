import { buildTimeRange } from '../decision/expression-builder';
import type { DecisionContextV2, ResolvedTemporal, TemporalExpression, Unknown } from '../decision/spec';
import { createReference, resolveTemporalExpression } from '../temporal/temporal';
import type {
  AnalysisConflict,
  DecisionAnalysisV2,
  DependencyLink,
  Feasibility,
  ResponsibilityAnalysis,
} from './analysis';

/**
 * Phase 3: deterministic decision analysis. Pure functions only —
 * no LLM, no clock reads (reference comes from the context or override),
 * no database. Same input → same output, always.
 *
 * Deliberately NOT decided here: what the user should do (Phase 4),
 * question wording beyond Phase 2 output, or any preference trade-offs.
 */

// FEASIBLE needs buffer >= max(90 min, 25% of required). S1-style 60-min
// buffers therefore read TIGHT ("feasible but tight"), never comfortable.
const FEASIBLE_MIN_MINUTES = 90;
const FEASIBLE_MIN_RATIO = 0.25;

interface Span {
  start: number;
  end: number;
}

function toSpan(startIso: string, endIso: string): Span {
  return { start: new Date(startIso).getTime(), end: new Date(endIso).getTime() };
}

function toWindow(span: Span): { startIso: string; endIso: string; minutes: number } {
  return {
    startIso: new Date(span.start).toISOString(),
    endIso: new Date(span.end).toISOString(),
    minutes: Math.max(0, Math.round((span.end - span.start) / 60000)),
  };
}

/** Subtract blocked spans from a base span; drops elapsed (pre-now) time. */
export function subtractWindows(base: Span, blocked: Span[], now: number): Span[] {
  const clipped = blocked
    .map((b) => ({ start: Math.max(b.start, Math.max(base.start, now)), end: Math.min(b.end, base.end) }))
    .filter((b) => b.end > b.start)
    .sort((a, b) => a.start - b.start);
  const out: Span[] = [];
  let cursor = Math.max(base.start, now);
  for (const b of clipped) {
    if (b.start > cursor) out.push({ start: cursor, end: Math.min(b.start, base.end) });
    cursor = Math.max(cursor, b.end);
  }
  if (cursor < base.end) out.push({ start: cursor, end: base.end });
  return out.filter((w) => w.end > w.start);
}

function overlaps(a: Span, b: Span): number {
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
}

/** Resolve any Phase 1/2 expression, including time-ranges. */
export function resolveExpression(
  expr: TemporalExpression,
  ref: { nowIso: string; timezone: string },
): ResolvedTemporal {
  if (expr.kind === 'time-range') {
    return buildTimeRange(
      { hour: expr.startClock.hour, minute: expr.startClock.minute, meridiem: expr.startClock.meridiem },
      { hour: expr.endClock.hour, minute: expr.endClock.minute, meridiem: expr.endClock.meridiem },
      expr.dayText,
      expr.raw,
      ref,
    ).resolved;
  }
  return resolveTemporalExpression(expr, ref);
}

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const PROTECTED_NEED_KINDS = new Set(['sleep', 'rest', 'class', 'work', 'fixed-event', 'religious-community']);

export interface AnalyzeOverride {
  nowIso?: string;
  timezone?: string;
}

/**
 * Stored Phase 2 resolutions, keyed `responsibility:{i}:deadline` and
 * `need:{i}:window`. Used ONLY when no override is supplied, i.e. the
 * reference is identical to parse time — otherwise recompute from scratch.
 * This preserves builder context (e.g. "tomorrow around 7" + later answer)
 * that the raw expression alone cannot recover.
 */
export type StoredResolutions = Record<string, ResolvedTemporal>;

function asStored(map: StoredResolutions | undefined, key: string): ResolvedTemporal | undefined {
  const v = map?.[key];
  return v && typeof v === 'object' && ['instant', 'window', 'needs-clarification', 'unresolved'].includes((v as { kind: string }).kind)
    ? v
    : undefined;
}

export function analyzeDecisionContext(
  context: DecisionContextV2,
  override?: AnalyzeOverride,
  stored?: StoredResolutions,
): DecisionAnalysisV2 {
  const reference = createReference({
    nowIso: override?.nowIso ?? context.reference.nowIso,
    timezone: override?.timezone ?? context.reference.timezone,
  });
  const now = new Date(reference.nowIso).getTime();
  const unknowns: Unknown[] = [...context.unknowns];
  const seenFields = new Set(unknowns.map((u) => u.field));
  const addUnknown = (u: Unknown) => {
    if (seenFields.has(u.field)) return;
    seenFields.add(u.field);
    unknowns.push(u);
  };

  if (context.responsibilities.length === 0) {
    addUnknown({ field: 'responsibilities', whyItMatters: 'Nothing to analyze.', blocking: true });
  }

  // Blocked spans: every human need with a resolvable window blocks that time.
  const blockedWindows: DecisionAnalysisV2['blockedWindows'] = [];
  const useStored = !override && stored ? stored : undefined;
  context.humanNeeds.forEach((need, i) => {
    if (!need.window) {
      if (need.kind === 'sleep' || need.kind === 'rest') {
        addUnknown({
          field: `${need.description || need.kind}: window`,
          whyItMatters: 'Protected rest without a window cannot be excluded from work time.',
          blocking: false,
        });
      }
      return;
    }
    const resolved = asStored(useStored, `need:${i}:window`) ?? resolveExpression(need.window, reference);
    if (resolved.kind === 'window') {
      const span = toSpan(resolved.startIso, resolved.endIso);
      if (span.end > now) {
        blockedWindows.push({
          ...toWindow({ start: Math.max(span.start, now), end: span.end }),
          reason: `${need.description || need.kind} (protected)`,
          source: 'human-need',
        });
      }
    } else if (resolved.kind === 'needs-clarification') {
      addUnknown({
        field: `${need.description || need.kind}: window`,
        whyItMatters: 'An ambiguous protected window cannot be excluded from work time.',
        blocking: true,
      });
    }
  });

  // Fixed commitments occupy time too: a fixed-flexibility responsibility
  // with a resolved window deadline blocks that span (deadline instants
  // occupy no time and never block). This keeps fixed events (meetings,
  // classes, shifts) out of available-time math without touching V1.
  context.responsibilities.forEach((r, i) => {
    if (r.flexibility !== 'fixed' || !r.deadline) return;
    const stored = asStored(useStored, `responsibility:${i}:deadline`);
    const resolved = stored ?? resolveExpression(r.deadline.expression, reference);
    if (resolved.kind !== 'window') return;
    const span = toSpan(resolved.startIso, resolved.endIso);
    if (span.end > now) {
      blockedWindows.push({
        ...toWindow({ start: Math.max(span.start, now), end: span.end }),
        reason: `${r.title} (fixed commitment)`,
        source: 'fixed-commitment',
      });
    }
  });

  // Time conflicts: protected windows overlapping each other.
  const conflicts: AnalysisConflict[] = [];
  for (let a = 0; a < blockedWindows.length; a += 1) {
    for (let b = a + 1; b < blockedWindows.length; b += 1) {
      const ms = overlaps(toSpan(blockedWindows[a].startIso, blockedWindows[a].endIso), toSpan(blockedWindows[b].startIso, blockedWindows[b].endIso));
      if (ms > 0) {
        conflicts.push({
          type: 'time',
          description: `Protected windows overlap: "${blockedWindows[a].reason}" and "${blockedWindows[b].reason}".`,
          involves: [blockedWindows[a].reason, blockedWindows[b].reason],
          minutes: Math.round(ms / 60000),
        });
      }
    }
  }

  // Per-responsibility analysis.
  const responsibilityAnalysis: ResponsibilityAnalysis[] = context.responsibilities.map((r, index) => {
    const respUnknowns: Unknown[] = [];
    const resolved = r.deadline
      ? (asStored(useStored, `responsibility:${index}:deadline`) ?? resolveExpression(r.deadline.expression, reference))
      : { kind: 'unresolved' as const, reason: 'No deadline provided.' };
    const deadlineKind = resolved.kind;
    const deadlineEndIso = resolved.kind === 'instant' ? resolved.instantIso : resolved.kind === 'window' ? resolved.endIso : null;

    const baseEffort = r.effort?.maxMinutes ?? r.effort?.minutes ?? null;
    let requiredMinutes = baseEffort;
    let delegationApplied = false;
    if (requiredMinutes != null && r.delegation?.agreed && r.delegation.savesMinutes != null) {
      requiredMinutes = Math.max(0, requiredMinutes - r.delegation.savesMinutes);
      delegationApplied = true;
    }

    if (!deadlineEndIso || requiredMinutes == null) {
      if (!deadlineEndIso) {
        respUnknowns.push({
          field: `${r.title}: usable deadline`,
          whyItMatters: 'Feasibility cannot be computed without a deadline.',
          blocking: true,
        });
      }
      if (requiredMinutes == null) {
        // Fixed commitments (meetings, classes, shifts) don't require user effort;
        // they only block time. Missing effort for them is not a blocking unknown.
        const isFixedCommitment = r.flexibility === 'fixed';
        respUnknowns.push({
          field: `${r.title}: effort`,
          whyItMatters: 'Feasibility cannot be computed without effort.',
          blocking: !isFixedCommitment,
        });
      }
      return {
        index,
        title: r.title,
        consequenceKnown: r.consequenceKnown,
        deadlineKind,
        deadlineEndIso,
        effortMinutes: r.effort?.minutes ?? null,
        requiredMinutes,
        delegationApplied,
        availableMinutes: 0,
        availableWindows: [],
        bufferMinutes: null,
        shortfallMinutes: null,
        feasibility: 'CANNOT_DETERMINE' as Feasibility,
        unknowns: respUnknowns,
      };
    }

    const horizon = new Date(deadlineEndIso).getTime();
    const windows = horizon > now ? subtractWindows({ start: now, end: horizon }, blockedWindows.map((w) => toSpan(w.startIso, w.endIso)), now) : [];
    const availableMinutes = windows.reduce((sum, w) => sum + Math.round((w.end - w.start) / 60000), 0);
    const availableWindows = windows.map(toWindow);
    const diff = availableMinutes - (requiredMinutes as number);
    const bufferMinutes = diff >= 0 ? diff : null;
    const shortfallMinutes = diff < 0 ? -diff : null;

    let feasibility: Feasibility;
    if (shortfallMinutes != null && shortfallMinutes > 0) {
      const span = resolved.kind === 'window' ? Math.round((new Date(resolved.endIso).getTime() - new Date(resolved.startIso).getTime()) / 60000) : 0;
      feasibility = resolved.kind === 'window' && shortfallMinutes <= span ? 'AT_RISK' : 'INFEASIBLE';
    } else {
      const need = Math.max(FEASIBLE_MIN_MINUTES, Math.ceil((requiredMinutes as number) * FEASIBLE_MIN_RATIO));
      feasibility = (bufferMinutes as number) >= need ? 'FEASIBLE' : 'TIGHT';
    }

    if (feasibility === 'INFEASIBLE') {
      conflicts.push({
        type: 'deadline',
        description: `"${r.title}" needs ${requiredMinutes} min but only ${availableMinutes} min fit before its deadline (shortfall ${shortfallMinutes} min).`,
        involves: [r.title],
        minutes: shortfallMinutes,
      });
      const hardNeed = blockedWindows.find((w) => {
        const needKind = context.humanNeeds.find((n) => (n.description || n.kind) && w.reason.startsWith(n.description || n.kind));
        return needKind && PROTECTED_NEED_KINDS.has(needKind.kind) && new Date(w.startIso).getTime() < horizon;
      });
      if (hardNeed) {
        conflicts.push({
          type: 'constraint',
          description: `Fitting "${r.title}" would require violating protected time: ${hardNeed.reason}.`,
          involves: [r.title, hardNeed.reason],
          minutes: null,
        });
      }
    }
    if (feasibility !== 'FEASIBLE') {
      const unprotectedRest = context.humanNeeds.find((n) => (n.kind === 'sleep' || n.kind === 'rest') && !n.window);
      if (unprotectedRest) {
        conflicts.push({
          type: 'energy',
          description: `"${r.title}" is ${feasibility} while rest (${unprotectedRest.description || unprotectedRest.kind}) has no protected window.`,
          involves: [r.title],
          minutes: null,
        });
      }
    }
    return {
      index,
      title: r.title,
      consequenceKnown: r.consequenceKnown,
      deadlineKind,
      deadlineEndIso,
      effortMinutes: r.effort?.minutes ?? null,
      requiredMinutes,
      delegationApplied,
      availableMinutes,
      availableWindows,
      bufferMinutes,
      shortfallMinutes,
      feasibility,
      unknowns: respUnknowns,
    };
  });

  // Merge per-responsibility unknowns into the global set (deduped by field).
  for (const entry of responsibilityAnalysis) {
    for (const u of entry.unknowns) addUnknown(u);
  }

  // Dependencies: match dependsOn text against other titles; order + conflicts.
  const dependencies: DependencyLink[] = [];
  context.responsibilities.forEach((r, dependentIndex) => {
    for (const dep of r.dependsOn) {
      const norm = normalize(dep);
      if (norm.length < 4) continue;
      const pre = context.responsibilities.findIndex(
        (other, oi) => oi !== dependentIndex && (normalize(other.title).includes(norm) || norm.includes(normalize(other.title))),
      );
      if (pre >= 0) {
        dependencies.push({
          prerequisiteIndex: pre,
          dependentIndex,
          prerequisiteTitle: context.responsibilities[pre].title,
          dependentTitle: r.title,
        });
        const preEnd = responsibilityAnalysis[pre].deadlineEndIso;
        const depEnd = responsibilityAnalysis[dependentIndex].deadlineEndIso;
        if (preEnd && depEnd && new Date(preEnd).getTime() > new Date(depEnd).getTime()) {
          conflicts.push({
            type: 'dependency',
            description: `Prerequisite "${context.responsibilities[pre].title}" is due after "${r.title}" needs it.`,
            involves: [context.responsibilities[pre].title, r.title],
            minutes: null,
          });
        }
      } else {
        addUnknown({
          field: `${r.title}: dependency "${dep}"`,
          whyItMatters: 'A prerequisite is named but not among the responsibilities.',
          blocking: false,
        });
      }
    }
  });

  // Totals anchored to the earliest usable deadline horizon.
  const ends = responsibilityAnalysis.map((a) => a.deadlineEndIso).filter((e): e is string => e != null);
  const horizonEnd = ends.length > 0 ? ends.sort()[0] : null;
  const due = responsibilityAnalysis.filter((a) => a.deadlineEndIso && horizonEnd && a.deadlineEndIso <= horizonEnd);
  const totalRequiredMinutes = due.length > 0 && due.every((a) => a.requiredMinutes != null)
    ? due.reduce((s, a) => s + (a.requiredMinutes as number), 0)
    : null;
  const horizonWindows = horizonEnd && new Date(horizonEnd).getTime() > now
    ? subtractWindows({ start: now, end: new Date(horizonEnd).getTime() }, blockedWindows.map((w) => toSpan(w.startIso, w.endIso)), now).map(toWindow)
    : [];
  const totalAvailableMinutes = horizonWindows.reduce((s, w) => s + w.minutes, 0);
  const totalDiff = totalRequiredMinutes != null ? totalAvailableMinutes - totalRequiredMinutes : null;

  const blockingUnknowns = unknowns.filter((u) => u.blocking);
  const decided = responsibilityAnalysis.filter((a) => a.feasibility !== 'CANNOT_DETERMINE').length;
  const analysisStatus = responsibilityAnalysis.length === 0 || decided === 0 ? 'blocked'
    : decided < responsibilityAnalysis.length ? 'partial'
    : 'complete';

  return {
    reference,
    timezone: reference.timezone,
    responsibilityAnalysis,
    availableWindows: horizonWindows,
    blockedWindows,
    dependencies,
    conflicts,
    totalRequiredMinutes,
    totalAvailableMinutes,
    bufferMinutes: totalDiff != null && totalDiff >= 0 ? totalDiff : null,
    shortfallMinutes: totalDiff != null && totalDiff < 0 ? -totalDiff : null,
    unknowns,
    blockingUnknowns,
    analysisStatus,
  };
}
