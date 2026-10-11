import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiInvalidOutputError, AiUnavailableError } from './errors';
import {
  extractJson,
  isEligibleForFallback,
  openAiCompatibleCompleteJson,
} from './openai-compatible';
import {
  autoPriority,
  availableProviders,
  buildProvider,
  isOpenRouterConfigured,
  PARKED_PROVIDERS,
  resolveSelection,
  selectionName,
  UnknownProviderError,
  withProviderFallback,
} from './provider-registry';
import { OPENROUTER_FREE_MODELS } from './openrouter.provider';

const GROQ_KEY = 'GROQ_API_KEY';
const OR_KEY = 'OPENROUTER_API_KEY';
const GROQ_MODEL_KEY = 'GROQ_MODEL';
const GEMINI_KEY = 'GEMINI_API_KEY';
const GEMINI_MODEL_KEY = 'GEMINI_MODEL';

let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
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

describe('resolveSelection allowlist', () => {
  it('defaults to Auto (first priority) with no input', () => {
    process.env[GROQ_KEY] = 'x';
    expect(resolveSelection()).toEqual({ provider: 'groq', model: 'openai/gpt-oss-120b' });
  });

  it('accepts gemini with the configured model and rejects others', () => {
    process.env[GEMINI_KEY] = 'g';
    expect(resolveSelection('gemini')).toEqual({ provider: 'gemini', model: 'gemini-3.1-flash-lite' });
    expect(resolveSelection('GEMINI', 'gemini-3.1-flash-lite')).toEqual({ provider: 'gemini', model: 'gemini-3.1-flash-lite' });
    expect(() => resolveSelection('gemini', 'gpt-4')).toThrow(UnknownProviderError);
  });

  it('rejects gemini when unconfigured', () => {
    expect(() => resolveSelection('gemini')).toThrow(UnknownProviderError);
  });

  it('accepts explicit groq with the configured model', () => {
    process.env[GROQ_KEY] = 'x';
    expect(resolveSelection('groq')).toEqual({ provider: 'groq', model: 'openai/gpt-oss-120b' });
    expect(resolveSelection('GROQ', 'openai/gpt-oss-120b')).toEqual({ provider: 'groq', model: 'openai/gpt-oss-120b' });
  });

  it('rejects a non-allowlisted groq model', () => {
    process.env[GROQ_KEY] = 'x';
    expect(() => resolveSelection('groq', 'evil-model')).toThrow(UnknownProviderError);
  });

  it('accepts each allowlisted OpenRouter free model', () => {
    process.env[OR_KEY] = 'x';
    for (const m of OPENROUTER_FREE_MODELS) {
      expect(resolveSelection('openrouter', m)).toEqual({ provider: 'openrouter', model: m });
    }
  });

  it('rejects OpenRouter without a model or with an unknown model', () => {
    process.env[OR_KEY] = 'x';
    expect(() => resolveSelection('openrouter')).toThrow(UnknownProviderError);
    expect(() => resolveSelection('openrouter', 'gpt-4')).toThrow(UnknownProviderError);
    expect(() => resolveSelection('openrouter', 'https://evil.example.com')).toThrow(UnknownProviderError);
  });

  it('rejects unknown providers and unconfigured providers', () => {
    expect(() => resolveSelection('anthropic', 'claude')).toThrow(UnknownProviderError);
    expect(() => resolveSelection('groq')).toThrow(UnknownProviderError); // no key
    expect(() => resolveSelection('openrouter', OPENROUTER_FREE_MODELS[0])).toThrow(UnknownProviderError); // no key
  });

  it('throws when nothing is configured and Auto is requested', () => {
    expect(() => resolveSelection()).toThrow(UnknownProviderError);
  });
});

