import { Injectable, Logger } from '@nestjs/common';
import type { AiProvider } from './ai-provider.interface';
import { AiInvalidOutputError, AiProviderError, AiUnavailableError, providerErrorKind } from './errors';
import { extractJson, sanitizeSnippet, upstreamDetail } from './openai-compatible';
import { PROMPT_VERSION, prioritizeUserPrompt, SYSTEM_PROMPT, understandUserPrompt } from './prompts';
import { ParsedContext, RecommendationSchema, SituationContextSchema } from './schemas';

const transportLog = new Logger('ai-transport');

/** One bounded retry for 429/5xx and fast network errors; never for timeouts. */
const TRANSIENT_RETRY_MS = 250;
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

export const GEMINI_DEFAULT_MODEL = 'gemini-3.1-flash-lite';

export function geminiConfiguredModel(): string {
  return process.env.GEMINI_MODEL ?? GEMINI_DEFAULT_MODEL;
}

interface GeminiPart {
  text?: string;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: GeminiPart[] };
    finishReason?: string;
  }>;
  error?: { code?: number; message?: string; status?: string };
}

function extractText(data: GeminiResponse, model: string): string {
  const candidate = data.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  const text = parts.map((p) => p.text ?? '').join('').trim();
  if (text) return text;
  const reason = candidate?.finishReason ?? 'unknown';
  throw new AiInvalidOutputError(`Gemini returned no text (model ${model}, finishReason ${reason})`);
}

export async function geminiCompleteJson(
  systemPrompt: string,
  userPrompt: string,
  model: string,
  timeoutMs = 30_000,
  maxAttempts = 2,
): Promise<unknown> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new AiUnavailableError('Gemini is not configured');
  const url = `${GEMINI_BASE_URL}/models/${model}:generateContent`;
  let lastInvalid: AiInvalidOutputError | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      let res: Response;
      try {
        res = await fetch(url, {
          method: 'POST',
          signal: controller.signal,
          // Key in header (never in URL, never logged).
          headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [{ parts: [{ text: userPrompt }] }],
            generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
          }),
        });
      } catch (err) {
        const aborted = err instanceof Error && err.name === 'AbortError';
        if (!aborted && attempt < maxAttempts) {
          transportLog.warn(`Gemini network failure; retrying (${attempt}/${maxAttempts})`);
          await sleep(TRANSIENT_RETRY_MS * attempt);
          continue;
        }
        throw new AiUnavailableError(
          aborted
            ? `Gemini request timed out (model ${model})`
            : `Gemini request failed (model ${model})`,
        );
      }
      if (!res.ok) {
        const detail = await upstreamDetail(res);
        if (res.status === 429 || (res.status >= 500 && res.status <= 599)) {
          const message = `Gemini request failed: ${detail} (model ${model})`;
          if (attempt < maxAttempts) {
            transportLog.warn(`${message}; retrying (${attempt}/${maxAttempts})`);
            await sleep(TRANSIENT_RETRY_MS * attempt);
            continue;
          }
          transportLog.warn(message);
          throw new AiUnavailableError(message);
        }
        throw new AiProviderError(
          `Gemini rejected the request: ${detail} (model ${model})`,
          { kind: providerErrorKind(res.status) },
        );
      }
      const data = (await res.json()) as GeminiResponse;
      try {
        return extractJson(extractText(data, model));
      } catch (err) {
        if (err instanceof AiInvalidOutputError) {
          if (!err.retryable) throw err;
          lastInvalid = err;
        } else {
          lastInvalid = new AiInvalidOutputError('LLM response was not valid JSON');
        }
      }
    } catch (err) {
      if (err instanceof AiUnavailableError) throw err;
      if (err instanceof AiProviderError) throw err;
      if (err instanceof AiInvalidOutputError) {
        if (!err.retryable) throw err;
        lastInvalid = err;
      } else {
        throw new AiUnavailableError(
          sanitizeSnippet(err instanceof Error ? err.message : 'Gemini request failed'),
        );
      }
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastInvalid ?? new AiInvalidOutputError('LLM response was not valid JSON');
}

/**
 * Gemini-backed provider. Same prompts and Zod contracts as every other
 * provider; only the transport differs. Output is always Zod-validated;
 * raw text never escapes. Requests route exclusively through GEMINI_API_KEY.
 */
@Injectable()
export class GeminiProvider implements AiProvider {
  readonly name: string;

  constructor(private readonly modelOverride?: string) {
    const model = modelOverride ?? geminiConfiguredModel();
    // Bare name when running the configured model (consistent with Groq).
    this.name = modelOverride == null || modelOverride === geminiConfiguredModel() ? 'gemini' : `gemini:${model}`;
  }

  private get model(): string {
    return this.modelOverride ?? geminiConfiguredModel();
  }

  private completeJson(systemPrompt: string, userPrompt: string): Promise<unknown> {
    return geminiCompleteJson(systemPrompt, userPrompt, this.model);
  }

  async understand(text: string): Promise<ParsedContext> {
    const raw = await this.completeJson(SYSTEM_PROMPT, understandUserPrompt(text));
    const parsed = SituationContextSchema.safeParse(raw);
    if (!parsed.success) throw new AiInvalidOutputError(parsed.error.message);
    return parsed.data;
  }

  async prioritize(input: {
    situationText: string;
    context: ParsedContext;
    newInfo?: string;
  }): Promise<import('./schemas').RecommendationDraft> {
    const raw = await this.completeJson(
      SYSTEM_PROMPT,
      prioritizeUserPrompt(input.situationText, input.context, input.newInfo),
    );
    const parsed = RecommendationSchema.safeParse(raw);
    if (!parsed.success) throw new AiInvalidOutputError(parsed.error.message);
    return parsed.data;
  }
}

export { PROMPT_VERSION };
