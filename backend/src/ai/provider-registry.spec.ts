import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiInvalidOutputError, AiProviderError, AiUnavailableError, errorDetail, providerAttempts } from './errors';
import {
  extractJson,
  isEligibleForFallback,
  openAiCompatibleCompleteJson,
  sanitizeSnippet,
} from './openai-compatible';
import {
  AI_INVALID_OUTPUT_MESSAGE,
  AI_PROVIDER_REJECTED_MESSAGE,
  AI_UNAVAILABLE_MESSAGE,
  autoPriority,
  availableProviders,
  buildProvider,
  isAutoSelection,
  isGeminiConfigured,
  isOpenRouterConfigured,
  normalizeProviderError,
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

  it('rejects a model supplied with Auto (would silently pin one provider)', () => {
    process.env[GROQ_KEY] = 'x';
    expect(() => resolveSelection('auto', 'openai/gpt-oss-120b')).toThrow(UnknownProviderError);
    expect(() => resolveSelection(undefined, 'openai/gpt-oss-120b')).toThrow(UnknownProviderError);
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
    const err = await withProviderFallback([...sels], async (_p, sel) => {
      calls.push(sel.model);
      throw new AiProviderError('bad key', { kind: 'auth' });
    }).then(() => null, (e) => e);
    expect(err).toBeInstanceOf(AiProviderError);
    expect(calls).toEqual(['m1']);
    // Attempted provider/model is preserved for failure diagnostics.
    expect(providerAttempts(err)).toEqual([{ provider: 'groq', model: 'm1' }]);
  });

  it('attributes every tried provider/model when the chain is exhausted', async () => {
    const sels = [
      { provider: 'groq', model: 'm1' },
      { provider: 'gemini', model: 'm2' },
    ] as const;
    const err = await withProviderFallback([...sels], async (_p, sel) => {
      throw new AiUnavailableError(`${sel.model} down`);
    }).then(() => null, (e) => e);
    expect(err).toBeInstanceOf(AiUnavailableError);
    expect(providerAttempts(err)).toEqual([
      { provider: 'groq', model: 'm1' },
      { provider: 'gemini', model: 'm2' },
    ]);
    expect(errorDetail(err)).toContain('groq/m1');
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

describe('isAutoSelection', () => {
  it('treats absent, blank, and literal auto as Auto when no model is given', () => {
    expect(isAutoSelection()).toBe(true);
    expect(isAutoSelection(undefined, undefined)).toBe(true);
    expect(isAutoSelection('')).toBe(true);
    expect(isAutoSelection(' AUTO ')).toBe(true);
    expect(isAutoSelection('auto', '')).toBe(true);
  });

  it('treats a concrete provider or explicit model as manual', () => {
    expect(isAutoSelection('groq')).toBe(false);
    expect(isAutoSelection('gemini')).toBe(false);
    expect(isAutoSelection('auto', 'gemini-3.1-flash-lite')).toBe(false);
  });
});

describe('Auto provider availability', () => {
  it('orders Groq then Gemini when both keys are visible', () => {
    process.env[GROQ_KEY] = 'x';
    process.env[GEMINI_KEY] = 'g';
    expect(autoPriority()).toEqual([
      { provider: 'groq', model: 'openai/gpt-oss-120b' },
      { provider: 'gemini', model: 'gemini-3.1-flash-lite' },
    ]);
  });

  it('stays Groq-only, without error, when Gemini is not configured', () => {
    process.env[GROQ_KEY] = 'x';
    expect(isGeminiConfigured()).toBe(false);
    expect(autoPriority()).toEqual([{ provider: 'groq', model: 'openai/gpt-oss-120b' }]);
    expect(availableProviders()).toEqual([{ provider: 'groq', models: ['openai/gpt-oss-120b'] }]);
  });

  it('advances to Gemini on a retryable Groq failure', async () => {
    process.env[GROQ_KEY] = 'x';
    process.env[GEMINI_KEY] = 'g';
    const out = await withProviderFallback(autoPriority(), async (_p, sel) => {
      if (sel.provider === 'groq') throw new AiUnavailableError('Groq 429');
      return 'gemini-ok' as const;
    });
    expect(out.used.provider).toBe('gemini');
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

describe('credential redaction', () => {
  // Synthetic fixture only — not a real credential.
  const GOOGLE_KEY = 'AIzaTESTONLY_0000000000000000000000';

  it('redacts Google, Groq, sk-, bearer, and key= credentials', () => {
    const gsk = 'gsk_TESTONLYabcdefghijklmnopqrstuvwxyz012345';
    const out = sanitizeSnippet(`key ${GOOGLE_KEY} Bearer abc.def.ghi sk-live12345678 key=topsecret ${gsk}`);
    expect(out).not.toContain(GOOGLE_KEY);
    expect(out).not.toContain('sk-live12345678');
    expect(out).not.toContain('topsecret');
    expect(out).not.toContain(gsk);
    expect(out).toContain('[redacted]');
  });

  it('keeps upstream error details free of keys', async () => {
    const res = {
      ok: false,
      status: 401,
      headers: { get: () => null },
      text: async () => JSON.stringify({ error: { message: `API key ${GOOGLE_KEY} is invalid` } }),
    } as unknown as Response;
    vi.stubGlobal('fetch', vi.fn(async () => res));
    const err = await openAiCompatibleCompleteJson({ ...BASE, apiKey: GOOGLE_KEY }).then(
      () => null,
      (e) => e,
    );
    expect(err).toBeInstanceOf(AiProviderError);
    expect(String((err as AiProviderError).details)).not.toContain(GOOGLE_KEY);
    expect(String((err as AiProviderError).details)).toContain('[redacted]');
  });

  it('redacts a Groq gsk_ key echoed by the provider', async () => {
    const gsk = 'gsk_TESTONLYabcdefghijklmnopqrstuvwxyz012345';
    const res = {
      ok: false,
      status: 401,
      headers: { get: () => null },
      text: async () => JSON.stringify({ error: { message: `Incorrect API key provided: ${gsk}` } }),
    } as unknown as Response;
    vi.stubGlobal('fetch', vi.fn(async () => res));
    const err = await openAiCompatibleCompleteJson({ ...BASE, apiKey: gsk }).then(
      () => null,
      (e) => e,
    );
    expect(err).toBeInstanceOf(AiProviderError);
    const detail = errorDetail(err);
    expect(detail).not.toContain(gsk);
    expect(detail).toContain('[redacted]');
  });

  it('returns static client messages with no upstream detail', () => {
    const invalid = normalizeProviderError(new AiInvalidOutputError(`key ${GOOGLE_KEY} rejected`));
    expect(invalid.message).toBe(AI_INVALID_OUTPUT_MESSAGE);
    expect(invalid.message).not.toContain(GOOGLE_KEY);
    const unavailable = normalizeProviderError(new AiUnavailableError(`key ${GOOGLE_KEY}`));
    expect(unavailable.message).toBe(AI_UNAVAILABLE_MESSAGE);
    expect(unavailable.message).not.toContain(GOOGLE_KEY);
    // Provider auth/config rejection is a service problem, not malformed output.
    const rejected = normalizeProviderError(new AiProviderError(`key ${GOOGLE_KEY} rejected`));
    expect(rejected.code).toBe('AI_UNAVAILABLE');
    expect(rejected.status).toBe(503);
    // Generic request-kind rejection keeps the transient message.
    expect(rejected.message).toBe(AI_UNAVAILABLE_MESSAGE);
    expect(rejected.message).not.toContain(GOOGLE_KEY);

    // Auth/config rejections are actionable and not described as transient.
    for (const kind of ['auth', 'configuration'] as const) {
      const config = normalizeProviderError(new AiProviderError(`key ${GOOGLE_KEY} rejected`, { kind }));
      expect(config.code).toBe('AI_UNAVAILABLE');
      expect(config.status).toBe(503);
      expect(config.message).toBe(AI_PROVIDER_REJECTED_MESSAGE);
      expect(config.message).not.toContain(GOOGLE_KEY);
    }
  });
});

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

  it('maps 429/503 to unavailable (eligible) and 401 to a provider rejection (ineligible)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({}, 429)));
    await expect(openAiCompatibleCompleteJson(BASE)).rejects.toBeInstanceOf(AiUnavailableError);
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({}, 503)));
    await expect(openAiCompatibleCompleteJson(BASE)).rejects.toBeInstanceOf(AiUnavailableError);
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({}, 401)));
    await expect(openAiCompatibleCompleteJson(BASE)).rejects.toBeInstanceOf(AiProviderError);
  });

  it('retries a transient 429 once, then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 429))
      .mockResolvedValueOnce(jsonResponse(chatContent('{"a":1}')));
    vi.stubGlobal('fetch', fetchMock);
    await expect(openAiCompatibleCompleteJson(BASE)).resolves.toEqual({ a: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries a 5xx once, then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockResolvedValueOnce(jsonResponse(chatContent('{"a":1}')));
    vi.stubGlobal('fetch', fetchMock);
    await expect(openAiCompatibleCompleteJson(BASE)).resolves.toEqual({ a: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries a fast network failure once, then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValueOnce(jsonResponse(chatContent('{"a":1}')));
    vi.stubGlobal('fetch', fetchMock);
    await expect(openAiCompatibleCompleteJson(BASE)).resolves.toEqual({ a: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-transient 4xx responses', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}, 401));
    vi.stubGlobal('fetch', fetchMock);
    await expect(openAiCompatibleCompleteJson(BASE)).rejects.toBeInstanceOf(AiProviderError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('classifies provider 4xx rejections by kind', async () => {
    const cases: Array<[number, string]> = [
      [401, 'auth'],
      [403, 'auth'],
      [400, 'configuration'],
      [404, 'configuration'],
      [418, 'request'],
    ];
    for (const [status, kind] of cases) {
      vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({}, status)));
      const err = await openAiCompatibleCompleteJson(BASE).then(() => null, (e) => e);
      expect(err).toBeInstanceOf(AiProviderError);
      expect((err as AiProviderError).kind).toBe(kind);
    }
  });

  it('does not retry a timeout/abort (latency is already spent)', async () => {
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    const fetchMock = vi.fn(async () => {
      throw abort;
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(openAiCompatibleCompleteJson(BASE)).rejects.toBeInstanceOf(AiUnavailableError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
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
    const fetchMock = vi.fn(async () => jsonResponse(chatContent('oops not json')));
    vi.stubGlobal('fetch', fetchMock);
    await expect(openAiCompatibleCompleteJson(BASE)).rejects.toBeInstanceOf(AiInvalidOutputError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
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
