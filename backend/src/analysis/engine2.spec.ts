import { describe, expect, it } from 'vitest';
import { buildTemporal, buildTimeRange } from '../decision/expression-builder';
import type { DecisionContextV2, HumanNeed, ResponsibilityV2 } from '../decision/spec';
import { createReference } from '../temporal/temporal';
import { analyzeDecisionContext } from './engine';
import type { StoredResolutions } from './engine';

const LAGOS = 'Africa/Lagos';
const refAt = (nowIso: string) => createReference({ nowIso, timezone: LAGOS });
const MON_6PM = '2026-10-05T18:00:00+01:00';
const TUE_6PM = '2026-10-06T18:00:00+01:00';

function resp(o: Partial<ResponsibilityV2> & { title: string }): ResponsibilityV2 {
  return {
    description: '', category: 'academic', deadline: null, effort: null,
    consequence: '', consequenceKnown: false, flexibility: 'unknown',
    delegation: null, dependsOn: [], status: 'unknown', ...o,
  };
}

function exactDeadline(instantIso: string) {
  return { expression: { kind: 'exact', instantIso } as const, precision: 'exact' as const, state: 'known' as const };
}

function statedEffort(minutes: number) {
  return { minutes, maxMinutes: null, confidence: 'stated' as const, state: 'known' as const, note: '' };
}

function sleepNeed(refIso: string, dayText: string, sh: number, sm: 'am' | 'pm', eh: number, em: 'am' | 'pm'): HumanNeed {
  const { expression } = buildTimeRange(
    { hour: sh, minute: 0, meridiem: sm }, { hour: eh, minute: 0, meridiem: em },
    dayText, `sleep ${dayText}`, refAt(refIso),
  );
  return { kind: 'sleep', description: 'sleep', window: expression.kind === 'unknown' ? null : expression, state: 'known' };
}

function ctx(nowIso: string, responsibilities: ResponsibilityV2[], humanNeeds: HumanNeed[] = []): DecisionContextV2 {
  return { reference: refAt(nowIso), rawText: 'test', responsibilities, constraints: [], humanNeeds, unknowns: [] };
}

describe('S3 — two deadlines, both analyzed on their own horizons', () => {
  const a = analyzeDecisionContext(ctx('2026-10-08T17:00:00+01:00', [
    resp({ title: 'Assignment', deadline: exactDeadline('2026-10-09T09:00:00.000Z'), effort: statedEffort(180) }),
    resp({ title: 'Fellowship application', category: 'fellowship', deadline: exactDeadline('2026-10-09T22:59:00.000Z'), effort: statedEffort(300) }),
  ]));
  it('analyzes both; totals anchor to the earliest deadline', () => {
    expect(a.responsibilityAnalysis).toHaveLength(2);
    expect(a.responsibilityAnalysis.every((r) => r.feasibility !== 'CANNOT_DETERMINE')).toBe(true);
    expect(a.totalRequiredMinutes).toBe(180);
  });
});

describe('S7 — unknown fellowship deadline does not block the known one', () => {
  const a = analyzeDecisionContext(ctx('2026-10-06T19:00:00+01:00', [
    resp({ title: 'Assignment', deadline: exactDeadline('2026-10-07T07:00:00.000Z'), effort: statedEffort(240) }),
    resp({
      title: 'Fellowship task', category: 'fellowship',
      deadline: { expression: { kind: 'unknown', raw: '' }, precision: 'unknown', state: 'unknown' },
      effort: null,
    }),
  ]));
  it('analyzes the assignment, marks fellowship CANNOT_DETERMINE, never invents a date', () => {
    expect(a.responsibilityAnalysis[0].feasibility).not.toBe('CANNOT_DETERMINE');
    expect(a.responsibilityAnalysis[1].feasibility).toBe('CANNOT_DETERMINE');
    expect(a.analysisStatus).toBe('partial');
    expect(a.unknowns.some((u) => u.field.includes('Fellowship'))).toBe(true);
  });
});

