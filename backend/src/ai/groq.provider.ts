import { Injectable } from '@nestjs/common';
import type { AiProvider } from './ai-provider.interface';
import { AiInvalidOutputError, AiUnavailableError } from './errors';
import { openAiCompatibleCompleteJson } from './openai-compatible';
import { PROMPT_VERSION, prioritizeUserPrompt, SYSTEM_PROMPT, understandUserPrompt } from './prompts';
import { ParsedContext, RecommendationSchema, SituationContextSchema } from './schemas';

export const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
/**
 * Default Groq model. `openai/gpt-oss-120b` was verified against this
 * account's live `/openai/v1/models` catalogue (11 models; 120b available)
 * and returned a schema-valid structured response for a fictional scenario.
 * Overridable via GROQ_MODEL.
 */
export const GROQ_DEFAULT_MODEL = 'openai/gpt-oss-120b';

export function groqConfiguredModel(): string {
  return process.env.GROQ_MODEL ?? GROQ_DEFAULT_MODEL;
}

/**
 * Shared Groq JSON call. Used by the V1 provider and the V2 parser alike.
 * Robustness: strips markdown fences / surrounding prose and retries once on
 * malformed JSON (transient model formatting slips). Success-path behavior
 * is identical to before; only the failure path is more forgiving.
 *
 * Phase 8.5: delegates to the shared OpenAI-compatible transport. Behavior
 * preserved exactly: json_object response_format, 2 attempts, 30s timeout,
 * 4xx (non-429) surfaced as invalid output (ineligible for silent fallback).
 */
export async function groqCompleteJson(systemPrompt: string, userPrompt: string, model?: string): Promise<unknown> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new AiUnavailableError('GROQ_API_KEY is not configured');
  return openAiCompatibleCompleteJson({
    baseUrl: GROQ_BASE_URL,
    apiKey,
    model: model ?? groqConfiguredModel(),
    systemPrompt,
    userPrompt,
    jsonMode: true,
    providerLabel: 'Groq',
  });
}

/** Groq-backed provider. Output is always Zod-validated; raw text never escapes. */
@Injectable()
export class GroqProvider implements AiProvider {
  readonly name: string;

  constructor(private readonly modelOverride?: string) {
    const model = modelOverride ?? groqConfiguredModel();
    // Bare historical name when running the configured model (matches selectionName).
    this.name = modelOverride == null || modelOverride === groqConfiguredModel() ? 'groq' : `groq:${model}`;
  }

  private get model(): string {
    return this.modelOverride ?? groqConfiguredModel();
  }

  private completeJson(userPrompt: string): Promise<unknown> {
    return groqCompleteJson(SYSTEM_PROMPT, userPrompt, this.model);
  }

  async understand(text: string): Promise<ParsedContext> {
    const raw = await this.completeJson(understandUserPrompt(text));
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
      prioritizeUserPrompt(input.situationText, input.context, input.newInfo),
    );
    const parsed = RecommendationSchema.safeParse(raw);
    if (!parsed.success) throw new AiInvalidOutputError(parsed.error.message);
    return parsed.data;
  }
}

export { PROMPT_VERSION };
