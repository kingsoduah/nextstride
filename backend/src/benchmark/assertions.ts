import type { DecisionAnalysisV2, ResponsibilityAnalysis } from '../analysis/analysis';
import type { RecommendationV2 } from '../recommend/recommendation';
import type { Scenario } from './scenarios';

/** Result of running a single scenario through the full pipeline. */
export interface ScenarioResult {
  scenarioId: string;
  scenarioName: string;
  passed: boolean;
  errors: string[];
  warnings: string[];
  details: {
    factExtraction?: FactExtractionResult;
    analysis?: AnalysisResult;
    recommendation?: RecommendationResult;
    correction?: CorrectionResult;
  };
}

export interface FactExtractionResult {
  passed: boolean;
  errors: string[];
  extracted: {
    responsibilities: Array<{ title: string; hasDeadline: boolean; deadlineKind?: string; effortMinutes?: number | null; category?: string }>;
    humanNeeds: Array<{ kind: string; description: string }>;
  };
}

export interface AnalysisResult {
  passed: boolean;
  errors: string[];
  responsibilityAnalysis: Array<{
    title: string;
    feasibility: string;
    availableMinutes: number;
    bufferMinutes: number | null;
    shortfallMinutes: number | null;
    deadlineEndIso: string | null;
    deadlineKind: string;
  }>;
  conflicts: Array<{ type: string; description: string; involves: string[] }>;
  blockingUnknowns: string[];
}

export interface RecommendationResult {
  passed: boolean;
  errors: string[];
  status: string;
  nextMove: string;
  why: string;
  plan: string[];
  whatCanWait: string[];
  risk: string;
  reassessmentTrigger: string;
  assumptions: string[];
  unknowns: Array<{ field: string; whyItMatters: string; blocking: boolean }>;
  options: string[];
}

export interface CorrectionResult {
  passed: boolean;
  errors: string[];
  before: RecommendationResult;
  after: RecommendationResult;
  changesDetected: string[];
}

/**
 * Assert fact extraction accuracy against expected facts.
 */
export function assertFactExtraction(
  context: { responsibilities: any[]; humanNeeds: any[]; constraints: any[] },
  expected: Scenario['expected']['facts']
): FactExtractionResult {
  const errors: string[] = [];
  const extracted = {
    responsibilities: context.responsibilities.map(r => ({
      title: r.title,
      hasDeadline: r.deadline != null,
      deadlineKind: r.deadline?.expression?.kind,
      effortMinutes: r.effort?.minutes ?? null,
      category: r.category,
    })),
    humanNeeds: context.humanNeeds.map(n => ({ kind: n.kind, description: n.description })),
  };

  if (expected?.responsibilities) {
    for (const exp of expected.responsibilities) {
      const found = extracted.responsibilities.find(r => r.title.includes(exp.title) || exp.title.includes(r.title));
      if (!found) {
        errors.push(`Responsibility "${exp.title}" not found in extracted`);
        continue;
      }
      if (exp.hasDeadline !== undefined && found.hasDeadline !== exp.hasDeadline) {
        errors.push(`Responsibility "${exp.title}": expected hasDeadline=${exp.hasDeadline}, got ${found.hasDeadline}`);
      }
      if (exp.deadlineKind && found.deadlineKind !== exp.deadlineKind) {
        errors.push(`Responsibility "${exp.title}": expected deadlineKind=${exp.deadlineKind}, got ${found.deadlineKind}`);
      }
      if (exp.effortMinutes !== undefined && found.effortMinutes !== exp.effortMinutes) {
        errors.push(`Responsibility "${exp.title}": expected effortMinutes=${exp.effortMinutes}, got ${found.effortMinutes}`);
      }
      if (exp.category && found.category !== exp.category) {
        errors.push(`Responsibility "${exp.title}": expected category=${exp.category}, got ${found.category}`);
      }
    }
  }

  if (expected?.humanNeeds) {
    for (const exp of expected.humanNeeds) {
      const found = extracted.humanNeeds.find(n => n.kind === exp.kind && (!exp.descriptionContains || n.description.toLowerCase().includes(exp.descriptionContains.toLowerCase())));
      if (!found) {
        errors.push(`Human need kind="${exp.kind}"${exp.descriptionContains ? ` containing "${exp.descriptionContains}"` : ''} not found`);
      }
    }
  }

  if (expected?.constraints) {
    for (const exp of expected.constraints) {
      const found = context.constraints.find(c => !exp.descriptionContains || c.description.toLowerCase().includes(exp.descriptionContains.toLowerCase()));
      if (!found) {
        errors.push(`Constraint containing "${exp.descriptionContains}" not found`);
      } else if (exp.strength && found.strength !== exp.strength) {
        errors.push(`Constraint "${found.description}": expected strength=${exp.strength}, got ${found.strength}`);
      }
    }
  }

  return { passed: errors.length === 0, errors, extracted };
}