describe('S10 — nothing urgent: analyzed, no false alarms', () => {
  const a = analyzeDecisionContext(ctx('2026-10-10T14:00:00+01:00', [
    resp({ title: 'Assignment', deadline: exactDeadline('2026-10-13T22:59:00.000Z'), effort: statedEffort(300) }),
    resp({ title: 'Fellowship task', category: 'fellowship', deadline: exactDeadline('2026-10-15T22:59:00.000Z'), effort: statedEffort(180) }),
  ]));
  it('both feasible, no conflicts, status complete', () => {
    expect(a.responsibilityAnalysis.map((r) => r.feasibility)).toEqual(['FEASIBLE', 'FEASIBLE']);
    expect(a.conflicts).toEqual([]);
    expect(a.analysisStatus).toBe('complete');
  });
});

describe('S11 — consequence preserved without ranking (ranking is Phase 4)', () => {
  const a = analyzeDecisionContext(ctx('2026-10-05T19:00:00+01:00', [
    resp({ title: 'Personal task', category: 'personal', deadline: exactDeadline('2026-10-06T15:00:00.000Z'), effort: statedEffort(60) }),
    resp({
      title: 'Client project', category: 'business', deadline: exactDeadline('2026-10-07T07:00:00.000Z'),
      effort: statedEffort(240), consequence: 'could lose future work', consequenceKnown: true,
    }),
  ]));
  it('keeps consequence data for Phase 4 to weigh', () => {
    expect(a.responsibilityAnalysis.find((r) => r.title === 'Client project')?.consequenceKnown).toBe(true);
    expect(a.responsibilityAnalysis.every((r) => r.feasibility !== 'CANNOT_DETERMINE')).toBe(true);
  });
});

describe('S12 — dependencies order the work, conflicts when inverted', () => {
  const mk = (reportDue: string) => ctx(TUE_6PM, [
    resp({ title: 'Collect and clean data', category: 'academic', deadline: exactDeadline('2026-10-08T09:00:00.000Z'), effort: statedEffort(180) }),
    resp({
      title: 'Write report', category: 'academic', deadline: exactDeadline(reportDue), effort: statedEffort(180),
      dependsOn: ['collect and clean data'],
    }),
  ]);
  it('links prerequisite → dependent without merging them', () => {
    const a = analyzeDecisionContext(mk('2026-10-08T09:00:00.000Z'));
    expect(a.dependencies).toEqual([{
      prerequisiteIndex: 0, dependentIndex: 1,
      prerequisiteTitle: 'Collect and clean data', dependentTitle: 'Write report',
    }]);
    expect(a.conflicts.filter((c) => c.type === 'dependency')).toEqual([]);
  });
  it('flags a dependency conflict when the prerequisite is due later', () => {
    const late = ctx(TUE_6PM, [
      resp({ title: 'Collect and clean data', category: 'academic', deadline: exactDeadline('2026-10-09T09:00:00.000Z'), effort: statedEffort(180) }),
      resp({
        title: 'Write report', category: 'academic', deadline: exactDeadline('2026-10-08T09:00:00.000Z'), effort: statedEffort(180),
        dependsOn: ['collect and clean data'],
      }),
    ]);
    expect(analyzeDecisionContext(late).conflicts.some((c) => c.type === 'dependency')).toBe(true);
  });
  it('names an unmatched dependency as a non-blocking unknown', () => {
    const a = analyzeDecisionContext(ctx(TUE_6PM, [
      resp({ title: 'Write report', deadline: exactDeadline('2026-10-08T09:00:00.000Z'), effort: statedEffort(180), dependsOn: ['data from teammate'] }),
    ]));
    expect(a.dependencies).toEqual([]);
    expect(a.unknowns.some((u) => u.field.includes('data from teammate') && !u.blocking)).toBe(true);
  });
});

describe('S13 — strong preference is not a hard block', () => {
  const a = analyzeDecisionContext(ctx(TUE_6PM, [
    resp({ title: 'School project', deadline: exactDeadline('2026-10-07T09:00:00.000Z'), effort: statedEffort(300) }),
  ], [{ kind: 'personal', description: 'time with sibling', window: null, state: 'known' }]));
  it('analyzes the project without inventing violations', () => {
    expect(a.responsibilityAnalysis[0].feasibility).not.toBe('CANNOT_DETERMINE');
    expect(a.conflicts.filter((c) => c.type === 'constraint')).toEqual([]);
  });
});

