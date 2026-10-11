import { describe, expect, it } from 'vitest';
import { buildTemporal, buildTimeRange } from '../decision/expression-builder';
import type { DecisionContextV2, HumanNeed, ResponsibilityV2, TemporalExpression } from '../decision/spec';
import { createReference } from '../temporal/temporal';
import { analyzeDecisionContext } from './engine';

const LAGOS = 'Africa/Lagos';
const refAt = (nowIso: string) => createReference({ nowIso, timezone: LAGOS });

// Anchor week: Mon 2026-10-05 .. Sun 2026-10-10.
const MON_6PM = '2026-10-05T18:00:00+01:00';
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

function statedEffort(minutes: number, maxMinutes?: number) {
  return { minutes, maxMinutes: maxMinutes ?? null, confidence: 'stated' as const, state: 'known' as const, note: '' };
}

/** Sleep/rest need with an explicit clock window. refIso anchors relative days ("tomorrow"). */
function sleepNeed(refIso: string, dayText: string, sh: number, sm: 'am' | 'pm', eh: number, em: 'am' | 'pm', desc = 'sleep'): HumanNeed {
  const { expression } = buildTimeRange(
    { hour: sh, minute: 0, meridiem: sm },
    { hour: eh, minute: 0, meridiem: em },
    dayText,
    `${desc} ${dayText}`,
    refAt(refIso),
  );
  return { kind: 'sleep', description: desc, window: expression.kind === 'unknown' ? null : expression, state: 'known' };
}

function ctx(nowIso: string, responsibilities: ResponsibilityV2[], humanNeeds: HumanNeed[] = []): DecisionContextV2 {
  return { reference: refAt(nowIso), rawText: 'test', responsibilities, constraints: [], humanNeeds, unknowns: [] };
}

describe('S1 — enough time, almost no buffer (Tue 6PM, due Wed 7AM, 6h work, sleep 12–6)', () => {
  const situation = ctx(TUE_6PM, [
    resp({ title: 'Assignment', deadline: exactDeadline('2026-10-07T06:00:00.000Z'), effort: statedEffort(360), status: 'not-started' }),
  ], [sleepNeed(TUE_6PM, 'tomorrow', 12, 'am', 6, 'am')]);
  const a = analyzeDecisionContext(situation);
  const r = a.responsibilityAnalysis[0];

  it('computes 7h available (not the 13h raw span)', () => {
    expect(r.availableMinutes).toBe(420);
    expect(r.availableWindows).toHaveLength(2);
  });
  it('reports TIGHT with a 1h buffer (never "comfortable")', () => {
    expect(r.feasibility).toBe('TIGHT');
    expect(r.bufferMinutes).toBe(60);
    expect(r.shortfallMinutes).toBeNull();
  });
  it('exposes totals anchored to the deadline', () => {
    expect(a.totalRequiredMinutes).toBe(360);
    expect(a.totalAvailableMinutes).toBe(420);
    expect(a.bufferMinutes).toBe(60);
    expect(a.analysisStatus).toBe('complete');
  });
});

describe('S2 — impossible deadline (Wed 8PM, due Thu 7AM, 8h work, protected sleep)', () => {
  const ref = createReference({ nowIso: '2026-10-07T20:00:00+01:00', timezone: LAGOS });
  const sleep = sleepNeed('2026-10-07T20:00:00+01:00', 'tomorrow', 12, 'am', 6, 'am');
  const situation: DecisionContextV2 = {
    reference: ref, rawText: 'test', constraints: [], unknowns: [],
    responsibilities: [resp({ title: 'Assignment', deadline: exactDeadline('2026-10-08T06:00:00.000Z'), effort: statedEffort(480) })],
    humanNeeds: [sleep],
  };
  const a = analyzeDecisionContext(situation);
  const r = a.responsibilityAnalysis[0];

  it('finds 5h available against 8h required', () => {
    expect(r.availableMinutes).toBe(300);
    expect(r.feasibility).toBe('INFEASIBLE');
    expect(r.shortfallMinutes).toBe(180);
  });
  it('raises deadline + protected-sleep constraint conflicts (never "wake earlier")', () => {
    const types = a.conflicts.map((c) => c.type);
    expect(types).toContain('deadline');
    expect(types).toContain('constraint');
    expect(JSON.stringify(a.conflicts)).not.toMatch(/wake (up )?earlier|skip sleep/i);
  });
});

