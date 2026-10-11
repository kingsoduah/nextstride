import { describe, expect, it } from 'vitest';
import { AiInvalidOutputError, AiUnavailableError } from '../ai/errors';
import type { DecisionContextV2 } from '../decision/spec';
import type { DecisionAnalysisV2 } from '../analysis/analysis';
import { applyStatusGuardrails, RecommendationService } from './recommendation.service';
import type { ReasoningExtractor } from './recommendation.service';
import type { ReasoningInput } from './reasoning-prompts';
import type { RecommendationV2 } from './recommendation';

const REF = { nowIso: '2026-10-06T17:00:00.000Z', timezone: 'Africa/Lagos' };

function context(): DecisionContextV2 {
  return {
    reference: REF,
    rawText: 'assignment due tomorrow',
    responsibilities: [
      {
        title: 'Assignment',
        description: '',
        category: 'academic',
        deadline: {
          expression: { kind: 'exact', instantIso: '2026-10-07T06:00:00.000Z' },
          precision: 'exact',
          state: 'known',
        },
        effort: { minutes: 360, maxMinutes: null, confidence: 'stated', state: 'known', note: '' },
        consequence: '',
        consequenceKnown: false,
        flexibility: 'unknown',
        delegation: null,
        dependsOn: [],
        status: 'not-started',
      },
    ],
    constraints: [],
    humanNeeds: [],
    unknowns: [],
  };
}

function validDraft(over: Partial<RecommendationV2> = {}): RecommendationV2 {
  return {
    nextMove: 'Start the assignment now.',
    why: 'Due first with limited time.',
    plan: ['Work 90 minutes.'],
    whatCanWait: [],
    risk: 'Tight buffer.',
    reassessmentTrigger: 'Reassess if estimates change.',
    assumptions: [],
    unknowns: [],
    options: [],
    status: 'RECOMMEND',
    ...over,
  };
}

class StubReasoner implements ReasoningExtractor {
  readonly name = 'stub';
  calls: ReasoningInput[] = [];
  constructor(private script: Array<{ ok: boolean; draft?: RecommendationV2 }>) {}
  async reason(input: ReasoningInput): Promise<unknown> {
    this.calls.push(input);
    const step = this.script[Math.min(this.calls.length - 1, this.script.length - 1)];
    if (!step.ok) throw new AiInvalidOutputError('bad shape');
    return step.draft ?? validDraft();
  }
}

class UnavailableReasoner implements ReasoningExtractor {
  readonly name = 'stub-down';
  calls = 0;
  async reason(): Promise<unknown> {
    this.calls += 1;
    throw new AiUnavailableError('down');
  }
}

interface StoredRec {
  id: string;
  situationId: string;
  version: number;
  contextVersion: number;
  analysis: unknown;
  payload: unknown;
  status: string;
  previousId: string | null;
  provider: string;
  promptVersion: string;
}

function stubPrisma() {
  const store: { contexts: any[]; recs: StoredRec[] } = { contexts: [], recs: [] };
  let n = 0;
  const prisma = {
    situation: { findFirst: async () => ({ id: 'sit-1', userId: 'u-1', text: 'assignment due tomorrow' }) },
    decisionContext: {
      findFirst: async () => store.contexts[store.contexts.length - 1] ?? null,
    },
    recommendationV2: {
      findFirst: async () => store.recs[store.recs.length - 1] ?? null,
      count: async () => store.recs.length,
      create: async ({ data }: any) => {
        n += 1;
        const row = { id: `rec-${n}`, ...data };
        store.recs.push(row);
        return row;
      },
    },
    aiRun: { create: async () => ({}) },
  };
  return { prisma: prisma as never, store };
}

function seedContext(store: { contexts: any[] }, version = 1) {
  store.contexts.push({ version, timezone: 'Africa/Lagos', context: context(), resolutions: {} });
}

