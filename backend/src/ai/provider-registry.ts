import type { AiProvider } from './ai-provider.interface';
import {
  AiInvalidOutputError,
  AiProviderError,
  AiUnavailableError,
  attachProviderAttempts,
} from './errors';
import { GeminiProvider, geminiCompleteJson, geminiConfiguredModel } from './gemini.provider';
import { GroqProvider, groqCompleteJson } from './groq.provider';
import { OPENROUTER_BASE_URL, OPENROUTER_FREE_MODELS, OpenRouterProvider, type OpenRouterFreeModel } from './openrouter.provider';
import { openAiCompatibleCompleteJson } from './openai-compatible';

/**
 * Phase 8.5 provider registry. All client-supplied provider/model values are
 * validated against this allowlist — arbitrary base URLs, model IDs, or
 * credentials are never accepted.
 */

export type ProviderName = 'groq' | 'gemini' | 'openrouter' | 'auto';

export interface ProviderSelection {
  provider: Exclude<ProviderName, 'auto'>;
  model: string;
}

export const AUTO_MODE_ID = 'auto';

/**
 * True when the request means "Auto": no provider, blank, or the literal
 * 'auto', with no model. Auto must use the full priority chain — resolving it
 * as a single selection silently drops Gemini fallback.
 */
export function isAutoSelection(provider?: string, model?: string): boolean {
  if (model != null && model.trim() !== '') return false;
  const p = (provider ?? '').trim().toLowerCase();
  return p === '' || p === AUTO_MODE_ID;
}

/**
 * Temporarily parked providers (pre-deployment stabilization). A parked
 * provider stays fully integrated — registry, transport, allowlist, and
 * configuration are untouched — but it is excluded from the Auto fallback
 * chain and from readiness so it cannot add latency or generic errors to
 * the normal path. To re-enable: delete the entry. No other change needed.
 */
export const PARKED_PROVIDERS: ReadonlySet<string> = new Set(['openrouter']);

export function groqModelId(): string {
  return process.env.GROQ_MODEL ?? 'openai/gpt-oss-120b';
}

export function geminiModelId(): string {
  return geminiConfiguredModel();
}

export function isGroqConfigured(): boolean {
  return Boolean(process.env.GROQ_API_KEY);
}

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export function isOpenRouterConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

/** Concrete providers available right now (key present). Never includes credentials. */
export function availableProviders(): Array<{ provider: 'groq' | 'gemini' | 'openrouter'; models: string[] }> {
  const out: Array<{ provider: 'groq' | 'gemini' | 'openrouter'; models: string[] }> = [];
  if (isGroqConfigured()) out.push({ provider: 'groq', models: [groqModelId()] });
  if (isGeminiConfigured()) out.push({ provider: 'gemini', models: [geminiModelId()] });
  // Parked providers are hidden from readiness even when their key is set.
  if (isOpenRouterConfigured() && !PARKED_PROVIDERS.has('openrouter')) {
    out.push({ provider: 'openrouter', models: [...OPENROUTER_FREE_MODELS] });
  }
  return out;
}

export class UnknownProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnknownProviderError';
  }
}

/**
 * Validate a client-supplied selection against the allowlist.
 * Throws UnknownProviderError (→ HTTP 400) for anything not explicitly supported.
 */
export function resolveSelection(provider?: string, model?: string): ProviderSelection {
  const p = (provider ?? 'auto').trim().toLowerCase();
  if (p === 'auto' || p === '') {
    if (model != null && model.trim() !== '') {
      throw new UnknownProviderError('Auto mode does not accept a model id');
    }
    const first = autoPriority()[0];
    if (!first) throw new UnknownProviderError('No AI provider is configured');
    return first;
  }
  if (p === 'groq') {
    const expected = groqModelId();
    if (model != null && model !== expected) {
      throw new UnknownProviderError(`Unsupported Groq model. Allowed: ${expected}`);
    }
    if (!isGroqConfigured()) throw new UnknownProviderError('Groq is not configured');
    return { provider: 'groq', model: expected };
  }
  if (p === 'gemini') {
    const expected = geminiModelId();
    if (model != null && model !== expected) {
      throw new UnknownProviderError(`Unsupported Gemini model. Allowed: ${expected}`);
    }
    if (!isGeminiConfigured()) throw new UnknownProviderError('Gemini is not configured');
    return { provider: 'gemini', model: expected };
  }
  if (p === 'openrouter') {
    if (model == null || !(OPENROUTER_FREE_MODELS as readonly string[]).includes(model)) {
      throw new UnknownProviderError(`Unsupported OpenRouter model. Allowed: ${OPENROUTER_FREE_MODELS.join(', ')}`);
    }
    if (!isOpenRouterConfigured()) throw new UnknownProviderError('OpenRouter is not configured');
    return { provider: 'openrouter', model };
  }
  throw new UnknownProviderError(`Unknown provider '${provider}'. Allowed: auto, groq, gemini, openrouter`);
}

/**
 * Explicit, deterministic Auto priority: incumbent Groq first (current
 * behavior), then Gemini. Parked providers (see PARKED_PROVIDERS) are
 * skipped even when configured. Bounded: at most one attempt-chain per
 * call, each with the transport's own bounded retry — no cascading loops.
 */
