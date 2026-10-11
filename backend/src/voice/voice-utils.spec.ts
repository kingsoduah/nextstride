import { describe, expect, it } from 'vitest';
import {
  accumulateTranscript,
  buildSpokenRecommendation,
  combineDraft,
} from '../../../frontend/lib/voice-utils';

describe('accumulateTranscript — no duplicated words', () => {
  it('appends only unseen final segments', () => {
    let s = accumulateTranscript('', new Set(), [
      { index: 0, text: 'hello', isFinal: false },
    ]);
    expect(s.finalized).toBe('');
    expect(s.interim).toBe('hello');

    // Same interim re-sent plus a final: final appended once.
    s = accumulateTranscript(s.finalized, s.seenFinalIndices, [
      { index: 0, text: 'hello world', isFinal: true },
      { index: 1, text: 'how are', isFinal: false },
    ]);
    expect(s.finalized).toBe('hello world');
    expect(s.interim).toBe('how are');

    // Re-sent final (overlap) is not duplicated.
    s = accumulateTranscript(s.finalized, s.seenFinalIndices, [
      { index: 0, text: 'hello world', isFinal: true },
      { index: 1, text: 'how are you', isFinal: true },
    ]);
    expect(s.finalized).toBe('hello world how are you');
    expect(s.interim).toBe('');
  });

  it('skips empty segments', () => {
    const s = accumulateTranscript('done', new Set([0]), [
      { index: 1, text: '   ', isFinal: true },
      { index: 2, text: '', isFinal: false },
    ]);
    expect(s.finalized).toBe('done');
    expect(s.interim).toBe('');
  });

  it('recomputes interim from scratch (never appends provisional text)', () => {
    const a = accumulateTranscript('', new Set(), [{ index: 0, text: 'one', isFinal: false }]);
    const b = accumulateTranscript(a.finalized, a.seenFinalIndices, [{ index: 0, text: 'one two', isFinal: false }]);
    expect(b.interim).toBe('one two');
    expect(b.finalized).toBe('');
  });
});

describe('combineDraft — existing typed text is preserved', () => {
  it('returns dictated text when draft is empty', () => {
    expect(combineDraft('', 'hello world')).toBe('hello world');
  });

  it('appends with a space when draft lacks trailing whitespace', () => {
    expect(combineDraft('typed words', 'dictated words')).toBe('typed words dictated words');
  });

  it('respects existing trailing whitespace', () => {
    expect(combineDraft('typed words ', 'dictated')).toBe('typed words dictated');
    expect(combineDraft('line one\n', 'line two')).toBe('line one\nline two');
  });

  it('returns existing draft when dictated text is empty', () => {
    expect(combineDraft('keep me', '   ')).toBe('keep me');
    expect(combineDraft('keep me', '')).toBe('keep me');
  });
});

describe('buildSpokenRecommendation — current recommendation only', () => {
  const payload = {
    nextMove: 'Start the assignment now',
    why: 'The deadline is tomorrow at 7 AM.',
    plan: ['Work 6 PM to 9 PM', 'Review at 9 PM'],
    risk: 'Buffer is thin.',
    reassessmentTrigger: 'Reassess after the first work block.',
    unknowns: [{ field: 'Effort estimate', whyItMatters: 'Needed for planning.', blocking: true }],
  };

  it('prioritizes next move, reasoning, plan steps, and the blocking question', () => {
    const spoken = buildSpokenRecommendation('Recommended next step', payload);
    expect(spoken).toContain('Recommended next step');
    expect(spoken).toContain('Start the assignment now');
    expect(spoken).toContain('Why: The deadline is tomorrow at 7 AM.');
    expect(spoken).toContain('step 1: Work 6 PM to 9 PM');
    expect(spoken).toContain('Question needing your answer: Effort estimate.');
  });

  it('falls back to risk when no unknowns remain', () => {
    const spoken = buildSpokenRecommendation('Recommended next step', { ...payload, unknowns: [] });
    expect(spoken).toContain('Main risk: Buffer is thin.');
    expect(spoken).not.toContain('Question needing your answer');
  });

  it('never returns empty text for a valid payload', () => {
    expect(buildSpokenRecommendation('Updated recommendation', payload).trim().length).toBeGreaterThan(0);
  });
});
