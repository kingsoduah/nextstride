import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OPENROUTER_FREE_MODELS } from '../ai/openrouter.provider';
import { LlmReasoner, RecommendationService } from './recommendation.service';

const GROQ_KEY = 'GROQ_API_KEY';
const OR_KEY = 'OPENROUTER_API_KEY';
const GROQ_MODEL_KEY = 'GROQ_MODEL';
const GEMINI_KEY = 'GEMINI_API_KEY';
const GEMINI_MODEL_KEY = 'GEMINI_MODEL';

let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  // Vitest loads backend/.env into workers — scrub ALL provider keys so
  // Auto-chain tests never touch the live network.
  savedEnv = {
    [GROQ_KEY]: process.env[GROQ_KEY],
    [OR_KEY]: process.env[OR_KEY],
    [GROQ_MODEL_KEY]: process.env[GROQ_MODEL_KEY],
    [GEMINI_KEY]: process.env[GEMINI_KEY],
    [GEMINI_MODEL_KEY]: process.env[GEMINI_MODEL_KEY],
  };
  delete process.env[GROQ_KEY];
  delete process.env[OR_KEY];
  delete process.env[GROQ_MODEL_KEY];
  delete process.env[GEMINI_KEY];
  delete process.env[GEMINI_MODEL_KEY];
});

afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.unstubAllGlobals();
});

function chatContent(text: string) {
  return { choices: [{ message: { content: text } }] };
}

function jsonResponse(obj: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => obj } as Response;
}

function validReasoning() {
  return {
    nextMove: 'Start now.',
    why: 'Due first.',
    plan: ['Work.'],
    whatCanWait: [],
    risk: 'None.',
    reassessmentTrigger: 'Later.',
    assumptions: [],
    unknowns: [],
    options: [],
    status: 'RECOMMEND',
  };
}

const REASON_INPUT = {
  situationText: 't',
  context: {
    reference: { nowIso: '2026-10-06T17:00:00.000Z', timezone: 'Africa/Lagos' },
    responsibilities: [],
    constraints: [],
    humanNeeds: [],
    unknowns: [],
  },
  analysis: {
    reference: { nowIso: '2026-10-06T17:00:00.000Z', timezone: 'Africa/Lagos' },
    timezone: 'Africa/Lagos',
    analysisStatus: 'complete',
    totalRequiredMinutes: 0,
    totalAvailableMinutes: 0,
    bufferMinutes: 0,
    shortfallMinutes: null,
    responsibilityAnalysis: [],
    blockedWindows: [],
    dependencies: [],
    conflicts: [],
    unknowns: [],
    blockingUnknowns: [],
  },
} as never;

describe('LlmReasoner provider selection', () => {
  it('defaults to auto attribution without selection', () => {
    process.env[GROQ_KEY] = 'x';
    const r = new LlmReasoner();
    expect(r.name).toBe('auto');
    expect(r.model).toBe('');
  });

  it('names manual selections with provider and model', () => {
    process.env[OR_KEY] = 'x';
    const r = new LlmReasoner('openrouter', OPENROUTER_FREE_MODELS[1]);
    expect(r.name).toBe(`openrouter:${OPENROUTER_FREE_MODELS[1]}`);
    expect(r.model).toBe(OPENROUTER_FREE_MODELS[1]);
  });

  it('names manual gemini selections with the bare configured name', () => {
    process.env['GEMINI_API_KEY'] = 'g';
    const r = new LlmReasoner('gemini');
    expect(r.name).toBe('gemini');
    expect(r.model).toBe('gemini-3.1-flash-lite');
  });

  it('rejects disallowed selections at construction time', () => {
    expect(() => new LlmReasoner('anthropic', 'claude')).toThrow();
    expect(() => new LlmReasoner('openrouter', 'gpt-4')).toThrow();
  });

  it('reports the actual provider after Auto advances past a 503', async () => {
    process.env[GROQ_KEY] = 'groq-key';
    process.env[GEMINI_KEY] = 'gemini-key';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const body = JSON.parse((init?.body as string) ?? '{}');
        // Groq uses `model`; Gemini posts systemInstruction/contents instead.
        if (body.model && String(body.model).includes('gpt-oss')) return jsonResponse({}, 503);
        return jsonResponse({
          candidates: [{ content: { parts: [{ text: JSON.stringify(validReasoning()) }] } }],
        });
      }),
    );
    const r = new LlmReasoner();
    const out = await r.reason(REASON_INPUT);
    expect(out).toEqual(validReasoning());
    // OpenRouter is parked: Auto advances groq -> gemini, never OpenRouter.
    expect(r.name).toBe('gemini');
    expect(r.model).toBe('gemini-3.1-flash-lite');
  });
});

describe('recommend() manual-selection validation', () => {
  function stubPrismaWithContext() {
    const ctx = {
      reference: { nowIso: '2026-10-06T17:00:00.000Z', timezone: 'Africa/Lagos' },
      rawText: 't',
      responsibilities: [],
      constraints: [],
      humanNeeds: [],
      unknowns: [],
    };
    return {
      situation: { findFirst: async () => ({ id: 'sit-1', userId: 'u-1', text: 't' }) },
      decisionContext: { findFirst: async () => ({ version: 1, timezone: 'Africa/Lagos', context: ctx, resolutions: {} }) },
      recommendationV2: { findFirst: async () => null, count: async () => 0, create: async ({ data }: any) => ({ id: 'r1', ...data }) },
      aiRun: { create: async () => ({}) },
    } as never;
  }

  it('rejects unknown providers with HTTP 400', async () => {
    const svc = new RecommendationService(stubPrismaWithContext());
    const err = await svc
      .recommend({ situationId: 'sit-1', userId: 'u-1', provider: 'evil-corp', model: 'x' })
      .then(() => null, (e) => e);
    expect(err).not.toBeNull();
    expect(err.status ?? err.getStatus?.()).toBe(400);
  });

  it('rejects disallowed models with HTTP 400', async () => {
    const svc = new RecommendationService(stubPrismaWithContext());
    const err = await svc
      .recommend({ situationId: 'sit-1', userId: 'u-1', provider: 'openrouter', model: 'gpt-4' })
      .then(() => null, (e) => e);
    expect(err).not.toBeNull();
    expect(err.status ?? err.getStatus?.()).toBe(400);
  });
});
