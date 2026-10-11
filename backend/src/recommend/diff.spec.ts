import { describe, expect, it } from 'vitest';
import type { DecisionAnalysisV2 } from '../analysis/analysis';
import { diffAnalyses } from './diff';

function analysis(over: Partial<DecisionAnalysisV2> = {}): DecisionAnalysisV2 {
  return {
    reference: { nowIso: '2026-10-06T17:00:00.000Z', timezone: 'Africa/Lagos' },
    timezone: 'Africa/Lagos',
    responsibilityAnalysis: [
      {
        index: 0,
        title: 'Assignment',
        consequenceKnown: false,
        deadlineKind: 'instant',
        deadlineEndIso: '2026-10-07T06:00:00.000Z',
        effortMinutes: 360,
        requiredMinutes: 360,
        delegationApplied: false,
        availableMinutes: 420,
        availableWindows: [],
        bufferMinutes: 60,
        shortfallMinutes: null,
        feasibility: 'TIGHT',
        unknowns: [],
      },
    ],
    availableWindows: [],
    blockedWindows: [],
    dependencies: [],
    conflicts: [],
    totalRequiredMinutes: 360,
    totalAvailableMinutes: 420,
    bufferMinutes: 60,
    shortfallMinutes: null,
    unknowns: [],
    blockingUnknowns: [],
    analysisStatus: 'complete',
    ...over,
  } as DecisionAnalysisV2;
}

describe('diffAnalyses', () => {
  it('reports no material change for identical analyses', () => {
    const a = analysis();
    const diff = diffAnalyses(a, analysis());
    expect(diff.materialChange).toBe(false);
    expect(diff.changes).toEqual(['No material change since the previous analysis.']);
  });

  it('detects feasibility changes with numbers', () => {
    const prev = analysis();
    const curr = analysis({
      responsibilityAnalysis: [{ ...prev.responsibilityAnalysis[0], feasibility: 'INFEASIBLE', availableMinutes: 300, bufferMinutes: null, shortfallMinutes: 60 }],
    });
    const diff = diffAnalyses(prev, curr);
    expect(diff.materialChange).toBe(true);
    expect(diff.changes.some((c) => c.includes('TIGHT → INFEASIBLE'))).toBe(true);
    expect(diff.changes.some((c) => c.includes('-120 minutes'))).toBe(true);
  });

  it('detects new blocking unknowns and new conflicts', () => {
    const prev = analysis();
    const curr = analysis({
      blockingUnknowns: [{ field: 'Fellowship: deadline', whyItMatters: 'Cannot order work.', blocking: true }],
      unknowns: [{ field: 'Fellowship: deadline', whyItMatters: 'Cannot order work.', blocking: true }],
      conflicts: [{ type: 'deadline', description: 'Fellowship cannot fit.', involves: ['Fellowship'], minutes: 45 }],
    });
    const diff = diffAnalyses(prev, curr);
    expect(diff.materialChange).toBe(true);
    expect(diff.changes.some((c) => c.includes('New blocking unknown'))).toBe(true);
    expect(diff.changes.some((c) => c.includes('New deadline conflict'))).toBe(true);
  });

  it('detects added and removed responsibilities', () => {
    const prev = analysis();
    const curr = analysis({
      responsibilityAnalysis: [
        ...prev.responsibilityAnalysis,
        { ...prev.responsibilityAnalysis[0], index: 1, title: 'Fellowship task', feasibility: 'FEASIBLE' },
      ],
    });
    const diff = diffAnalyses(prev, curr);
    expect(diff.materialChange).toBe(true);
    expect(diff.changes.some((c) => c.includes('New responsibility under analysis: "Fellowship task"'))).toBe(true);

    const removed = diffAnalyses(curr, prev);
    expect(removed.materialChange).toBe(true);
    expect(removed.changes.some((c) => c.includes('no longer under analysis'))).toBe(true);
  });

  it('detects overall status changes', () => {
    const diff = diffAnalyses(analysis(), analysis({ analysisStatus: 'partial' }));
    expect(diff.materialChange).toBe(true);
    expect(diff.changes.some((c) => c.includes('complete → partial'))).toBe(true);
  });

  it('ignores tiny available-time jitter (≤10%)', () => {
    const prev = analysis();
    const curr = analysis({
      responsibilityAnalysis: [{ ...prev.responsibilityAnalysis[0], availableMinutes: 400 }],
    });
    const diff = diffAnalyses(prev, curr);
    expect(diff.materialChange).toBe(false);
    expect(diff.changes.some((c) => c.includes('-20 minutes'))).toBe(true);
  });
});
