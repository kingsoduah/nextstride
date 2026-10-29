import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiInvalidOutputError, AiProviderError, AiUnavailableError } from './errors';
import { GEMINI_DEFAULT_MODEL, GeminiProvider, geminiConfiguredModel } from './gemini.provider';

const KEY = 'GEMINI_API_KEY';
const MODEL_KEY = 'GEMINI_MODEL';

let savedKey: string | undefined;
let savedModel: string | undefined;

beforeEach(() => {
  savedKey = process.env[KEY];
  savedModel = process.env[MODEL_KEY];
  delete process.env[KEY];
  delete process.env[MODEL_KEY];
});

afterEach(() => {
  if (savedKey === undefined) delete process.env[KEY];
  else process.env[KEY] = savedKey;
  if (savedModel === undefined) delete process.env[MODEL_KEY];
  else process.env[MODEL_KEY] = savedModel;
  vi.unstubAllGlobals();
});

function geminiBody(text: string) {
  return { candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] };
}

function validUnderstand() {
  return { responsibilities: [], conflicts: [], uncertainties: [] };
}

function jsonResponse(obj: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => obj } as Response;
}

describe('geminiConfiguredModel', () => {
  it('defaults to the verified stable model id', () => {
    expect(GEMINI_DEFAULT_MODEL).toBe('gemini-3.1-flash-lite');
    expect(geminiConfiguredModel()).toBe('gemini-3.1-flash-lite');
  });

  it('honors GEMINI_MODEL override', () => {
    process.env[MODEL_KEY] = 'gemini-3.5-flash-lite';
    expect(geminiConfiguredModel()).toBe('gemini-3.5-flash-lite');
  });
});

describe('GeminiProvider transport', () => {
  it('uses its own credential and exact model id against generateContent', async () => {
    process.env[KEY] = 'gemini-secret';
    const fetchMock = vi.fn(async () => jsonResponse(geminiBody(JSON.stringify(validUnderstand()))));
    vi.stubGlobal('fetch', fetchMock);
    const p = new GeminiProvider();
    await expect(p.understand('hello there, this is a longer test sentence')).resolves.toEqual(validUnderstand());
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_DEFAULT_MODEL}:generateContent`);
    expect(init.headers['x-goog-api-key']).toBe('gemini-secret');
    expect(url).not.toContain('gemini-secret');
    const body = JSON.parse(String(init.body));
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.systemInstruction.parts[0].text.length).toBeGreaterThan(0);
  });

  it('keeps the bare historical-style name for the configured model', () => {
    expect(new GeminiProvider().name).toBe('gemini');
    expect(new GeminiProvider('gemini-3.5-flash-lite').name).toBe('gemini:gemini-3.5-flash-lite');
  });

  it('validates output against the V1 schemas', async () => {
    process.env[KEY] = 'k';
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(geminiBody('{"nope":true}'))));
    await expect(new GeminiProvider().understand('some longer situation text here')).rejects.toBeInstanceOf(
      AiInvalidOutputError,
    );
  });

  it('maps empty candidates (safety block) to invalid output, not unavailable', async () => {
    process.env[KEY] = 'k';
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ candidates: [{ finishReason: 'SAFETY' }] })));
    await expect(new GeminiProvider().understand('some longer situation text here')).rejects.toBeInstanceOf(
      AiInvalidOutputError,
    );
  });

  it('maps 429/503 to unavailable and 401/404 to provider rejection', async () => {
    process.env[KEY] = 'k';
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({}, 429)));
    await expect(new GeminiProvider().understand('some longer situation text here')).rejects.toBeInstanceOf(
      AiUnavailableError,
    );
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({}, 404)));
    await expect(new GeminiProvider().understand('some longer situation text here')).rejects.toBeInstanceOf(
      AiProviderError,
    );
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({}, 401)));
    await expect(new GeminiProvider().understand('some longer situation text here')).rejects.toBeInstanceOf(
      AiProviderError,
    );
  });

  it('does not retry non-transient 4xx (auth/config) and marks them non-retryable', async () => {
    process.env[KEY] = 'k';
    for (const status of [400, 401, 403, 404]) {
      const fetchMock = vi.fn(async () => jsonResponse({}, status));
      vi.stubGlobal('fetch', fetchMock);
      const err = await new GeminiProvider()
        .understand('a long enough situation text')
        .then(() => null, (e) => e);
      expect(err).toBeInstanceOf(AiProviderError);
      expect((err as AiProviderError).retryable).toBe(false);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });

  it('retries a transient 429 once, then succeeds', async () => {
    process.env[KEY] = 'k';
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 429))
      .mockResolvedValueOnce(jsonResponse(geminiBody(JSON.stringify(validUnderstand()))));
    vi.stubGlobal('fetch', fetchMock);
    await expect(new GeminiProvider().understand('a long enough situation text')).resolves.toEqual(validUnderstand());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry a timeout/abort', async () => {
    process.env[KEY] = 'k';
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    const fetchMock = vi.fn(async () => {
      throw abort;
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(new GeminiProvider().understand('a long enough situation text')).rejects.toBeInstanceOf(
      AiUnavailableError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('maps network failures to unavailable and missing key without calling', async () => {
    process.env[KEY] = 'k';
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('fetch failed'); }));
    await expect(new GeminiProvider().understand('some longer situation text here')).rejects.toBeInstanceOf(
      AiUnavailableError,
    );
    delete process.env[KEY];
    const fetchMock = vi.fn(async () => jsonResponse(geminiBody('{"a":1}')));
    vi.stubGlobal('fetch', fetchMock);
    await expect(new GeminiProvider().understand('some longer situation text here')).rejects.toBeInstanceOf(
      AiUnavailableError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