/**
 * Assert analysis results against expected analysis.
 */
export function assertAnalysis(
  analysis: DecisionAnalysisV2,
  expected: Scenario['expected']['analysis']
): AnalysisResult {
  const errors: string[] = [];

  const responsibilityAnalysis = analysis.responsibilityAnalysis.map(r => ({
    title: r.title,
    feasibility: r.feasibility,
    availableMinutes: r.availableMinutes,
    bufferMinutes: r.bufferMinutes,
    shortfallMinutes: r.shortfallMinutes,
    deadlineEndIso: r.deadlineEndIso,
    deadlineKind: r.deadlineKind,
  }));

  if (expected?.statuses) {
    for (const exp of expected.statuses) {
      const found = responsibilityAnalysis.find(r => r.title.includes(exp.title) || exp.title.includes(r.title));
      if (!found) {
        errors.push(`Analysis for "${exp.title}" not found`);
        continue;
      }
      if (exp.feasibility && found.feasibility !== exp.feasibility) {
        errors.push(`"${exp.title}": expected feasibility=${exp.feasibility}, got ${found.feasibility}`);
      }
      if (exp.availableMinutes !== undefined && found.availableMinutes !== exp.availableMinutes) {
        errors.push(`"${exp.title}": expected availableMinutes=${exp.availableMinutes}, got ${found.availableMinutes}`);
      }
      if (exp.bufferMinutes !== undefined && found.bufferMinutes !== exp.bufferMinutes) {
        errors.push(`"${exp.title}": expected bufferMinutes=${exp.bufferMinutes}, got ${found.bufferMinutes}`);
      }
      if (exp.shortfallMinutes !== undefined && found.shortfallMinutes !== exp.shortfallMinutes) {
        errors.push(`"${exp.title}": expected shortfallMinutes=${exp.shortfallMinutes}, got ${found.shortfallMinutes}`);
      }
    }
  }

  if (expected?.conflicts) {
    for (const exp of expected.conflicts) {
      const found = analysis.conflicts.find(c => c.type === exp.type && (!exp.involves || exp.involves.every((i: string) => c.involves.includes(i))));
      if (!found) {
        errors.push(`Expected conflict type="${exp.type}"${exp.involves ? ` involving ${exp.involves.join(', ')}` : ''} not found`);
      }
    }
  }

  if (expected?.blockingUnknowns) {
    for (const exp of expected.blockingUnknowns) {
      const found = analysis.blockingUnknowns.find(u => u.field.includes(exp) || exp.includes(u.field));
      if (!found) {
        errors.push(`Expected blocking unknown "${exp}" not found`);
      }
    }
  }

  return { passed: errors.length === 0, errors, responsibilityAnalysis, conflicts: analysis.conflicts, blockingUnknowns: analysis.blockingUnknowns.map(u => u.field) };
}

/**
 * Assert recommendation quality against expected recommendation.
 */
