import { describe, expect, it } from 'vitest';
import type { DecisionAnalysisV2, ResponsibilityAnalysis } from '../analysis/analysis';
import type { DecisionContextV2, ResponsibilityV2 } from '../decision/spec';
import { FallbackRecommender } from './fallback';

const REF = { nowIso: '2026-10-06T17:00:00.000Z', timezone: 'Africa/Lagos' };

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

function entry(o: Partial<ResponsibilityAnalysis> & { title: string }): ResponsibilityAnalysis {
  return {
    index: 0,
    consequenceKnown: false,
    deadlineKind: 'instant',
    deadlineEndIso: '2026-10-07T06:00:00.000Z',
    effortMinutes: 360,
    requiredMinutes: 360,
    delegationApplied: false,
    availableMinutes: 420,
    availableWindows: [{ startIso: '2026-10-06T17:00:00.000Z', endIso: '2026-10-06T23:00:00.000Z', minutes: 360 }],
    bufferMinutes: 60,
    shortfallMinutes: null,
    feasibility: 'TIGHT',
    unknowns: [],
    ...o,
  };
}

function context(responsibilities: ResponsibilityV2[]): DecisionContextV2 {
  return { reference: REF, rawText: 't', responsibilities, constraints: [], humanNeeds: [], unknowns: [] };
}

function analysis(entries: ResponsibilityAnalysis[], over: Partial<DecisionAnalysisV2> = {}): DecisionAnalysisV2 {
  return {
    reference: REF,
    timezone: 'Africa/Lagos',
    responsibilityAnalysis: entries,
    availableWindows: [],
    blockedWindows: [],
    dependencies: [],
    conflicts: [],
    totalRequiredMinutes: null,
    totalAvailableMinutes: 0,
    bufferMinutes: null,
    shortfallMinutes: null,
    unknowns: [],
    blockingUnknowns: [],
    analysisStatus: 'complete',
    ...over,
  };
}

