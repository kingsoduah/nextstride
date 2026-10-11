export class AiUnavailableError extends Error {
  constructor(message = 'AI provider unavailable') {
    super(message);
    this.name = 'AiUnavailableError';
  }
}

export class AiInvalidOutputError extends Error {
  details: string;
  constructor(details: string) {
    super('AI returned invalid structured output');
    this.name = 'AiInvalidOutputError';
    this.details = details;
  }
}

/**
 * Full diagnostic text for logs / AiRun rows. `AiInvalidOutputError` keeps a
 * stable `message` for callers but stores the concrete cause in `details`
 * (upstream status, request id, Zod issues). Without this the real cause —
 * e.g. an upstream 400 "not a valid model ID" — never reaches the logs and
 * every failure looks like a generic formatting slip.
 */
export function errorDetail(err: unknown): string {
  if (!(err instanceof Error)) return 'unknown';
  const details = (err as { details?: unknown }).details;
  if (typeof details === 'string' && details.trim()) return `${err.message}: ${details}`;
  return err.message;
}
