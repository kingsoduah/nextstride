import { analyzeDecisionContext } from '../analysis/engine';
import { FallbackRecommender } from '../recommend/fallback';
import type { DecisionContextV2 } from '../decision/spec';
import type { DecisionAnalysisV2 } from '../analysis/analysis';
import type { RecommendationV2 } from '../recommend/recommendation';
import { BENCHMARK_SCENARIOS, buildScenarioContext, REAL_WORLD_REF } from './scenarios';
import { runScenarioAssertions, printBenchmarkSummary, ScenarioResult } from './assertions';

/**
 * Runs a single scenario through the deterministic analysis and fallback recommender.
 * This is the core benchmark that doesn't depend on live Groq.
 */
export function runDeterministicScenario(scenario: typeof BENCHMARK_SCENARIOS[0]): {
  context: DecisionContextV2;
  analysis: DecisionAnalysisV2;
  recommendation: RecommendationV2;
} {
  const context = buildScenarioContext(scenario);
  const analysis = analyzeDecisionContext(context);
  const recommendation = FallbackRecommender.build(context, analysis);
  return { context, analysis, recommendation };
}

/**
 * Runs a scenario with correction flow (initial → corrected).
 * Uses the deterministic pipeline for both states.
 */
export function runCorrectionScenario(
  initialScenario: typeof BENCHMARK_SCENARIOS[0],
  correctedScenario: typeof BENCHMARK_SCENARIOS[0]
): {
  before: { context: DecisionContextV2; analysis: DecisionAnalysisV2; recommendation: RecommendationV2 };
  after: { context: DecisionContextV2; analysis: DecisionAnalysisV2; recommendation: RecommendationV2 };
} {
  const before = runDeterministicScenario(initialScenario);
  const after = runDeterministicScenario(correctedScenario);
  return { before, after };
}

/**
 * Runs all deterministic benchmark scenarios.
 * Returns results for each scenario.
 */
export function runAllDeterministicBenchmarks(): ScenarioResult[] {
  const results: ScenarioResult[] = [];

  for (const scenario of BENCHMARK_SCENARIOS) {
    // Skip correction scenarios (they're run as pairs)
    if (scenario.id.startsWith('RW2') || scenario.id === 'S15') continue;

    const { context, analysis, recommendation } = runDeterministicScenario(scenario);
    const result = runScenarioAssertions(scenario, context, analysis, recommendation);
    results.push(result);
  }

  // Run paired time test S16
  const s16a = BENCHMARK_SCENARIOS.find(s => s.id === 'S16A')!;
  const s16b = BENCHMARK_SCENARIOS.find(s => s.id === 'S16B')!;
  const resultA = runDeterministicScenario(s16a);
  const resultB = runDeterministicScenario(s16b);
  const rA = runScenarioAssertions(s16a, resultA.context, resultA.analysis, resultA.recommendation);
  const rB = runScenarioAssertions(s16b, resultB.context, resultB.analysis, resultB.recommendation);
  results.push(rA, rB);

  // Run real-world correction pair
  const rw1 = BENCHMARK_SCENARIOS.find(s => s.id === 'RW1')!;
  const rw2 = BENCHMARK_SCENARIOS.find(s => s.id === 'RW2')!;
  const rwResult = runCorrectionScenario(rw1, rw2);
  const rw = runScenarioAssertions(
    rw1,
    rwResult.before.context,
    rwResult.before.analysis,
    rwResult.before.recommendation,
    { before: rwResult.before.recommendation, after: rwResult.after.recommendation },
  );
  results.push(rw);

  return results;
}

/**
 * Runs a scenario with the LLM reasoner (requires live Groq).
 * This is for manual/integration testing, not CI.
 */
export async function runLLMScenario(
  scenario: typeof BENCHMARK_SCENARIOS[0],
  reasoner: (context: DecisionContextV2, analysis: DecisionAnalysisV2) => Promise<RecommendationV2>
): Promise<{ context: DecisionContextV2; analysis: DecisionAnalysisV2; recommendation: RecommendationV2 }> {
  const context = buildScenarioContext(scenario);
  const analysis = analyzeDecisionContext(context);
  const recommendation = await reasoner(context, analysis);
  return { context, analysis, recommendation };
}

/**
 * Type for a reasoner function that can be swapped (LLM or fallback).
 */
export type ReasonerFn = (context: DecisionContextV2, analysis: DecisionAnalysisV2) => Promise<RecommendationV2>;

/**
 * Runs a scenario with a given reasoner and assertions.
 */
export async function runScenarioWithReasoner(
  scenario: typeof BENCHMARK_SCENARIOS[0],
  reasoner: ReasonerFn
): Promise<ScenarioResult> {
  const context = buildScenarioContext(scenario);
  const analysis = analyzeDecisionContext(context);
  const recommendation = await reasoner(context, analysis);
  return runScenarioAssertions(scenario, context, analysis, recommendation);
}

/**
 * Run all scenarios with a reasoner (for integration testing).
 */
export async function runAllWithReasoner(
  reasoner: ReasonerFn,
  filter?: (s: typeof BENCHMARK_SCENARIOS[0]) => boolean
): Promise<ScenarioResult[]> {
  const scenarios = filter ? BENCHMARK_SCENARIOS.filter(filter) : BENCHMARK_SCENARIOS;
  const results: ScenarioResult[] = [];

  for (const scenario of scenarios) {
    try {
      const result = await runScenarioWithReasoner(scenario, reasoner);
      results.push(result);
    } catch (err) {
      results.push({
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        passed: false,
        errors: [`Runner error: ${err instanceof Error ? err.message : String(err)}`],
        warnings: [],
        details: {},
      });
    }
  }

  return results;
}

/**
 * CLI entry point for running benchmarks.
 * Usage: npx tsx backend/src/benchmark/runner.ts
 */
if (require.main === module) {
  console.log('Running deterministic benchmarks...\n');
  const results = runAllDeterministicBenchmarks();
  printBenchmarkSummary(results);

  const failed = results.filter(r => !r.passed).length;
  process.exit(failed > 0 ? 1 : 0);
}