describe('S16 paired — same facts, 2PM vs 11PM → materially different availability', () => {
  const mk = (nowIso: string) => ctx(nowIso, [
    resp({ title: 'Assignment', deadline: exactDeadline('2026-10-07T07:00:00.000Z'), effort: statedEffort(300) }),
  ], [sleepNeed(nowIso, 'tomorrow', 12, 'am', 6, 'am')]);
  it('produces different available minutes', () => {
    const a = analyzeDecisionContext(mk('2026-10-06T14:00:00+01:00'));
    const b = analyzeDecisionContext(mk('2026-10-06T23:00:00+01:00'));
    expect(a.responsibilityAnalysis[0].availableMinutes).toBeGreaterThan(b.responsibilityAnalysis[0].availableMinutes);
    expect(a.responsibilityAnalysis[0].availableMinutes - b.responsibilityAnalysis[0].availableMinutes).toBe(540);
  });
});

describe('S9 — sleep explicitly protected is excluded, not moved', () => {
  const situation = ctx('2026-10-06T21:00:00+01:00', [
    resp({ title: 'Assignment', deadline: exactDeadline('2026-10-07T09:00:00.000Z'), effort: statedEffort(360) }),
  ], [sleepNeed('2026-10-06T21:00:00+01:00', 'tomorrow', 12, 'am', 6, 'am')]);
  const a = analyzeDecisionContext(situation);
  it('counts 7h (3h evening + 4h morning) with 1h buffer', () => {
    expect(a.responsibilityAnalysis[0].availableMinutes).toBe(420);
    expect(a.responsibilityAnalysis[0].bufferMinutes).toBe(60);
  });
  it('never suggests working through the night', () => {
    expect(a.conflicts.map((c) => c.type)).not.toContain('constraint');
    expect(a.blockedWindows.some((w) => w.reason.includes('sleep'))).toBe(true);
  });
});

describe('S4 — fixed commitment after the deadline is not a conflict', () => {
  // Sat 4PM now; project due Sat 10PM? No — due Sat 10 AM is past; use project due Sun 10AM, meeting Sat 5–7PM.
  const situation = ctx('2026-10-10T16:00:00+01:00', [
    resp({ title: 'School project', deadline: exactDeadline('2026-10-11T09:00:00.000Z'), effort: statedEffort(300) }),
  ], [{
    kind: 'fixed-event', description: 'community meeting',
    window: buildTimeRange({ hour: 5, minute: 0, meridiem: 'pm' }, { hour: 7, minute: 0, meridiem: 'pm' }, '', 'Sat 5-7pm', refAt('2026-10-10T16:00:00+01:00')).expression as HumanNeed['window'],
    state: 'known',
  }]);
  const a = analyzeDecisionContext(situation);
  it('subtracts the meeting from available time without flagging a conflict', () => {
    // 16:00→(meeting 17–19)→10:00+1: 18h span minus 2h meeting = 16h = 960 min.
    expect(a.responsibilityAnalysis[0].availableMinutes).toBe(960);
    expect(a.conflicts).toEqual([]);
    expect(a.responsibilityAnalysis[0].feasibility).toBe('FEASIBLE');
  });
});

describe('S5/S6 — delegation only when stated and agreed', () => {
  const mk = (agreed: boolean) => ctx(TUE_6PM, [
    resp({
      title: 'Presentation', deadline: exactDeadline('2026-10-07T13:00:00.000Z'), effort: statedEffort(240),
      delegation: { possible: true, agreed, savesMinutes: 90, state: 'known' },
    }),
  ]);
  it('S5: agreed delegation reduces required to 2.5h', () => {
    const r = analyzeDecisionContext(mk(true)).responsibilityAnalysis[0];
    expect(r.requiredMinutes).toBe(150);
    expect(r.delegationApplied).toBe(true);
  });
  it('S6: refused delegation keeps full effort, never re-suggests asking', () => {
    const r = analyzeDecisionContext(mk(false)).responsibilityAnalysis[0];
    expect(r.requiredMinutes).toBe(240);
    expect(r.delegationApplied).toBe(false);
  });
});

describe('S8 + reassessment readiness — estimate change recalculates (10PM, due 10AM, sleep 12–6)', () => {
  const mk = (effort: number) => ctx('2026-10-07T22:00:00+01:00', [
    resp({ title: 'Project', deadline: exactDeadline('2026-10-08T09:00:00.000Z'), effort: statedEffort(effort) }),
  ], [sleepNeed('2026-10-07T22:00:00+01:00', 'tomorrow', 12, 'am', 6, 'am')]);
  it('old 4h estimate fits; revised 7h estimate does not (2h... 1h shortfall)', () => {
    // Windows: 10PM–12AM (120) + 6AM–10AM (240) = 360 min.
    const before = analyzeDecisionContext(mk(240)).responsibilityAnalysis[0];
    expect(before.availableMinutes).toBe(360);
    expect(before.feasibility).toBe('FEASIBLE');
    const after = analyzeDecisionContext(mk(420)).responsibilityAnalysis[0];
    expect(after.availableMinutes).toBe(360);
    expect(after.feasibility).toBe('INFEASIBLE');
    expect(after.shortfallMinutes).toBe(60);
  });
});
