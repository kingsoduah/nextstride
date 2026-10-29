import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiService } from './ai.service';

const GROQ_KEY = 'GROQ_API_KEY';
const OR_KEY = 'OPENROUTER_API_KEY';
const GROQ_MODEL_KEY = 'GROQ_MODEL';
const GEMINI_KEY = 'GEMINI_API_KEY';
const GEMINI_MODEL_KEY = 'GEMINI_MODEL';

let savedEnv: Record<string, string | undefined>;

function stubPrisma() {
  return { aiRun: { create: async () => ({}) } } as never;
}

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

describe('AiService model selection', () => {
  it('falls back to rule-based when nothing is configured (legacy behavior)', async () => {
    const svc = new AiService(stubPrisma());
    const out = await svc.understand('I have an assignment due tomorrow.');
    expect(out.provider).toBe('rule-based-fallback');
    expect(out.context.responsibilities.length).toBeGreaterThan(0);
  });

  it('treats explicit provider "auto" as the full chain and advances to Gemini', async () => {
    process.env[GROQ_KEY] = 'groq-key';
    process.env[GEMINI_KEY] = 'gemini-key';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse((init?.body as string) ?? '{}');
        if (body.model && String(body.model).includes('gpt-oss')) {
          return { ok: false, status: 429, json: async () => ({}) } as Response;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({ responsibilities: [], conflicts: [], uncertainties: [] }),
                    },
                  ],
                },
              },
            ],
          }),
        } as Response;
      }),
    );
    const svc = new AiService(stubPrisma());
    const out = await svc.understand('I have an assignment due tomorrow.', undefined, {
      provider: 'auto',
    });
    expect(out.provider).toBe('gemini');
    expect(out.model).toBe('gemini-3.1-flash-lite');
  });

  it('rejects unknown providers with HTTP 400', async () => {
    process.env[GROQ_KEY] = 'x';
    const svc = new AiService(stubPrisma());
    const err = await svc
      .understand('text', 'sit-1', { provider: 'evil-corp', model: 'x' })
      .then(() => null, (e) => e);
    expect(err).not.toBeNull();
    expect(err.status ?? err.getStatus?.()).toBe(400);
  });

  it('rejects disallowed models with HTTP 400 on prioritize', async () => {
    process.env[OR_KEY] = 'x';
    const svc = new AiService(stubPrisma());
    const err = await svc
      .prioritize({
        situationText: 't',
        context: { responsibilities: [], conflicts: [], uncertainties: [] },
        selection: { provider: 'openrouter', model: 'gpt-4' },
      })
      .then(() => null, (e) => e);
    expect(err).not.toBeNull();
    expect(err.status ?? err.getStatus?.()).toBe(400);
  });
});