describe('autoPriority order', () => {
  it('is groq first, then gemini; parked OpenRouter never enters Auto', () => {
    process.env[GROQ_KEY] = 'x';
    process.env['GEMINI_API_KEY'] = 'g';
    process.env[OR_KEY] = 'y';
    expect(autoPriority()).toEqual([
      { provider: 'groq', model: 'openai/gpt-oss-120b' },
      { provider: 'gemini', model: 'gemini-3.1-flash-lite' },
    ]);
  });

  it('omits unconfigured providers and hides parked OpenRouter from readiness', () => {
    process.env[OR_KEY] = 'y';
    // Key is set, but OpenRouter is parked: no Auto entries, no readiness.
    expect(autoPriority()).toEqual([]);
    expect(availableProviders()).toEqual([]);
    expect(isOpenRouterConfigured()).toBe(true);
  });

  it('keeps a parked OpenRouter manually resolvable so the integration survives', () => {
    process.env[OR_KEY] = 'y';
    // Re-enable path: manual selection still validates; only Auto/readiness hide it.
    for (const m of OPENROUTER_FREE_MODELS) {
      expect(resolveSelection('openrouter', m)).toEqual({ provider: 'openrouter', model: m });
    }
    expect(PARKED_PROVIDERS.has('openrouter')).toBe(true);
  });

  it('lists gemini with its configured model when keyed', () => {
    process.env[GEMINI_KEY] = 'g';
    expect(availableProviders()).toEqual([{ provider: 'gemini', models: ['gemini-3.1-flash-lite'] }]);
    expect(autoPriority()).toEqual([{ provider: 'gemini', model: 'gemini-3.1-flash-lite' }]);
  });

  it('is empty when nothing is configured', () => {
    expect(autoPriority()).toEqual([]);
    expect(availableProviders()).toEqual([]);
  });
});

describe('selectionName attribution', () => {
  it('keeps the bare historical groq name for the configured model', () => {
    process.env[GROQ_MODEL_KEY] = 'openai/gpt-oss-120b';
    expect(selectionName({ provider: 'groq', model: 'openai/gpt-oss-120b' })).toBe('groq');
    expect(selectionName({ provider: 'groq', model: 'other' })).toBe('groq:other');
  });

  it('names OpenRouter selections with model', () => {
    expect(selectionName({ provider: 'openrouter', model: OPENROUTER_FREE_MODELS[0] })).toBe(
      `openrouter:${OPENROUTER_FREE_MODELS[0]}`,
    );
  });

  it('names gemini selections with bare name for the configured model', () => {
    expect(selectionName({ provider: 'gemini', model: 'gemini-3.1-flash-lite' })).toBe('gemini');
    expect(selectionName({ provider: 'gemini', model: 'gemini-3.5-flash-lite' })).toBe('gemini:gemini-3.5-flash-lite');
  });
});

describe('withProviderFallback chain', () => {
  it('returns the first success with used/tried attribution', async () => {
    const sels = [
      { provider: 'groq', model: 'm1' },
      { provider: 'openrouter', model: 'm2' },
    ] as const;
    const calls: string[] = [];
    const out = await withProviderFallback([...sels], async (_p, sel) => {
      calls.push(sel.model);
      if (sel.model === 'm1') throw new AiUnavailableError('429');
      return 'ok-from-m2' as const;
    });
    expect(out).toEqual({ result: 'ok-from-m2', used: sels[1], tried: [...sels] });
    expect(calls).toEqual(['m1', 'm2']);
  });

  it('stops the chain on non-retryable errors (never silently switches)', async () => {
    const sels = [
      { provider: 'groq', model: 'm1' },
      { provider: 'openrouter', model: 'm2' },
    ] as const;
    const calls: string[] = [];
    await expect(
      withProviderFallback([...sels], async (_p, sel) => {
        calls.push(sel.model);
        throw new AiInvalidOutputError('bad key');
      }),
    ).rejects.toBeInstanceOf(AiInvalidOutputError);
    expect(calls).toEqual(['m1']);
  });

  it('throws the last eligible error when every provider fails', async () => {
    const sels = [{ provider: 'groq', model: 'm1' }] as const;
    await expect(
      withProviderFallback([...sels], async () => {
        throw new AiUnavailableError('down');
      }),
    ).rejects.toThrow('down');
  });

  it('throws unavailable when the chain is empty', async () => {
    await expect(withProviderFallback([], async () => 'x')).rejects.toBeInstanceOf(AiUnavailableError);
  });
});

