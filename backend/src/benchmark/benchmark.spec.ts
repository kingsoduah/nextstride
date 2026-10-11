import { describe, expect, it } from 'vitest';
import { runAllDeterministicBenchmarks, runDeterministicScenario, runCorrectionScenario } from './runner';
import { BENCHMARK_SCENARIOS } from './scenarios';
import { runScenarioAssertions } from './assertions';

describe('Decision-Quality Benchmark Suite (Deterministic)', () => {
  const results = runAllDeterministicBenchmarks();

  it('should pass all benchmark scenarios', () => {
    const failed = results.filter(r => !r.passed);
    if (failed.length > 0) {
      console.log('\n========== FAILED SCENARIOS ==========');
      for (const f of failed) {
        console.log(`\n❌ ${f.scenarioId}: ${f.scenarioName}`);
        for (const e of f.errors) {
          console.log(`   - ${e}`);
        }
        if (f.details.analysis) {
          console.log(`   Analysis statuses:`);
          for (const a of f.details.analysis.responsibilityAnalysis) {
            console.log(`     ${a.title}: ${a.feasibility} (avail=${a.availableMinutes}, buf=${a.bufferMinutes}, shortfall=${a.shortfallMinutes})`);
          }
        }
        if (f.details.recommendation) {
          console.log(`   Recommendation: ${f.details.recommendation.status}`);
          console.log(`     nextMove: ${f.details.recommendation.nextMove}`);
          console.log(`     why: ${f.details.recommendation.why}`);
        }
      }
    }
    expect(failed.length).toBe(0);
  });

  // Individual scenario tests for better debugging
  for (const scenario of BENCHMARK_SCENARIOS) {
    if (scenario.id.startsWith('RW2') || scenario.id === 'S15') continue;

    it(`deterministic: ${scenario.id} - ${scenario.name}`, () => {
      const { context, analysis, recommendation } = runDeterministicScenario(scenario);
      const result = runScenarioAssertions(scenario, context, analysis, recommendation);
      if (!result.passed) {
        console.log(`\n❌ ${scenario.id}: ${scenario.name}`);
        for (const e of result.errors) console.log(`   - ${e}`);
      }
      expect(result.passed).toBe(true);
    });
  }

  // Paired time test S16
  describe('Paired Time Test (S16)', () => {
    const s16a = BENCHMARK_SCENARIOS.find(s => s.id === 'S16A')!;
    const s16b = BENCHMARK_SCENARIOS.find(s => s.id === 'S16B')!;

    it('S16A (2 PM) should be FEASIBLE with ample buffer', () => {
      const { context, analysis, recommendation } = runDeterministicScenario(s16a);
      const r = analysis.responsibilityAnalysis[0];
      expect(r.feasibility).toBe('FEASIBLE');
      expect(r.availableMinutes).toBeGreaterThan(600);
      expect(r.bufferMinutes).toBeGreaterThan(300);
    });

    it('S16B (11 PM) should be INFEASIBLE with shortfall', () => {
      const { context, analysis, recommendation } = runDeterministicScenario(s16b);
      const r = analysis.responsibilityAnalysis[0];
      expect(r.feasibility).toBe('INFEASIBLE');
      expect(r.shortfallMinutes).toBeGreaterThan(0);
    });

    it('S16A and S16B should have materially different available minutes', () => {
      const a = runDeterministicScenario(s16a).analysis.responsibilityAnalysis[0];
      const b = runDeterministicScenario(s16b).analysis.responsibilityAnalysis[0];
      expect(a.availableMinutes).toBeGreaterThan(b.availableMinutes + 300);
    });
  });

  // Real-world correction flow
  describe('Real-World Regression (Saturday Oct 10)', () => {
    const rw1 = BENCHMARK_SCENARIOS.find(s => s.id === 'RW1')!;
    const rw2 = BENCHMARK_SCENARIOS.find(s => s.id === 'RW2')!;

    it('RW1 initial: extracts client feature, personal project, fellowship meeting, meals, sleep', () => {
      const { context, analysis, recommendation } = runDeterministicScenario(rw1);

      // Check fact extraction
      const titles = context.responsibilities.map(r => r.title);
      expect(titles).toContain('Client backend feature');
      expect(titles).toContain('Personal project');
      expect(titles).toContain('Fellowship meeting');

      const needs = context.humanNeeds.map(n => n.kind);
      expect(needs).toContain('meals');
      expect(needs).toContain('sleep');

      // Fellowship meeting should be fixed flexibility
      const meeting = context.responsibilities.find(r => r.title === 'Fellowship meeting');
      expect(meeting?.flexibility).toBe('fixed');

      // Client feature should have 3h effort
      const feature = context.responsibilities.find(r => r.title === 'Client backend feature');
      expect(feature?.effort?.minutes).toBe(180);
    });

    it('RW1 initial: fellowship meeting blocks 1-2:30 PM, available time computed correctly', () => {
      const { analysis } = runDeterministicScenario(rw1);
      const feature = analysis.responsibilityAnalysis.find(r => r.title === 'Client backend feature');

      // 10:21 AM to 5 PM = ~6.5h = 390 min
      // Minus 1.5h meeting = 300 min available
      // 3h effort = 180 min, so FEASIBLE with 120 min buffer
      expect(feature).toBeDefined();
      expect(feature?.feasibility).toBe('FEASIBLE');
      expect(feature?.availableMinutes).toBeGreaterThanOrEqual(240);
      expect(feature?.bufferMinutes).toBeGreaterThanOrEqual(60);
    });

    it('RW1 initial: must not invent 4 PM deadline', () => {
      const { recommendation } = runDeterministicScenario(rw1);
      const allText = `${recommendation.nextMove} ${recommendation.why} ${recommendation.plan.join(' ')}`.toLowerCase();
      expect(allText).not.toContain('4 pm');
      expect(allText).not.toContain('4:00 pm');
      expect(allText).not.toContain('16:00');
    });

    it('RW1 initial: recommendation respects fixed meeting', () => {
      const { recommendation } = runDeterministicScenario(rw1);
      const allText = `${recommendation.nextMove} ${recommendation.why} ${recommendation.plan.join(' ')}`.toLowerCase();
      expect(allText).not.toContain('skip');
      expect(allText).not.toContain('ignore');
      expect(allText).not.toContain('move');
    });

    it('RW2 after correction: deadline changes to 10 AM next day', () => {
      const { before, after } = runCorrectionScenario(rw1, rw2);

      // Check analysis updated
      const afterFeature = after.analysis.responsibilityAnalysis.find(r => r.title === 'Client backend feature');
      expect(afterFeature?.deadlineEndIso).toBe('2026-10-11T09:00:00.000Z');
      expect(afterFeature?.deadlineKind).toBe('instant');

      // Phone call is now a fixed-event human need, not a responsibility
      const callNeed = after.context.humanNeeds.find(n => n.kind === 'fixed-event' && n.description.includes('phone call'));
      expect(callNeed).toBeDefined();
      expect(callNeed?.window).not.toBeNull();

      // Effort should remain 3 hours
      expect(afterFeature?.effortMinutes).toBe(180);
    });

    it('RW2 after correction: status should be RECOMMEND (fallback), recommendation explains change', () => {
      const { before, after } = runCorrectionScenario(rw1, rw2);
      // Fallback recommender returns RECOMMEND/NEEDS_INPUT/INFEASIBLE; REASSESS is applied by service with guardrails
      expect(after.recommendation.status).toBe('RECOMMEND');
      expect(after.recommendation.nextMove.toLowerCase()).toContain('client backend feature');
      expect(after.recommendation.why.toLowerCase()).toContain('10:00 am');
    });

    it('RW2 after correction: fellowship meeting and phone call (as fixed-event) preserved', () => {
      const { after } = runCorrectionScenario(rw1, rw2);

      const meeting = after.analysis.responsibilityAnalysis.find(r => r.title === 'Fellowship meeting');
      expect(meeting).toBeDefined();

      // Phone call is now a fixed-event human need, not a responsibility
      const callNeed = after.context.humanNeeds.find(n => n.kind === 'fixed-event' && n.description.includes('phone call'));
      expect(callNeed).toBeDefined();
      expect(callNeed?.window).not.toBeNull();
    });

    it('RW2 after correction: effort remains 3 hours, no duplicate versions', () => {
      const { before, after } = runCorrectionScenario(rw1, rw2);
      const feature = after.analysis.responsibilityAnalysis.find(r => r.title === 'Client backend feature');
      expect(feature?.effortMinutes).toBe(180);
      expect(before.context.responsibilities.length).toBeLessThanOrEqual(after.context.responsibilities.length);
    });
  });
});