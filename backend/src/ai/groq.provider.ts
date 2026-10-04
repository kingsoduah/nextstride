import { Injectable } from '@nestjs/common';
import type { AiProvider } from './ai-provider.interface';
import { AiInvalidOutputError, AiUnavailableError } from './errors';
import { PROMPT_VERSION, prioritizeUserPrompt, SYSTEM_PROMPT, understandUserPrompt } from './prompts';
import { ParsedContext, RecommendationSchema, SituationContextSchema } from './schemas';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

/** Groq-backed provider. Output is always Zod-validated; raw text never escapes. */
@Injectable()
export class GroqProvider implements AiProvider {
  readonly name = 'groq';

  private get model(): string {
    return process.env.GROQ_MODEL ?? 'openai/gpt-oss-20b';
  }

  private async completeJson(userPrompt: string): Promise<unknown> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new AiUnavailableError('GROQ_API_KEY is not configured');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const res = await fetch(GROQ_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
        }),
      });
      if (!res.ok) throw new AiUnavailableError(`Groq request failed with status ${res.status}`);
      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const content = data.choices?.[0]?.message?.content ?? '';
      try {
        return JSON.parse(content) as unknown;
      } catch {
        throw new AiInvalidOutputError('LLM response was not valid JSON');
      }
    } catch (err) {
      if (err instanceof AiUnavailableError || err instanceof AiInvalidOutputError) throw err;
      throw new AiUnavailableError(err instanceof Error ? err.message : 'Groq request failed');
    } finally {
      clearTimeout(timeout);
    }
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
