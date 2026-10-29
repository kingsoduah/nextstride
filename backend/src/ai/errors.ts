export interface AiProviderAttempt {
  provider: string;
  model: string;
}

export class AiUnavailableError extends Error {
  constructor(message = 'AI provider unavailable') {
    super(message);
    this.name = 'AiUnavailableError';
  }
}

export class AiInvalidOutputError extends Error {
  details: string;
  /** False when retrying the same request cannot help (e.g. a non-retryable rejection). */
  readonly retryable: boolean;
  constructor(details: string, options?: { retryable?: boolean }) {
    super('AI returned invalid structured output');
    this.name = 'AiInvalidOutputError';
    this.details = details;
    this.retryable = options?.retryable ?? true;
  }
}

export type AiProviderErrorKind = 'auth' | 'configuration' | 'request';

/**
 * A non-retryable provider rejection. This is deliberately separate from
 * AiInvalidOutputError: a 401/403/404 is an account/model configuration
 * problem, not malformed model output, and must not be described to users as
 * "unusable output" or retried against the same provider.
 */
export class AiProviderError extends Error {
  details: string;
  readonly kind: AiProviderErrorKind;
  readonly retryable = false;

  constructor(details: string, options?: { kind?: AiProviderErrorKind }) {
    super('AI provider rejected the request');
    this.name = 'AiProviderError';
    this.details = details;
    this.kind = options?.kind ?? 'request';
  }
}

export function providerErrorKind(status: number): AiProviderErrorKind {
  if (status === 401 || status === 403) return 'auth';
  if (status === 400 || status === 404 || status === 422) return 'configuration';
  return 'request';
}

type AttemptTagged = { aiAttempts?: AiProviderAttempt[] };

/** Attach the attempted selections to an error for secret-free diagnostics. */
export function attachProviderAttempts<T extends Error>(err: T, attempts: AiProviderAttempt[]): T {
  if (attempts.length === 0) return err;
  (err as T & AttemptTagged).aiAttempts = attempts.map(({ provider, model }) => ({ provider, model }));
  return err;
}

export function providerAttempts(err: unknown): AiProviderAttempt[] {
  if (!(err instanceof Error)) return [];
  const attempts = (err as Error & AttemptTagged).aiAttempts;
  return Array.isArray(attempts) ? attempts : [];
}

export function lastProviderAttempt(err: unknown): AiProviderAttempt | null {
  const attempts = providerAttempts(err);
  return attempts.length > 0 ? attempts[attempts.length - 1] : null;
}

/**
 * Remove credential-shaped values before text reaches logs, AiRun rows, or
 * client-visible messages. Covers the key formats used by this project:
 * Groq (`gsk_...`), Google (`AIza...`), OpenRouter/OpenAI (`sk-...`), Bearer
 * headers, and env-style `KEY=value` / `api_key: value` pairs.
 */
export function redactSecrets(text: string): string {
  return text
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/\bgsk_[A-Za-z0-9_-]{8,}\b/g, '[redacted]')
    .replace(/\bsk-[A-Za-z0-9_-]{8,}/g, '[redacted]')
    .replace(/\bAIza[0-9A-Za-z_-]{20,}\b/g, '[redacted]')
    .replace(/\bkey=[A-Za-z0-9._-]+/gi, 'key=[redacted]')
    .replace(
      /\b(?:api[_-]?key|access[_-]?token|token|secret)\s*[:=]\s*["']?[A-Za-z0-9._~+/=-]{8,}["']?/gi,
      '[redacted]',
    );
}

/**
 * Full diagnostic text for logs / AiRun rows. `AiInvalidOutputError` keeps a
 * stable `message` for callers but stores the concrete cause in `details`
 * (upstream status, request id, Zod issues). Without this the real cause —
 * e.g. an upstream 400 "not a valid model ID" — never reaches the logs and
 * every failure looks like a generic formatting slip. Attempts and secrets
 * are safe to record; user text is never added here.
 */
export function errorDetail(err: unknown): string {
  if (!(err instanceof Error)) return 'unknown';
  const details = (err as { details?: unknown }).details;
  const base = typeof details === 'string' && details.trim()
    ? `${err.message}: ${details}`
    : err.message;
  const attempts = providerAttempts(err);
  const attribution = attempts.length > 0
    ? ` [attempts: ${attempts.map((a) => `${a.provider}/${a.model}`).join(', ')}]`
    : '';
  return redactSecrets(`${base}${attribution}`);
}