describe('isEligibleForFallback', () => {
  it('allows 429, 5xx, and network/timeout failures', () => {
    expect(isEligibleForFallback(429, null)).toBe(true);
    expect(isEligibleForFallback(500, null)).toBe(true);
    expect(isEligibleForFallback(503, null)).toBe(true);
    expect(isEligibleForFallback(null, new Error('fetch failed'))).toBe(true);
    const abort = new Error('timed out');
    abort.name = 'AbortError';
    expect(isEligibleForFallback(null, abort)).toBe(true);
  });

  it('rejects auth, bad-request, and other 4xx failures', () => {
    expect(isEligibleForFallback(400, null)).toBe(false);
    expect(isEligibleForFallback(401, null)).toBe(false);
    expect(isEligibleForFallback(403, null)).toBe(false);
    expect(isEligibleForFallback(404, null)).toBe(false);
  });
});

describe('extractJson', () => {
  it('parses clean, fenced, and prose-wrapped JSON', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Here you go: {"a":1} done')).toEqual({ a: 1 });
  });

  it('throws on non-JSON', () => {
    expect(() => extractJson('not json at all')).toThrow();
  });
});

function jsonResponse(obj: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => obj } as Response;
}

function chatContent(text: string) {
  return { choices: [{ message: { content: text } }] };
}

const BASE = {
  baseUrl: 'https://example.test/v1',
  apiKey: 'secret',
  model: 'm',
  systemPrompt: 'sys',
  userPrompt: 'user',
};

describe('openAiCompatibleCompleteJson transport', () => {
  it('returns parsed JSON on success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(chatContent('{"a":1}'))));
    await expect(openAiCompatibleCompleteJson(BASE)).resolves.toEqual({ a: 1 });
  });

  it('omits response_format when jsonMode is false', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(chatContent('{"a":1}')));
    vi.stubGlobal('fetch', fetchMock);
    await openAiCompatibleCompleteJson({ ...BASE, jsonMode: false });
    const [, init] = fetchMock.mock.calls[0] as unknown as [unknown, { body?: unknown }];
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body).not.toHaveProperty('response_format');
    expect(body.model).toBe('m');
  });

  it('includes response_format when jsonMode is true', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(chatContent('{"a":1}')));
    vi.stubGlobal('fetch', fetchMock);
    await openAiCompatibleCompleteJson({ ...BASE, jsonMode: true });
    const [, init] = fetchMock.mock.calls[0] as unknown as [unknown, { body?: unknown }];
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('maps 429/503 to unavailable (eligible) and 401 to invalid (ineligible)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({}, 429)));
    await expect(openAiCompatibleCompleteJson(BASE)).rejects.toBeInstanceOf(AiUnavailableError);
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({}, 503)));
    await expect(openAiCompatibleCompleteJson(BASE)).rejects.toBeInstanceOf(AiUnavailableError);
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({}, 401)));
    await expect(openAiCompatibleCompleteJson(BASE)).rejects.toBeInstanceOf(AiInvalidOutputError);
  });

  it('maps network failures to unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('fetch failed'); }));
    await expect(openAiCompatibleCompleteJson(BASE)).rejects.toBeInstanceOf(AiUnavailableError);
  });

  it('throws unavailable without attempting when the key is missing', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(chatContent('{"a":1}')));
    vi.stubGlobal('fetch', fetchMock);
    await expect(openAiCompatibleCompleteJson({ ...BASE, apiKey: '' })).rejects.toBeInstanceOf(AiUnavailableError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws invalid after repeated malformed JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(chatContent('oops not json'))));
    await expect(openAiCompatibleCompleteJson(BASE)).rejects.toBeInstanceOf(AiInvalidOutputError);
  });
});

describe('buildProvider', () => {
  it('builds groq and openrouter providers with attribution names', () => {
    process.env[GROQ_KEY] = 'x';
    const g = buildProvider({ provider: 'groq', model: 'openai/gpt-oss-120b' });
    expect(g.name).toBe('groq');
    const o = buildProvider({ provider: 'openrouter', model: OPENROUTER_FREE_MODELS[0] });
    expect(o.name).toBe(`openrouter:${OPENROUTER_FREE_MODELS[0]}`);
  });

  it('builds gemini providers routing through their own credential', () => {
    const g = buildProvider({ provider: 'gemini', model: 'gemini-3.1-flash-lite' });
    expect(g.name).toBe('gemini');
  });
});
