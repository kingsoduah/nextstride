import type { DecisionAnalysisV2 } from '../analysis/analysis';

/**
 * Phase 4: deterministic diff between two analyses.
 * Reassessment reasoning must use these computed changes — the model
 * must never fabricate its own numerical deltas.
 */

export interface AnalysisDiff {
  materialChange: boolean;
  changes: string[];
}

function pctChange(oldV: number, newV: number): number {
  if (oldV === 0) return newV === 0 ? 0 : 100;
  return Math.abs((newV - oldV) / oldV) * 100;
}

export function diffAnalyses(prev: DecisionAnalysisV2, curr: DecisionAnalysisV2): AnalysisDiff {
  const changes: string[] = [];
  let materialChange = false;

  const prevByTitle = new Map(prev.responsibilityAnalysis.map((r) => [r.title, r]));
  for (const r of curr.responsibilityAnalysis) {
    const p = prevByTitle.get(r.title);
    if (!p) {
      changes.push(`New responsibility under analysis: "${r.title}" (${r.feasibility}).`);
      materialChange = true;
      continue;
    }
    if (p.feasibility !== r.feasibility) {
      changes.push(`"${r.title}" feasibility changed: ${p.feasibility} → ${r.feasibility}.`);
      materialChange = true;
    }
    if (p.requiredMinutes != null && r.requiredMinutes != null && p.requiredMinutes !== r.requiredMinutes) {
      changes.push(`"${r.title}" required effort changed: ${p.requiredMinutes} → ${r.requiredMinutes} minutes.`);
      if (pctChange(p.requiredMinutes, r.requiredMinutes) > 10) materialChange = true;
    }
    if (p.availableMinutes !== r.availableMinutes) {
      const delta = r.availableMinutes - p.availableMinutes;
      changes.push(`"${r.title}" available time changed by ${delta >= 0 ? '+' : ''}${delta} minutes (now ${r.availableMinutes}).`);
      if (Math.abs(delta) > 0 && (p.availableMinutes === 0 || pctChange(p.availableMinutes, r.availableMinutes) > 10)) {
        materialChange = true;
      }
    }
  }
  for (const r of prev.responsibilityAnalysis) {
    if (!curr.responsibilityAnalysis.some((c) => c.title === r.title)) {
      changes.push(`"${r.title}" is no longer under analysis.`);
      materialChange = true;
    }
  }

  const prevBlocking = new Set(prev.blockingUnknowns.map((u) => u.field));
  for (const u of curr.blockingUnknowns) {
    if (!prevBlocking.has(u.field)) {
      changes.push(`New blocking unknown: "${u.field}" — ${u.whyItMatters}`);
      materialChange = true;
    }
  }

  const prevConflicts = new Set(prev.conflicts.map((c) => `${c.type}:${c.description}`));
  for (const c of curr.conflicts) {
    if (!prevConflicts.has(`${c.type}:${c.description}`)) {
      changes.push(`New ${c.type} conflict: ${c.description}`);
      materialChange = true;
    }
  }

  if (prev.analysisStatus !== curr.analysisStatus) {
    changes.push(`Overall analysis status changed: ${prev.analysisStatus} → ${curr.analysisStatus}.`);
    materialChange = true;
  }

  if (changes.length === 0) {
    changes.push('No material change since the previous analysis.');
  }
  return { materialChange, changes };
}