describe('S14 — fully underspecified → blocked, honestly', () => {
  const a = analyzeDecisionContext({
    reference: refAt(MON_6PM), rawText: 'overwhelmed', responsibilities: [], constraints: [], humanNeeds: [],
    unknowns: [{ field: 'everything', whyItMatters: 'no facts extracted', blocking: true }],
  });
  it('reports blocked with blocking unknowns, zero invented analysis', () => {
    expect(a.analysisStatus).toBe('blocked');
    expect(a.responsibilityAnalysis).toEqual([]);
    expect(a.blockingUnknowns.length).toBeGreaterThan(0);
    expect(a.totalRequiredMinutes).toBeNull();
  });
});

describe('S15 — state over time: feasible → INFEASIBLE with 1.5h shortfall', () => {
  const mk = (nowIso: string) => ctx(nowIso, [
    resp({ title: 'Client project', category: 'business', deadline: exactDeadline('2026-10-06T06:00:00.000Z'), effort: statedEffort(300) }),
  ], [sleepNeed(nowIso, 'tomorrow', 12, 'am', 6, 'am')]);
  it('recalculates instead of repeating the old plan', () => {
    const before = analyzeDecisionContext(mk(MON_6PM)).responsibilityAnalysis[0];
    expect(before.availableMinutes).toBe(420);
    expect(before.feasibility).toBe('FEASIBLE');
    const after = analyzeDecisionContext(mk('2026-10-05T21:30:00+01:00')).responsibilityAnalysis[0];
    expect(after.availableMinutes).toBe(210);
    expect(after.feasibility).toBe('INFEASIBLE');
    expect(after.shortfallMinutes).toBe(90);
  });
});

describe('approximate deadlines keep their windows', () => {
  it('horizon uses the window end; uncertainty span is measurable', () => {
    const ref = refAt(TUE_6PM);
    const built = buildTemporal({ dayText: 'tomorrow', timeText: 'around 7 AM', precision: 'approximate' }, ref);
    const a = analyzeDecisionContext({
      reference: ref, rawText: 't', constraints: [], unknowns: [], humanNeeds: [],
      responsibilities: [resp({
        title: 'Assignment',
        deadline: { expression: built.expression, precision: 'approximate', state: 'inferred' },
        effort: statedEffort(120),
      })],
    });
    const r = a.responsibilityAnalysis[0];
    expect(r.deadlineKind).toBe('window');
    expect(r.deadlineEndIso).toBe('2026-10-07T06:30:00.000Z');
  });

  it('AT_RISK when the shortfall fits inside deadline uncertainty', () => {
    // Deadline window 05:00–07:00Z (120 min span). Now 2AM local (01:00Z):
    // available 01:00–07:00Z = 360 vs 390 required → 30 min shortfall ≤ 120 span.
    const a = analyzeDecisionContext({
      reference: refAt('2026-10-07T02:00:00+01:00'), rawText: 't', constraints: [], unknowns: [], humanNeeds: [],
      responsibilities: [resp({
        title: 'Assignment',
        deadline: {
          expression: { kind: 'approximate', centreIso: '2026-10-07T06:00:00.000Z', toleranceMinutes: 60, raw: 'around 7' },
          precision: 'approximate', state: 'inferred',
        },
        effort: statedEffort(390),
      })],
    });
    const r = a.responsibilityAnalysis[0];
    expect(r.availableMinutes).toBe(360);
    expect(r.shortfallMinutes).toBe(30);
    expect(r.feasibility).toBe('AT_RISK');
  });

  it('bare "7" with stored builder context blocks; without it, degrades honestly', () => {
    const ref = refAt(TUE_6PM);
    const built = buildTemporal({ dayText: 'tomorrow', timeText: 'around 7', precision: 'approximate' }, ref);
    const base: DecisionContextV2 = {
      reference: ref, rawText: 't', constraints: [], unknowns: [], humanNeeds: [],
      responsibilities: [resp({
        title: 'Assignment',
        deadline: { expression: built.expression, precision: 'relative', state: 'needs-clarification' },
        effort: statedEffort(60),
      })],
    };
    // Real flow: Phase 2 stored resolutions accompany the context.
    const stored: StoredResolutions = { 'responsibility:0:deadline': built.resolved };
    const withStored = analyzeDecisionContext({ ...base, responsibilities: [...base.responsibilities] }, undefined, stored);
    expect(withStored.responsibilityAnalysis[0].deadlineKind).toBe('needs-clarification');
    expect(withStored.responsibilityAnalysis[0].feasibility).toBe('CANNOT_DETERMINE');
    expect(withStored.blockingUnknowns.length).toBeGreaterThan(0);
    // Without stored context the engine cannot recover the day — still blocking, never guessing.
    const degraded = analyzeDecisionContext({ ...base, responsibilities: [...base.responsibilities] });
    expect(degraded.responsibilityAnalysis[0].feasibility).toBe('CANNOT_DETERMINE');
    expect(degraded.blockingUnknowns.length).toBeGreaterThan(0);
  });
});