describe('FallbackRecommender', () => {
  it('feasible case: concrete RECOMMEND naming the work and its window', () => {
    const ctx = context([resp({ title: 'Assignment' })]);
    const a = analysis([entry({ title: 'Assignment' })]);
    const rec = FallbackRecommender.build(ctx, a);
    expect(rec.status).toBe('RECOMMEND');
    expect(rec.nextMove).toContain('Assignment');
    expect(rec.nextMove).not.toContain('priorities');
    expect(rec.plan.length).toBeGreaterThan(0);
    expect(rec.plan[0]).toContain('6:00 PM');
    expect(rec.whatCanWait).toEqual([]);
    expect(rec.assumptions).toEqual([]);
  });

  it('tight case: acknowledges limited buffer in risk', () => {
    const ctx = context([resp({ title: 'Assignment' })]);
    const a = analysis([entry({ title: 'Assignment', feasibility: 'TIGHT', bufferMinutes: 20 })]);
    const rec = FallbackRecommender.build(ctx, a);
    expect(rec.status).toBe('RECOMMEND');
    expect(rec.risk).toMatch(/tight|buffer/i);
  });

  it('infeasible case: states shortfall, never pretends it fits', () => {
    const ctx = context([resp({ title: 'Assignment', flexibility: 'flexible' })]);
    const a = analysis([entry({ title: 'Assignment', feasibility: 'INFEASIBLE', availableMinutes: 300, bufferMinutes: null, shortfallMinutes: 60 })]);
    const rec = FallbackRecommender.build(ctx, a);
    expect(rec.status).toBe('INFEASIBLE');
    expect(rec.nextMove).toContain('60');
    expect(rec.options.some((o) => o.includes('Reduce the scope'))).toBe(true);
    expect(rec.options.some((o) => o.includes('Negotiate the deadline'))).toBe(true);
    expect(rec.options.some((o) => /ask someone|delegate/i.test(o))).toBe(false);
  });

  it('infeasible + fixed deadline: no negotiation option offered', () => {
    const ctx = context([resp({ title: 'Exam', flexibility: 'fixed' })]);
    const a = analysis([entry({ title: 'Exam', feasibility: 'INFEASIBLE', availableMinutes: 100, shortfallMinutes: 200 })]);
    const rec = FallbackRecommender.build(ctx, a);
    expect(rec.options.some((o) => o.includes('Negotiate'))).toBe(false);
    expect(rec.options.some((o) => o.includes('Reduce the scope'))).toBe(true);
  });

  it('agreed delegation unlocks a help option; otherwise never suggested', () => {
    const agreedCtx = context([
      resp({ title: 'Slides', delegation: { possible: true, agreed: true, savesMinutes: 60, state: 'known' } }),
    ]);
    const a = analysis([entry({ title: 'Slides', feasibility: 'INFEASIBLE', availableMinutes: 100, shortfallMinutes: 60 })]);
    const rec = FallbackRecommender.build(agreedCtx, a);
    expect(rec.options.some((o) => o.includes('agreed help'))).toBe(true);
  });

  it('blocking unknowns: NEEDS_INPUT naming the question, no invented plan', () => {
    const ctx = context([resp({ title: 'Assignment' })]);
    const blocking = [{ field: 'Assignment: exact time', whyItMatters: 'AM/PM ambiguity changes the whole plan.', blocking: true }];
    const a = analysis([entry({ title: 'Assignment', feasibility: 'CANNOT_DETERMINE', requiredMinutes: null, availableMinutes: 0 })], {
      unknowns: blocking,
      blockingUnknowns: blocking,
      analysisStatus: 'blocked',
    });
    const rec = FallbackRecommender.build(ctx, a);
    expect(rec.status).toBe('NEEDS_INPUT');
    expect(rec.nextMove).toContain('Assignment: exact time');
    expect(rec.plan).toEqual([]);
  });

  it('unknown deadline: no date invented anywhere in the output', () => {
    const ctx = context([resp({ title: 'Fellowship task' })]);
    const blocking = [{ field: 'Fellowship task: usable deadline', whyItMatters: 'No deadline.', blocking: true }];
    const a = analysis([entry({ title: 'Fellowship task', deadlineKind: 'unresolved', deadlineEndIso: null, feasibility: 'CANNOT_DETERMINE', requiredMinutes: null, availableMinutes: 0 })], {
      unknowns: blocking,
      blockingUnknowns: blocking,
    });
    const rec = FallbackRecommender.build(ctx, a);
    expect(rec.status).toBe('NEEDS_INPUT');
    expect(JSON.stringify(rec)).not.toMatch(/\d{1,2}:\d{2}\s?(AM|PM)/);
  });

  it('dependency order: unmet prerequisite recommended before its dependent', () => {
    const ctx = context([
      resp({ title: 'Write report', dependsOn: ['Collect data'], status: 'not-started' }),
      resp({ title: 'Collect data', status: 'not-started' }),
    ]);
    const a = analysis([
      entry({ index: 0, title: 'Write report', deadlineEndIso: '2026-10-07T06:00:00.000Z', feasibility: 'FEASIBLE', bufferMinutes: 200 }),
      entry({ index: 1, title: 'Collect data', deadlineEndIso: '2026-10-08T06:00:00.000Z', feasibility: 'FEASIBLE', bufferMinutes: 400 }),
    ]);
    const rec = FallbackRecommender.build(ctx, a);
    expect(rec.nextMove).toContain('Collect data');
    expect(rec.whatCanWait).toContain('Write report');
  });

  it('all titles accounted across recommendation and whatCanWait', () => {
    const ctx = context([resp({ title: 'A' }), resp({ title: 'B' }), resp({ title: 'C' })]);
    const mk = (t: string, end: string) => entry({ title: t, deadlineEndIso: end, feasibility: 'FEASIBLE', bufferMinutes: 200 });
    const a = analysis([
      mk('A', '2026-10-07T06:00:00.000Z'),
      mk('B', '2026-10-08T06:00:00.000Z'),
      mk('C', '2026-10-09T06:00:00.000Z'),
    ]);
    const rec = FallbackRecommender.build(ctx, a);
    expect(rec.nextMove).toContain('A');
    expect(rec.whatCanWait).toEqual(['B', 'C']);
  });

  it('empty analysis: NEEDS_INPUT without inventing work', () => {
    const a = analysis([], { analysisStatus: 'blocked' });
    const rec = FallbackRecommender.build(context([]), a);
    expect(rec.status).toBe('NEEDS_INPUT');
    expect(rec.plan).toEqual([]);
  });

  it('available window ends at a fixed commitment: clarifies the window end and actual deadline', () => {
    // Simulate: now=8:00 AM, deadline=4:00 PM, but a fixed meeting blocks 12:00-2:00 PM
    // Available window is 8:00 AM-12:00 PM (4h), deadline is 4:00 PM
    const REF_FIXED = { nowIso: '2026-10-06T07:00:00.000Z', timezone: 'Africa/Lagos' }; // 8:00 AM Lagos
    function fixedResp(title: string): ResponsibilityV2 {
      return resp({ title, deadline: { expression: { kind: 'exact' as const, instantIso: '2026-10-06T15:00:00.000Z' }, precision: 'exact' as const, state: 'known' as const } });
    }
    function fixedEntry(title: string): ResponsibilityAnalysis {
      return entry({
        title,
        deadlineEndIso: '2026-10-06T15:00:00.000Z',
        availableMinutes: 240,
        availableWindows: [{ startIso: '2026-10-06T07:00:00.000Z', endIso: '2026-10-06T11:00:00.000Z', minutes: 240 }],
        feasibility: 'FEASIBLE',
        bufferMinutes: 60,
      });
    }
    function fixedContext(): DecisionContextV2 {
      return { reference: REF_FIXED, rawText: 't', responsibilities: [fixedResp('Report')], constraints: [], humanNeeds: [], unknowns: [] };
    }
    function fixedAnalysis(): DecisionAnalysisV2 {
      return analysis([fixedEntry('Report')], {
        reference: REF_FIXED,
        blockedWindows: [{ startIso: '2026-10-06T11:00:00.000Z', endIso: '2026-10-06T13:00:00.000Z', minutes: 120, reason: 'Fixed meeting (fixed commitment)', source: 'fixed-commitment' }],
      });
    }
    const rec = FallbackRecommender.build(fixedContext(), fixedAnalysis());
    expect(rec.status).toBe('RECOMMEND');
    expect(rec.nextMove).toContain('Report');
    // Should mention the window end and the actual deadline
    expect(rec.nextMove).toMatch(/ends at|fixed commitment/);
    expect(rec.nextMove).toContain('12:00 PM'); // deadline at 4 PM Lagos = 15:00Z = 12 PM EDT... wait
    // The test reference is in UTC, timezone is Africa/Lagos (UTC+1)
    // deadlineEndIso is 15:00Z = 16:00 Lagos = 4 PM Lagos
    // window ends at 11:00Z = 12:00 Lagos
    expect(rec.why).toMatch(/ends at|fixed commitment/);
    expect(rec.why).toContain('4:00 PM'); // deadline in Lagos time
  });

  it('available window spans overnight: wording is clear about the span', () => {
    // now=10 PM, deadline=next day 6 PM, meeting at 4-6 PM blocks end
    // window is 10 PM to 4 PM next day (overnight)
    const REF_OVERNIGHT = { nowIso: '2026-10-06T21:00:00.000Z', timezone: 'Africa/Lagos' }; // 10 PM Lagos
    function overnightResp(title: string): ResponsibilityV2 {
      return resp({ title, deadline: { expression: { kind: 'exact' as const, instantIso: '2026-10-07T17:00:00.000Z' }, precision: 'exact' as const, state: 'known' as const } });
    }
    function overnightEntry(title: string): ResponsibilityAnalysis {
      return entry({
        title,
        deadlineEndIso: '2026-10-07T17:00:00.000Z',
        availableMinutes: 1020,
        availableWindows: [{ startIso: '2026-10-06T21:00:00.000Z', endIso: '2026-10-07T15:00:00.000Z', minutes: 1020 }],
        feasibility: 'FEASIBLE',
        bufferMinutes: 780,
      });
    }
    function overnightContext(): DecisionContextV2 {
      return { reference: REF_OVERNIGHT, rawText: 't', responsibilities: [overnightResp('Feature')], constraints: [], humanNeeds: [], unknowns: [] };
    }
    function overnightAnalysis(): DecisionAnalysisV2 {
      return analysis([overnightEntry('Feature')], {
        reference: REF_OVERNIGHT,
        blockedWindows: [{ startIso: '2026-10-07T15:00:00.000Z', endIso: '2026-10-07T17:00:00.000Z', minutes: 120, reason: 'Fellowship meeting (fixed commitment)', source: 'fixed-commitment' }],
      });
    }
    const rec = FallbackRecommender.build(overnightContext(), overnightAnalysis());
    expect(rec.status).toBe('RECOMMEND');
    expect(rec.nextMove).toContain('Feature');
    // Should mention the overnight window ends at the fixed commitment and the deadline is later
    expect(rec.nextMove).toMatch(/ends at|fixed commitment|Fellowship meeting/);
    expect(rec.why).toMatch(/ends at|fixed commitment|Fellowship meeting/);
  });
});
