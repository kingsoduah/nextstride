import { FallbackRecommender } from '../recommend/fallback';
import type { RecommendationV2 } from '../recommend/recommendation';
import type { DecisionAnalysisV2 } from '../analysis/analysis';
import type { DecisionContextV2 } from '../decision/spec';
import { BENCHMARK_SCENARIOS } from './scenarios';
import {
  runAllWithReasoner,
  type ReasonerFn,
} from './runner';
import type { ScenarioResult } from './assertions';

/**
 * Phase 8.5 Model Lab: fair cross-provider comparison over the same
 * deterministic scenarios and assertions. Provider/model identity is
 * explicit on every result set.
 */

export interface LabEntry {
  /** Attribution label, e.g. 'groq' or 'openrouter:nvidia/nemotron-3-super-120b-a12b:free'. */
  provider: string;
  model: string;
  reasoner: ReasonerFn;
}

export interface ProviderLabResult {
  provider: string;
  model: string;
  results: ScenarioResult[];
  passed: number;
  failed: number;
  /** Provider-request failures (transport), distinct from decision-quality failures. */
  runnerErrors: number;
}

/**
 * Run the full scenario suite once per provider entry. Deterministic
 * analysis is identical for every entry — only the reasoner varies —
 * so differences measure reasoning quality, not clock math.
 */
export async function runProviderLab(entries: LabEntry[]): Promise<ProviderLabResult[]> {
  const out: ProviderLabResult[] = [];
  for (const entry of entries) {
    const results = await runAllWithReasoner(entry.reasoner);
    const passed = results.filter((r) => r.passed).length;
    out.push({
      provider: entry.provider,
      model: entry.model,
      results,
      passed,
      failed: results.length - passed,
      runnerErrors: results.filter((r) => r.errors.some((e) => e.startsWith('Runner error:'))).length,
    });
  }
  return out;
}

/** Deterministic fallback as a lab baseline (no provider calls at all). */
export function fallbackLabEntry(): LabEntry {
  return {
    provider: 'deterministic-fallback',
    model: '',
    reasoner: async (context: DecisionContextV2, analysis: DecisionAnalysisV2): Promise<RecommendationV2> =>
      FallbackRecommender.build(context, analysis),
  };
}

export function printProviderLabSummary(lab: ProviderLabResult[]): void {
  console.log('\n========== MODEL LAB COMPARISON ==========');
  for (const r of lab) {
    const total = r.passed + r.failed;
    console.log(
      `${r.provider}${r.model ? ` (${r.model})` : ''}: ${r.passed}/${total} passed, ` +
        `${r.failed} failed (${r.runnerErrors} provider-request errors)`,
    );
  }
  console.log('==========================================\n');
}

/**
 * Opt-in live comparison. Runs ONLY when NEXTSTRIDE_LIVE_BENCHMARK=1 and the
 * requested provider keys are present. Never runs in CI. Uses fictional
 * benchmark data only. Each entry is attempted independently; one provider's
 * outage never blocks the others.
 */
export async function runLiveProviderLab(options?: {
  scenarioIds?: string[];
  maxScenarios?: number;
}): Promise<ProviderLabResult[] | null> {
  if (process.env.NEXTSTRIDE_LIVE_BENCHMARK !== '1') {
    console.log('Live provider lab disabled (set NEXTSTRIDE_LIVE_BENCHMARK=1 to enable).');
    return null;
  }
  const { LlmReasoner } = await import('../recommend/recommendation.service');
  let scenarios = BENCHMARK_SCENARIOS.filter((s) => !s.id.startsWith('RW2') && s.id !== 'S15');
  if (options?.scenarioIds) scenarios = scenarios.filter((s) => options.scenarioIds!.includes(s.id));
  if (options?.maxScenarios != null) scenarios = scenarios.slice(0, options.maxScenarios);

  const entries: LabEntry[] = [];
  const groqKey = process.env.GROQ_API_KEY;
  const orKey = process.env.OPENROUTER_API_KEY;
  const { OPENROUTER_FREE_MODELS } = await import('../ai/openrouter.provider');

  const mkReasoner = (provider?: string, model?: string): ReasonerFn => {
    const reasoner = new LlmReasoner(provider, model);
    return async (context, analysis) => {
      const raw = await reasoner.reason({ situationText: context.rawText, context, analysis });
      const { RecommendationV2Schema } = await import('../recommend/recommendation');
      const parsed = RecommendationV2Schema.safeParse(raw);
      if (!parsed.success) throw new Error(`Invalid recommendation shape: ${parsed.error.message}`);
      return parsed.data;
    };
  };

  if (groqKey) entries.push({ provider: 'groq', model: process.env.GROQ_MODEL ?? 'openai/gpt-oss-120b', reasoner: mkReasoner() });
  if (orKey) {
    for (const m of OPENROUTER_FREE_MODELS) {
      entries.push({ provider: `openrouter:${m}`, model: m, reasoner: mkReasoner('openrouter', m) });
    }
  }
  if (entries.length === 0) {
    console.log('Live provider lab: no provider keys configured.');
    return null;
  }
  console.log(`Live provider lab: ${entries.length} provider(s), ${scenarios.length} scenario(s).`);
  const { runScenarioWithReasoner } = await import('./runner');
  const out: ProviderLabResult[] = [];
  for (const entry of entries) {
    const results: ScenarioResult[] = [];
    for (const s of scenarios) {
      try {
        results.push(await runScenarioWithReasoner(s, entry.reasoner));
      } catch (err) {
        results.push({
          scenarioId: s.id,
          scenarioName: s.name,
          passed: false,
          errors: [`Runner error: ${err instanceof Error ? err.message : String(err)}`],
          warnings: [],
          details: {},
        });
      }
    }
    const passed = results.filter((r) => r.passed).length;
    out.push({
      provider: entry.provider,
      model: entry.model,
      results,
      passed,
      failed: results.length - passed,
      runnerErrors: results.filter((r) => r.errors.some((e) => e.startsWith('Runner error:'))).length,
    });
  }
  printProviderLabSummary(out);
  return out;
}
