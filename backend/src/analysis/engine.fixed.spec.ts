import { describe, expect, it } from 'vitest';
import { buildTimeRange } from '../decision/expression-builder';
import type { DecisionContextV2, HumanNeed, ResponsibilityV2, TemporalExpression } from '../decision/spec';
import { createReference } from '../temporal/temporal';
import { analyzeDecisionContext } from './engine';

const LAGOS = 'Africa/Lagos';
const refAt = (nowIso: string) => createReference({ nowIso, timezone: LAGOS });
const TUE_6PM = '2026-10-06T18:00:00+01:00';

function resp(o: Partial<ResponsibilityV2> & { title: string }): ResponsibilityV2 {
  return {
    description: '',
    category: 'academic',
    deadline: null,
    effort: null,
    consequence: '',
    consequenceKnown: false,
    flexibility: 'unknown',
    delegation: null,
    dependsOn: [],
    status: 'unknown',
    ...o,
  };
}

function exactDeadline(instantIso: string) {
  return { expression: { kind: 'exact', instantIso } as TemporalExpression, precision: 'exact' as const, state: 'known' as const };
}

function statedEffort(minutes: number) {
  return { minutes, maxMinutes: null, confidence: 'stated' as const, state: 'known' as const, note: '' };
}

function ctx(nowIso: string, responsibilities: ResponsibilityV2[], humanNeeds: HumanNeed[] = []): DecisionContextV2 {
  return { reference: refAt(nowIso), rawText: 'test', responsibilities, constraints: [], humanNeeds, unknowns: [] };
}

describe('fixed commitments block time', () => {
  // Fellowship meeting Wed 4–6pm+01 (15:00–17:00Z).
  const meeting = resp({
    title: 'Fellowship meeting',
    category: 'fellowship',
    flexibility: 'fixed',
    deadline: {
      expression: { kind: 'approximate', centreIso: '2026-10-07T16:00:00.000Z', toleranceMinutes: 60, raw: '4pm to 6pm' } as TemporalExpression,
      precision: 'approximate' as const,
      state: 'inferred' as const,
    },
    effort: null,
    status: 'unknown',
  });

  it('a fixed-window responsibility is excluded from available time', () => {
    const a = analyzeDecisionContext(ctx(TUE_6PM, [
      resp({ title: 'Assignment', deadline: exactDeadline('2026-10-07T21:00:00.000Z'), effort: statedEffort(360) }),
      meeting,
    ]));
    const assignment = a.responsibilityAnalysis.find((r) => r.title === 'Assignment');
    // Tue 17:00Z → Wed 21:00Z = 28h minus 2h meeting = 26h = 1560 min.
    expect(assignment?.availableMinutes).toBe(1560);
    expect(a.blockedWindows.some((w) => w.source === 'fixed-commitment' && w.reason.includes('Fellowship meeting'))).toBe(true);
  });

  it('a flexible responsibility with the same window does not block', () => {
    const flex = { ...meeting, flexibility: 'flexible' as const };
    const a = analyzeDecisionContext(ctx(TUE_6PM, [
      resp({ title: 'Assignment', deadline: exactDeadline('2026-10-07T21:00:00.000Z'), effort: statedEffort(360) }),
      flex,
    ]));
    expect(a.blockedWindows.some((w) => w.source === 'fixed-commitment')).toBe(false);
    expect(a.responsibilityAnalysis.find((r) => r.title === 'Assignment')?.availableMinutes).toBe(1680);
  });

  it('overlapping fixed commitments raise a timed time conflict', () => {
    const ref = refAt(TUE_6PM);
    const win = (sh: number, eh: number) => {
      const { expression } = buildTimeRange(
        { hour: sh, minute: 0, meridiem: 'pm' },
        { hour: eh, minute: 0, meridiem: 'pm' },
        'tomorrow',
        `meeting ${sh} to ${eh}`,
        ref,
      );
      return expression.kind === 'unknown' ? null : expression;
    };
    const wa = win(4, 6);
    const wb = win(5, 7);
    if (!wa || !wb) throw new Error('test windows failed to build');
    const a = analyzeDecisionContext(ctx(TUE_6PM, [
      resp({ title: 'Assignment', deadline: exactDeadline('2026-10-07T06:00:00.000Z'), effort: statedEffort(60) }),
      resp({ title: 'Meeting A', category: 'work', flexibility: 'fixed', deadline: {
        expression: wa, precision: 'approximate' as const, state: 'inferred' as const,
      } }),
      resp({ title: 'Meeting B', category: 'work', flexibility: 'fixed', deadline: {
        expression: wb, precision: 'approximate' as const, state: 'inferred' as const,
      } }),
    ]));
    const time = a.conflicts.filter((c) => c.type === 'time');
    expect(time).toHaveLength(1);
    expect(time[0].minutes).toBe(60);
  });

  it('deadline instants never block (zero duration)', () => {
    const a = analyzeDecisionContext(ctx(TUE_6PM, [
      resp({ title: 'Exam', flexibility: 'fixed', deadline: exactDeadline('2026-10-07T06:00:00.000Z'), effort: statedEffort(60) }),
    ]));
    expect(a.blockedWindows.some((w) => w.source === 'fixed-commitment')).toBe(false);
  });
});
