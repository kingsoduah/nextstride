import { describe, expect, it } from 'vitest';
import type { DecisionAnalysisV2 } from '../analysis/analysis';
import type { DecisionContextV2 } from '../decision/spec';
import { buildReasoningPrompt, REASONING_SYSTEM_PROMPT } from './reasoning-prompts';
import type { ReasoningInput } from './reasoning-prompts';

const context = {
  reference: { nowIso: '2026-10-06T17:00:00.000Z', timezone: 'Africa/Lagos' },
  rawText: 'assignment due tomorrow',
  responsibilities: [
    {
      title: 'Assignment',
      description: '',
      category: 'academic',
      deadline: null,
      effort: { minutes: 360, maxMinutes: null, confidence: 'stated', state: 'known', note: '' },
      consequence: '',
      consequenceKnown: false,
      flexibility: 'unknown',
      delegation: null,
      dependsOn: [],
      status: 'not-started',
    },
  ],
  constraints: [{ description: 'Must attend lecture', strength: 'hard', state: 'known' }],
  humanNeeds: [],
  unknowns: [],
} as unknown as DecisionContextV2;

const analysis = {
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
      availableWindows: [{ startIso: '2026-10-06T17:00:00.000Z', endIso: '2026-10-06T23:00:00.000Z', minutes: 360 }],
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
} as unknown as DecisionAnalysisV2;

describe('reasoning prompt', () => {
  it('system prompt forbids recalculation and names the layers', () => {
    expect(REASONING_SYSTEM_PROMPT).toMatch(/Do not recalculate/i);
    expect(REASONING_SYSTEM_PROMPT).toMatch(/FACTS/);
    expect(REASONING_SYSTEM_PROMPT).toMatch(/INTERPRETATION/);
    expect(REASONING_SYSTEM_PROMPT).toMatch(/RECOMMENDATION/);
  });

  it('embeds authoritative numbers verbatim (no recomputation)', () => {
    const prompt = buildReasoningPrompt({ situationText: 's', context, analysis });
    expect(prompt).toContain('"requiredMinutes":360');
    expect(prompt).toContain('"availableMinutes":420');
    expect(prompt).toContain('"bufferMinutes":60');
    expect(prompt).toContain('"feasibility":"TIGHT"');
    expect(prompt).toContain('Must attend lecture');
    expect(prompt).toContain('READ FIRST');
    // Note: verdicts sit inside serialized JSON, so inner quotes are backslash-escaped.
    expect(prompt).toContain('needs 360m, has 420m, only 60m left over');
  });

  it('omits reassessment sections for a first recommendation', () => {
    const input: ReasoningInput = { situationText: 's', context, analysis };
    const prompt = buildReasoningPrompt(input);
    expect(prompt).not.toContain('REASSESSMENT');
  });

  it('includes previous recommendation, analysis and deterministic diff when reassessing', () => {
    const prompt = buildReasoningPrompt({
      situationText: 's',
      context,
      analysis,
      previous: {
        recommendation: { nextMove: 'Old move', status: 'RECOMMEND' },
        analysis,
        diffSummary: { materialChange: true, changes: ['"Assignment" available time changed by -120 minutes (now 300).'] },
      },
    });
    expect(prompt).toContain('REASSESSMENT');
    expect(prompt).toContain('Old move');
    expect(prompt).toContain('-120 minutes');
  });
});
