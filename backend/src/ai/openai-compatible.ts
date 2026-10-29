import { Logger } from '@nestjs/common';
import { AiInvalidOutputError, AiProviderError, AiUnavailableError, providerErrorKind, redactSecrets } from './errors';

const transportLog = new Logger('ai-transport');

/**
 * One bounded retry for transient failures (429, 5xx, fast network errors).
 * Timeouts are deliberately not retried: a 30 s wait already consumed the
 * latency budget, and retrying would double it before provider fallback.
 */
const TRANSIENT_RETRY_MS = 250;
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Phase 8.5: shared transport for OpenAI-compatible Chat Completions endpoints
 * (Groq, OpenRouter). Providers differ only in base URL, credentials, model,
 * and structured-output support — the JSON extraction, retry, timeout, and
 * error-normalization behavior is identical.
 */

export interface OpenAiCompatibleCall {
  /** e.g. 'https://api.groq.com/openai/v1' — never client-supplied. */
  baseUrl: string;
  /** Bearer token. Server-side only; never logged or returned. */
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  /** Default 0.2, matching existing Groq behavior. */
  temperature?: number;
  /**
   * Whether the endpoint honors `response_format: { type: 'json_object' }`.
   * Groq: true. Some OpenRouter free models: false — in that case we omit
   * the parameter and rely on fence-stripping + validation instead.
   */
  jsonMode?: boolean;
  /** Per-attempt timeout ms. Default 30_000 (existing behavior). */
  timeoutMs?: number;
  /** Internal-format attempts. Default 2 (existing behavior). */
  maxAttempts?: number;
  /** Label used in normalized error messages (no secrets). */
  providerLabel?: string;
}

/** True for transient failures eligible for fallback: 429, 5xx, network, timeout. */
export function isEligibleForFallback(status: number | null, err: unknown): boolean {
  if (status != null) {
    if (status === 429) return true;
    if (status >= 500 && status <= 599) return true;
    return false; // 4xx (auth, bad request) are never eligible.
  }
  // No HTTP status: network failure, abort/timeout, DNS — eligible.
  return err instanceof Error && err.name !== 'AiInvalidOutputError';
}

/**
 * Strips anything credential-shaped out of an upstream snippet before it can
 * reach logs, AiRun rows, or error messages. Upstream bodies normally contain
 * only an error object; this is defence in depth.
 */
export function sanitizeSnippet(text: string): string {
  return redactSecrets(text)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}

/**
 * Reads a response header defensively — test doubles may not implement
 * `headers` at all, and a missing diagnostic must never change classification.
 */
export function safeHeader(res: Response, name: string): string {
  try {
    const h = res.headers as Headers | undefined;
    return (h && typeof h.get === 'function' ? h.get(name) : '') ?? '';
  } catch {
    return '';
  }
}

/**
 * Safe, normalized upstream diagnostics for a non-2xx response: status, the
 * provider's request id (for support tickets), rate-limit remaining headers,
 * and a redacted upstream error snippet. Consumes the response body.
 */
export async function upstreamDetail(res: Response): Promise<string> {
  const reqId = safeHeader(res, 'x-request-id') || safeHeader(res, 'x-query-id') || safeHeader(res, 'x-goog-request-id');
  const remaining = safeHeader(res, 'x-ratelimit-remaining-requests') || safeHeader(res, 'x-ratelimit-remaining-tokens');
  let upstream = '';
  try {
    if (typeof res.text === 'function') upstream = sanitizeSnippet(await res.text());
  } catch {
    // Body unreadable — status alone still classifies the failure.
  }
  const bits = [`status ${res.status}`];
  if (reqId) bits.push(`request-id ${sanitizeSnippet(reqId)}`);
  if (remaining) bits.push(`ratelimit-remaining ${sanitizeSnippet(remaining)}`);
  if (upstream) bits.push(`upstream: ${upstream}`);
  return bits.join(', ');
}

/**
 * Strips markdown fences / surrounding prose. Throws AiInvalidOutputError
 * (ineligible for provider fallback — a format problem, not an outage).
 */