describe('RecommendationService', () => {
  it('creates version 1 with no previous link', async () => {
    const { prisma, store } = stubPrisma();
    seedContext(store);
    const svc = new RecommendationService(prisma as never);
    const stub = new StubReasoner([{ ok: true }]);
    const out = await svc.recommend({ situationId: 'sit-1', userId: 'u-1', extractor: stub });
    expect(out.version).toBe(1);
    expect(out.status).toBe('RECOMMEND');
    expect(out.provider).toBe('stub');
    expect(store.recs[0].previousId).toBeNull();
    expect(store.recs[0].contextVersion).toBe(1);
    expect(stub.calls).toHaveLength(1);
    expect(stub.calls[0].previous).toBeUndefined();
  });

  it('second call links previous, includes diff, and stays stable without material change', async () => {
    const { prisma, store } = stubPrisma();
    seedContext(store);
    const svc = new RecommendationService(prisma as never);
    await svc.recommend({ situationId: 'sit-1', userId: 'u-1', extractor: new StubReasoner([{ ok: true }]) });
    expect(store.recs).toHaveLength(1);
    const stub2 = new StubReasoner([{ ok: true }]);
    const out = await svc.recommend({ situationId: 'sit-1', userId: 'u-1', extractor: stub2 });
    expect(out.version).toBe(2);
    expect(out.status).toBe('RECOMMEND');
    expect(stub2.calls[0].previous).toBeDefined();
    expect(stub2.calls[0].previous?.diffSummary.materialChange).toBe(false);
  });

  it('retries once on schema failure, then uses the good draft', async () => {
    const { prisma, store } = stubPrisma();
    seedContext(store);
    const svc = new RecommendationService(prisma as never);
    const stub = new StubReasoner([{ ok: false }, { ok: true, draft: validDraft({ nextMove: 'Retry worked.' }) }]);
    const out = await svc.recommend({ situationId: 'sit-1', userId: 'u-1', extractor: stub });
    expect(stub.calls).toHaveLength(2);
    expect(out.recommendation.nextMove).toBe('Retry worked.');
  });

  it('repeated invalid output falls back deterministically and persists it', async () => {
    const { prisma, store } = stubPrisma();
    seedContext(store);
    const svc = new RecommendationService(prisma as never);
    const stub = new StubReasoner([{ ok: false }]);
    const out = await svc.recommend({ situationId: 'sit-1', userId: 'u-1', extractor: stub });
    expect(out.provider).toBe('deterministic-fallback');
    expect(store.recs[0].provider).toBe('deterministic-fallback');
    expect(['RECOMMEND', 'NEEDS_INPUT', 'INFEASIBLE']).toContain(out.status);
  });

  it('provider outage falls back without retry', async () => {
    const { prisma, store } = stubPrisma();
    seedContext(store);
    const svc = new RecommendationService(prisma as never);
    const stub = new UnavailableReasoner();
    const out = await svc.recommend({ situationId: 'sit-1', userId: 'u-1', extractor: stub });
    expect(stub.calls).toBe(1);
    expect(out.provider).toBe('deterministic-fallback');
  });

  it('404s on missing situation or missing context', async () => {
    const { prisma } = stubPrisma();
    (prisma as any).situation.findFirst = async () => null;
    const svc = new RecommendationService(prisma as never);
    const err = await svc
      .recommend({ situationId: 'nope', userId: 'u-1', extractor: new StubReasoner([{ ok: true }]) })
      .catch((e) => e);
    expect(typeof err?.getStatus === 'function' ? err.getStatus() : undefined).toBe(404);
  });
});

describe('applyStatusGuardrails', () => {
  const blocking: DecisionAnalysisV2 = {
    reference: REF,
    timezone: 'Africa/Lagos',
    responsibilityAnalysis: [],
    availableWindows: [],
    blockedWindows: [],
    dependencies: [],
    conflicts: [],
    totalRequiredMinutes: null,
    totalAvailableMinutes: 0,
    bufferMinutes: null,
    shortfallMinutes: null,
    unknowns: [{ field: 'Assignment: exact time', whyItMatters: 'AM/PM unclear.', blocking: true }],
    blockingUnknowns: [{ field: 'Assignment: exact time', whyItMatters: 'AM/PM unclear.', blocking: true }],
    analysisStatus: 'blocked',
  };

  const clean: DecisionAnalysisV2 = { ...blocking, unknowns: [], blockingUnknowns: [] };

  it('forces NEEDS_INPUT when blocking unknowns exist', () => {
    expect(applyStatusGuardrails(validDraft(), blocking, { previousExists: false, materialChange: false }).status)
      .toBe('NEEDS_INPUT');
  });

  it('forces INFEASIBLE when analysis is infeasible but draft claims RECOMMEND', () => {
    const infeasible: DecisionAnalysisV2 = {
      ...clean,
      responsibilityAnalysis: [{
        index: 0, title: 'A', consequenceKnown: false, deadlineKind: 'instant',
        deadlineEndIso: '2026-10-07T06:00:00.000Z', effortMinutes: 480, requiredMinutes: 480,
        delegationApplied: false, availableMinutes: 300, availableWindows: [],
        bufferMinutes: null, shortfallMinutes: 180, feasibility: 'INFEASIBLE', unknowns: [],
      }],
    };
    expect(applyStatusGuardrails(validDraft(), infeasible, { previousExists: false, materialChange: false }).status)
      .toBe('INFEASIBLE');
  });

  it('marks REASSESS on material change with history', () => {
    expect(applyStatusGuardrails(validDraft(), clean, { previousExists: true, materialChange: true }).status)
      .toBe('REASSESS');
  });

  it('keeps RECOMMEND stable without material change', () => {
    expect(applyStatusGuardrails(validDraft(), clean, { previousExists: true, materialChange: false }).status)
      .toBe('RECOMMEND');
  });

  it('repairs an unknown status value instead of persisting it', () => {
    expect(applyStatusGuardrails({ ...validDraft(), status: 'WHATEVER' } as never, clean, { previousExists: false, materialChange: false }).status)
      .toBe('RECOMMEND');
  });
});
