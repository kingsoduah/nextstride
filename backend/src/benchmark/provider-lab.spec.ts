import { describe, expect, it } from 'vitest';
import { FallbackRecommender } from '../recommend/fallback';
import type { DecisionAnalysisV2 } from '../analysis/analysis';
import type { DecisionContextV2 } from '../decision/spec';
import type { RecommendationV2 } from '../recommend/recommendation';
import { fallbackLabEntry, printProviderLabSummary, runProviderLab } from './provider-lab';

describe('provider lab attribution', () => {
  it('tags every result set with explicit provider/model identity', async () => {
    const stubReasoner = async (
      context: DecisionContextV2,
      analysis: DecisionAnalysisV2,
    ): Promise<RecommendationV2> => FallbackRecommender.build(context, analysis);
    const lab = await runProviderLab([
      { provider: 'groq', model: 'openai/gpt-oss-20b', reasoner: stubReasoner },
      fallbackLabEntry(),
    ]);
    expect(lab).toHaveLength(2);
    expect(lab[0].provider).toBe('groq');
    expect(lab[0].model).toBe('openai/gpt-oss-20b');
    expect(lab[1].provider).toBe('deterministic-fallback');
    // Same scenarios, same counts — structure is comparable across providers.
    expect(lab[0].passed + lab[0].failed).toBe(lab[1].passed + lab[1].failed);
    expect(lab[0].passed + lab[0].failed).toBeGreaterThan(0);
  });

  it('counts provider-request failures separately from decision failures', async () => {
    const failing = async (): Promise<RecommendationV2> => {
      throw new Error('transport down');
    };
    const lab = await runProviderLab([{ provider: 'openrouter:x', model: 'x', reasoner: failing }]);
    expect(lab[0].passed).toBe(0);
    expect(lab[0].runnerErrors).toBe(lab[0].failed);
    expect(lab[0].runnerErrors).toBeGreaterThan(0);
  });

  it('prints a comparison summary without throwing', () => {
    expect(() =>
      printProviderLabSummary([
        { provider: 'groq', model: 'm', results: [], passed: 10, failed: 2, runnerErrors: 0 },
        { provider: 'openrouter:m2', model: 'm2', results: [], passed: 9, failed: 3, runnerErrors: 1 },
      ]),
    ).not.toThrow();
  });
});