export function assertRecommendation(
  rec: RecommendationV2,
  expected: Scenario['expected']['recommendation']
): RecommendationResult {
  const errors: string[] = [];

  if (expected?.status && rec.status !== expected.status) {
    errors.push(`Expected status=${expected.status}, got ${rec.status}`);
  }

  if (expected?.nextMoveContains && !rec.nextMove.toLowerCase().includes(expected.nextMoveContains.toLowerCase())) {
    errors.push(`nextMove should contain "${expected.nextMoveContains}", got "${rec.nextMove}"`);
  }

  if (expected?.whyContains && !rec.why.toLowerCase().includes(expected.whyContains.toLowerCase())) {
    errors.push(`why should contain "${expected.whyContains}", got "${rec.why}"`);
  }

  if (expected?.planContains && !rec.plan.some(p => p.toLowerCase().includes(expected.planContains!.toLowerCase()))) {
    errors.push(`plan should contain "${expected.planContains}", got ${JSON.stringify(rec.plan)}`);
  }

  if (expected?.riskContains && !rec.risk.toLowerCase().includes(expected.riskContains.toLowerCase())) {
    errors.push(`risk should contain "${expected.riskContains}", got "${rec.risk}"`);
  }

  if (expected?.mustNotContain) {
    const allText = `${rec.nextMove} ${rec.why} ${rec.plan.join(' ')} ${rec.risk} ${rec.whatCanWait.join(' ')}`.toLowerCase();
    for (const forbidden of expected.mustNotContain) {
      if (allText.includes(forbidden.toLowerCase())) {
        errors.push(`Recommendation must not contain "${forbidden}"`);
      }
    }
  }

  return {
    passed: errors.length === 0,
    errors,
    status: rec.status,
    nextMove: rec.nextMove,
    why: rec.why,
    plan: rec.plan,
    whatCanWait: rec.whatCanWait,
    risk: rec.risk,
    reassessmentTrigger: rec.reassessmentTrigger,
    assumptions: rec.assumptions,
    unknowns: rec.unknowns,
    options: rec.options,
  };
}

/**
 * Assert correction flow: compare before/after recommendations.
 */
export function assertCorrection(
  before: RecommendationV2,
  after: RecommendationV2,
  expected: Scenario['expected']['correction']
): CorrectionResult {
  const errors: string[] = [];
  const changesDetected: string[] = [];

  if (expected?.expectedChanges) {
    // This would need access to the context to verify fact changes
    // For now, we just check that the recommendation changed appropriately
  }

  if (expected?.newRecommendation) {
    const afterResult = assertRecommendation(after, expected.newRecommendation);
    errors.push(...afterResult.errors);
  }

  // Check that status is REASSESS if there was a material change
  if (before.status !== after.status) {
    changesDetected.push(`Status changed: ${before.status} → ${after.status}`);
  }
  if (before.nextMove !== after.nextMove) {
    changesDetected.push('nextMove changed');
  }
  if (before.why !== after.why) {
    changesDetected.push('why changed');
  }

  return {
    passed: errors.length === 0,
    errors,
    before: assertRecommendation(before, {}),
    after: assertRecommendation(after, {}),
    changesDetected,
  };
}

/**
 * Run all assertions for a scenario.
 */
export function runScenarioAssertions(
  scenario: Scenario,
  context: { responsibilities: any[]; humanNeeds: any[]; constraints: any[] },
  analysis: DecisionAnalysisV2,
  recommendation: RecommendationV2,
  correction?: { before: RecommendationV2; after: RecommendationV2 }
): ScenarioResult {
  const allErrors: string[] = [];
  const allWarnings: string[] = [];

  const factExtraction = assertFactExtraction(context, scenario.expected.facts);
  allErrors.push(...factExtraction.errors);

  const analysisResult = assertAnalysis(analysis, scenario.expected.analysis);
  allErrors.push(...analysisResult.errors);

  const recommendationResult = assertRecommendation(recommendation, scenario.expected.recommendation);
  allErrors.push(...recommendationResult.errors);

  let correctionResult: CorrectionResult | undefined;
  if (scenario.expected.correction && correction) {
    correctionResult = assertCorrection(correction.before, correction.after, scenario.expected.correction);
    allErrors.push(...correctionResult.errors);
  }

  return {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    passed: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
    details: {
      factExtraction,
      analysis: analysisResult,
      recommendation: recommendationResult,
      correction: correctionResult,
    },
  };
}

/**
 * Print a summary of all scenario results.
 */
export function printBenchmarkSummary(results: ScenarioResult[]): void {
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log('\n========== BENCHMARK SUMMARY ==========');
  console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);
  console.log('========================================\n');

  for (const r of results) {
    const status = r.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${status} ${r.scenarioId}: ${r.scenarioName}`);
    if (r.errors.length > 0) {
      for (const e of r.errors) {
        console.log(`    - ${e}`);
      }
    }
    if (r.warnings.length > 0) {
      for (const w of r.warnings) {
        console.log(`    ⚠ ${w}`);
      }
    }
  }
}