describe('conflict details', () => {
  it('overlapping protected windows raise a timed time-conflict', () => {
    const ref = refAt(MON_6PM);
    const w1 = buildTimeRange({ hour: 5, minute: 0, meridiem: 'pm' }, { hour: 8, minute: 0, meridiem: 'pm' }, '', 'class 5-8', ref);
    const w2 = buildTimeRange({ hour: 7, minute: 0, meridiem: 'pm' }, { hour: 9, minute: 0, meridiem: 'pm' }, '', 'shift 7-9', ref);
    const need = (w: typeof w1, kind: 'class' | 'work', desc: string): HumanNeed => ({
      kind, description: desc, window: w.expression.kind === 'unknown' ? null : w.expression, state: 'known',
    });
    const a = analyzeDecisionContext({
      reference: ref, rawText: 't', constraints: [], unknowns: [],
      responsibilities: [resp({ title: 'Assignment', deadline: { expression: { kind: 'exact', instantIso: '2026-10-07T06:00:00.000Z' }, precision: 'exact', state: 'known' }, effort: statedEffort(60) })],
      humanNeeds: [need(w1, 'class', 'class'), need(w2, 'work', 'shift')],
    });
    const time = a.conflicts.filter((c) => c.type === 'time');
    expect(time).toHaveLength(1);
    expect(time[0].minutes).toBe(60);
  });

  it('tight plan + unprotected sleep raises an energy conflict', () => {
    // 13h span, 12h work → 60 min buffer < max(90, 25%) → TIGHT.
    const a = analyzeDecisionContext(ctx(TUE_6PM, [
      resp({ title: 'Assignment', deadline: exactDeadline('2026-10-07T06:00:00.000Z'), effort: statedEffort(720) }),
    ], [{ kind: 'sleep', description: 'sleep', window: null, state: 'unknown' }]));
    expect(a.responsibilityAnalysis[0].feasibility).toBe('TIGHT');
    expect(a.conflicts.some((c) => c.type === 'energy')).toBe(true);
  });
});

describe('clock overrides and effort ranges', () => {
  it('nowIso override recomputes availability (elapsed time matters)', () => {
    const base = ctx(TUE_6PM, [
      resp({ title: 'Assignment', deadline: exactDeadline('2026-10-07T06:00:00.000Z'), effort: statedEffort(360) }),
    ], [sleepNeed(TUE_6PM, 'tomorrow', 12, 'am', 6, 'am')]);
    const a = analyzeDecisionContext(base);
    const b = analyzeDecisionContext(base, { nowIso: '2026-10-06T22:00:00+01:00' });
    expect(b.responsibilityAnalysis[0].availableMinutes).toBeLessThan(a.responsibilityAnalysis[0].availableMinutes);
    expect(b.responsibilityAnalysis[0].availableMinutes).toBe(180);
  });

  it('invalid override is rejected loudly (never silently)', () => {
    const base = ctx(TUE_6PM, [resp({ title: 'A' })]);
    expect(() => analyzeDecisionContext(base, { nowIso: 'eventually' })).toThrow();
    expect(() => analyzeDecisionContext(base, { timezone: 'Mars/Olympus' })).toThrow();
  });

  it('effort ranges use the conservative upper bound', () => {
    const a = analyzeDecisionContext(ctx(TUE_6PM, [
      resp({
        title: 'Assignment', deadline: exactDeadline('2026-10-07T06:00:00.000Z'),
        effort: { minutes: 240, maxMinutes: 360, confidence: 'stated', state: 'known', note: '4–6 hours' },
      }),
    ], [sleepNeed(TUE_6PM, 'tomorrow', 12, 'am', 6, 'am')]));
    const r = a.responsibilityAnalysis[0];
    expect(r.requiredMinutes).toBe(360);
    expect(r.feasibility).toBe('TIGHT');
  });
});
