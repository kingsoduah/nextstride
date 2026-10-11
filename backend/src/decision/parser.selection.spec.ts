import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LlmContextExtractor } from './parser.service';
import { OPENROUTER_FREE_MODELS } from '../ai/openrouter.provider';

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

function validDraft() {
  return { responsibilities: [], humanNeeds: [], constraints: [] };
}

function chatContent(text: string) {
  return { choices: [{ message: { content: text } }] };
}

function jsonResponse(obj: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => obj } as Response;
}

const REF = { nowIso: '2026-10-06T17:00:00.000Z', timezone: 'Africa/Lagos' } as never;

describe('LlmContextExtractor provider selection', () => {
  it('defaults to auto attribution without selection', () => {
    process.env[GROQ_KEY] = 'x';
    expect(new LlmContextExtractor().name).toBe('auto');
  });

  it('names manual groq selection with the bare historical name', () => {
    process.env[GROQ_KEY] = 'x';
    expect(new LlmContextExtractor('groq').name).toBe('groq');
  });

  it('names manual OpenRouter selections with model', () => {
    process.env[OR_KEY] = 'x';
    expect(new LlmContextExtractor('openrouter', OPENROUTER_FREE_MODELS[0]).name).toBe(
      `openrouter:${OPENROUTER_FREE_MODELS[0]}`,
    );
  });

  it('rejects disallowed selections at construction time', () => {
    process.env[GROQ_KEY] = 'x';
    expect(() => new LlmContextExtractor('openrouter', 'gpt-4')).toThrow();
    expect(() => new LlmContextExtractor('anthropic', 'claude')).toThrow();
  });

  it('reports the actual provider after Auto advances past a 429', async () => {
    process.env[GROQ_KEY] = 'groq-key';
    process.env[GEMINI_KEY] = 'gemini-key';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const body = JSON.parse((init?.body as string) ?? '{}');
        // Groq uses `model`; Gemini posts systemInstruction/contents instead.
        if (body.model && String(body.model).includes('gpt-oss')) return jsonResponse({}, 429);
        return jsonResponse({
          candidates: [{ content: { parts: [{ text: JSON.stringify(validDraft()) }] } }],
        });
      }),
    );
    const ex = new LlmContextExtractor();
    const draft = await ex.extract('I have an assignment due tomorrow.', REF);
    expect(draft).toEqual(validDraft());
    // OpenRouter is parked: Auto advances groq -> gemini, never OpenRouter.
    expect(ex.name).toBe('gemini');
    expect(ex.model).toBe('gemini-3.1-flash-lite');
  });

  it('uses groq directly when only groq is configured', async () => {
    process.env[GROQ_KEY] = 'groq-key';
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(chatContent(JSON.stringify(validDraft())))));
    const ex = new LlmContextExtractor();
    await ex.extract('text', REF);
    expect(ex.name).toBe('groq');
    expect(ex.model).toBe('openai/gpt-oss-120b');
  });

  it('maps disallowed manual selections to HTTP 400 in parse()', async () => {
    process.env[GROQ_KEY] = 'x';
    const { DecisionParserService } = await import('./parser.service');
    const prisma = {
      situation: { findFirst: async () => ({ id: 'sit-1', userId: 'u-1', text: 'assignment due tomorrow' }) },
    } as never;
    const svc = new DecisionParserService(prisma);
    const err = await svc
      .parse({ situationId: 'sit-1', userId: 'u-1', provider: 'evil-corp', model: 'x' })
      .then(() => null, (e) => e);
    expect(err).not.toBeNull();
    expect(err.status ?? err.getStatus?.()).toBe(400);
  });
});
