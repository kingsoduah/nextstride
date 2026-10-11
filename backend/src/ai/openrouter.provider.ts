import { Injectable } from '@nestjs/common';
import type { AiProvider } from './ai-provider.interface';
import { AiInvalidOutputError, AiUnavailableError } from './errors';
import { openAiCompatibleCompleteJson } from './openai-compatible';
import { PROMPT_VERSION, prioritizeUserPrompt, SYSTEM_PROMPT, understandUserPrompt } from './prompts';
import { ParsedContext, RecommendationSchema, SituationContextSchema } from './schemas';

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

/** Allowlisted OpenRouter free models for Phase 8.5 evaluation.
 *  IDs verified against the live OpenRouter /models catalogue (458 models)
 *  AND against the live API:
 *  - `inclusionai/ling-3.1-flash:free` / `inclusionai/ling-mini:free` do NOT
 *    exist (400 "is not a valid model ID") — InclusionAI publishes no free tier.
 *  - `thinkingmachines/inkling:free` exists but is gated to agentic harnesses
 *    (403), so it is unusable from this server-side call path.
 *  - `google/gemma-4-26b-a4b-it:free` is valid (currently upstream rate-limited).
 *  - `nvidia/nemotron-3-super-120b-a12b:free` returned 200 with schema-valid
 *    output in a live fictional-input test. */
export const OPENROUTER_FREE_MODELS = [
  'nvidia/nemotron-3-super-120b-a12b:free',
  'google/gemma-4-26b-a4b-it:free',
] as const;

export type OpenRouterFreeModel = (typeof OPENROUTER_FREE_MODELS)[number];

export function isOpenRouterFreeModel(model: string): model is OpenRouterFreeModel {
  return (OPENROUTER_FREE_MODELS as readonly string[]).includes(model);
}

/**
 * OpenRouter-backed provider (OpenAI-compatible Chat Completions).
 * Same prompts and Zod contracts as Groq; only the transport differs.
 * Free-tier models vary in structured-output discipline, so `jsonMode` is
 * NOT assumed — callers pass support explicitly. Output is always
 * Zod-validated; raw text never escapes.
 */
@Injectable()
export class OpenRouterProvider implements AiProvider {
  readonly name: string;

  constructor(
    private readonly model: OpenRouterFreeModel,
    private readonly jsonMode = false,
  ) {
    this.name = `openrouter:${model}`;
  }

  private completeJson(systemPrompt: string, userPrompt: string): Promise<unknown> {
    const apiKey = process.env.OPENROUTER_API_KEY;
    // Missing key surfaces as unavailable (eligible for chain fallback).
    if (!apiKey) throw new AiUnavailableError('OPENROUTER_API_KEY is not configured');
    return openAiCompatibleCompleteJson({
      baseUrl: OPENROUTER_BASE_URL,
      apiKey,
      model: this.model,
      systemPrompt,
      userPrompt,
      jsonMode: this.jsonMode,
      providerLabel: 'OpenRouter',
    });
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