export function autoPriority(): ProviderSelection[] {
  const out: ProviderSelection[] = [];
  if (isGroqConfigured()) out.push({ provider: 'groq', model: groqModelId() });
  if (isGeminiConfigured()) out.push({ provider: 'gemini', model: geminiModelId() });
  // Parked providers never enter the Auto chain, even when configured.
  if (isOpenRouterConfigured() && !PARKED_PROVIDERS.has('openrouter')) {
    for (const m of OPENROUTER_FREE_MODELS) out.push({ provider: 'openrouter', model: m });
  }
  return out;
}

/** Build a concrete provider for a validated selection. */
export function buildProvider(sel: ProviderSelection): AiProvider {
  if (sel.provider === 'groq') return new GroqProvider(sel.model);
  if (sel.provider === 'gemini') return new GeminiProvider(sel.model);
  return new OpenRouterProvider(sel.model as OpenRouterFreeModel);
}

/** Attribution label for a validated selection. Bare names for configured defaults. */
export function selectionName(sel: ProviderSelection): string {
  if (sel.provider === 'groq') return sel.model === groqModelId() ? 'groq' : `groq:${sel.model}`;
  if (sel.provider === 'gemini') return sel.model === geminiModelId() ? 'gemini' : `gemini:${sel.model}`;
  return `openrouter:${sel.model}`;
}

/**
 * Raw JSON transport for a validated selection. Used by V2 extraction and
 * reasoning, which share prompts/schemas across providers. Groq keeps its
 * exact existing call (json_object mode); OpenRouter free models omit
 * response_format and rely on fence-stripping + schema validation.
 */
export function transportFor(sel: ProviderSelection): (systemPrompt: string, userPrompt: string) => Promise<unknown> {
  if (sel.provider === 'groq') {
    return (systemPrompt, userPrompt) => groqCompleteJson(systemPrompt, userPrompt, sel.model);
  }
  if (sel.provider === 'gemini') {
    return (systemPrompt, userPrompt) => geminiCompleteJson(systemPrompt, userPrompt, sel.model);
  }
  return (systemPrompt, userPrompt) => {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new AiUnavailableError('OPENROUTER_API_KEY is not configured');
    return openAiCompatibleCompleteJson({
      baseUrl: OPENROUTER_BASE_URL,
      apiKey,
      model: sel.model,
      systemPrompt,
      userPrompt,
      jsonMode: false,
      providerLabel: 'OpenRouter',
    });
  };
}

/**
 * Try providers in order, advancing ONLY on AiUnavailableError (429, 5xx,
 * network, timeout, missing key). Any other error (auth, validation,
 * malformed output) stops the chain immediately — never silently switch
 * models on non-retryable failures. Returns the provider that succeeded
 * alongside its result so callers report actual (not requested) attribution.
 */
export async function withProviderFallback<T>(
  selections: ProviderSelection[],
  run: (provider: AiProvider, sel: ProviderSelection) => Promise<T>,
): Promise<{ result: T; used: ProviderSelection; tried: ProviderSelection[] }> {
  const tried: ProviderSelection[] = [];
  let lastErr: unknown = null;
  for (const sel of selections) {
    tried.push(sel);
    try {
      const result = await run(buildProvider(sel), sel);
      return { result, used: sel, tried };
    } catch (err) {
      if (err instanceof AiUnavailableError) {
        lastErr = err;
        continue;
      }
      // Non-retryable (provider rejection, malformed output, bug): stop
      // here, but record every provider/model attempt for diagnostics.
      if (err instanceof Error) attachProviderAttempts(err, tried);
      throw err;
    }
  }
  if (lastErr instanceof Error) attachProviderAttempts(lastErr, tried);
  if (lastErr) throw lastErr;
  throw new AiUnavailableError('No AI provider is configured');
}

/**
 * Concise, actionable, secret-free user-facing messages for AI failures.
 * Concrete causes (status, request id, upstream text) stay in backend logs
 * and AiRun rows — never in responses.
 */
export const AI_UNAVAILABLE_MESSAGE =
  'The AI provider is busy right now (rate limit or outage). Retry in a moment, or pick a different model.';
export const AI_INVALID_OUTPUT_MESSAGE =
  'The selected model returned unusable output. Retry, or pick a different model in the selector.';
/**
 * Provider auth/config rejection. Deliberately distinct from the transient
 * "busy" message: retrying will not help until an operator fixes the provider
 * credentials or model configuration. Upstream details stay server-side.
 */
export const AI_PROVIDER_REJECTED_MESSAGE =
  'The AI provider rejected its configuration (API key or model). An administrator must check the provider settings before retrying.';

/** Normalize a provider error for user-facing responses (no secrets, no raw payloads). */
export function normalizeProviderError(err: unknown): { code: 'AI_UNAVAILABLE' | 'AI_INVALID_OUTPUT'; message: string; status: number } {
  if (err instanceof AiUnavailableError) {
    return { code: 'AI_UNAVAILABLE', message: AI_UNAVAILABLE_MESSAGE, status: 503 };
  }
  // Provider auth/config rejection: a service problem, not malformed output.
  // The concrete cause stays in logs; callers get a safe, actionable message.
  if (err instanceof AiProviderError) {
    const message = err.kind === 'request' ? AI_UNAVAILABLE_MESSAGE : AI_PROVIDER_REJECTED_MESSAGE;
    return { code: 'AI_UNAVAILABLE', message, status: 503 };
  }
  if (err instanceof AiInvalidOutputError) {
    return { code: 'AI_INVALID_OUTPUT', message: AI_INVALID_OUTPUT_MESSAGE, status: 502 };
  }
  return { code: 'AI_UNAVAILABLE', message: AI_UNAVAILABLE_MESSAGE, status: 503 };
}