export function extractJson(content: string): unknown {
  const text = content.trim();
  if (text.startsWith('{') || text.startsWith('[')) return JSON.parse(text);
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) return JSON.parse(fence[1].trim());
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
  return JSON.parse(text); // throws AiInvalidOutputError below
}

/**
 * Records which model the upstream says actually served the call. A mismatch
 * means the requested id was routed elsewhere upstream — worth a warning.
 */
function logUpstreamModel(providerLabel: string, requested: string, served: string, requestId: string | null): void {
  const suffix = requestId ? `, request-id ${sanitizeSnippet(requestId)}` : '';
  if (served === requested) {
    transportLog.log(`${providerLabel} ok: model ${requested} served${suffix}`);
  } else {
    transportLog.warn(
      `${providerLabel} served a different model: requested ${requested}, upstream reports ${served}${suffix}`,
    );
  }
}

export async function openAiCompatibleCompleteJson(call: OpenAiCompatibleCall): Promise<unknown> {
  const {
    baseUrl,
    apiKey,
    model,
    systemPrompt,
    userPrompt,
    temperature = 0.2,
    jsonMode = true,
    timeoutMs = 30_000,
    maxAttempts = 2,
    providerLabel = 'AI provider',
  } = call;
  if (!apiKey) throw new AiUnavailableError(`${providerLabel} is not configured`);
  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  let lastInvalid: AiInvalidOutputError | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const body: Record<string, unknown> = {
        model,
        temperature,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      };
      if (jsonMode) body.response_format = { type: 'json_object' };
      let res: Response;
      try {
        res = await fetch(url, {
          method: 'POST',
          signal: controller.signal,
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } catch (err) {
        // Network failure / abort (timeout) — eligible for fallback.
        const aborted = err instanceof Error && err.name === 'AbortError';
        if (!aborted && attempt < maxAttempts) {
          transportLog.warn(`${providerLabel} network failure; retrying (${attempt}/${maxAttempts})`);
          await sleep(TRANSIENT_RETRY_MS * attempt);
          continue;
        }
        throw new AiUnavailableError(
          aborted
            ? `${providerLabel} request timed out`
            : `${providerLabel} request failed`,
        );
      }
      if (!res.ok) {
        const detail = await upstreamDetail(res);
        if (isEligibleForFallback(res.status, null)) {
          const message = `${providerLabel} request failed: ${detail} (model ${model})`;
          if (attempt < maxAttempts) {
            transportLog.warn(`${message}; retrying (${attempt}/${maxAttempts})`);
            await sleep(TRANSIENT_RETRY_MS * attempt);
            continue;
          }
          transportLog.warn(message);
          throw new AiUnavailableError(message);
        }
        // Auth / bad-request / other 4xx: ineligible for retry or silent
        // fallback — the same request will fail the same way. This is a
        // provider configuration problem, not malformed model output.
        throw new AiProviderError(
          `${providerLabel} rejected the request: ${detail} (model ${model})`,
          { kind: providerErrorKind(res.status) },
        );
      }
      const data = (await res.json()) as { model?: unknown; choices?: Array<{ message?: { content?: string } }> };
      // Observability: which model the upstream says actually served the call.
      if (typeof data.model === 'string' && data.model) {
        logUpstreamModel(providerLabel, model, data.model, safeHeader(res, 'x-request-id'));
      }
      const content = data.choices?.[0]?.message?.content ?? '';
      try {
        return extractJson(content);
      } catch {
        lastInvalid = new AiInvalidOutputError('LLM response was not valid JSON');
      }
    } catch (err) {
      if (err instanceof AiUnavailableError) throw err;
      if (err instanceof AiProviderError) throw err;
      if (err instanceof AiInvalidOutputError) {
        if (!err.retryable) throw err;
        lastInvalid = err;
      } else {
        throw new AiUnavailableError(
          err instanceof Error ? sanitizeSnippet(err.message) : `${providerLabel} request failed`,
        );
      }
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastInvalid ?? new AiInvalidOutputError('LLM response was not valid JSON');
}
