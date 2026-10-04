import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AiProvider } from './ai-provider.interface';
import { AiInvalidOutputError, AiUnavailableError } from './errors';
import { GroqProvider, PROMPT_VERSION } from './groq.provider';
import { RuleBasedFallback } from './rule-based-fallback';
import type { ParsedContext, RecommendationDraft } from './schemas';

/**
 * Orchestrator: Groq first (when configured), deterministic fallback otherwise.
 * Every attempt is logged to AiRun without user PII. Raw LLM output is never persisted.
 */
@Injectable()
export class AiService {
  private readonly groq = new GroqProvider();
  private readonly fallback = new RuleBasedFallback();

  constructor(private readonly prisma: PrismaService) {}

  private provider(): AiProvider {
    return process.env.GROQ_API_KEY ? this.groq : this.fallback;
  }

  private log(run: { situationId?: string; kind: string; status: string; latencyMs: number; validationErrors?: string }) {
    void this.prisma.aiRun
      .create({
        data: {
          situationId: run.situationId,
          kind: run.kind,
          provider: process.env.GROQ_API_KEY ? 'groq' : 'rule-based-fallback',
          model: process.env.GROQ_MODEL ?? '',
          promptVersion: PROMPT_VERSION,
          status: run.status,
          latencyMs: run.latencyMs,
          validationErrors: run.validationErrors ?? '',
        },
      })
      .catch(() => undefined);
  }

  async understand(text: string, situationId?: string): Promise<{ context: ParsedContext; provider: string }> {
    const started = Date.now();
    const primary = this.provider();
    try {
      const context = await primary.understand(text);
      this.log({ situationId, kind: 'understand', status: 'ok', latencyMs: Date.now() - started });
      return { context, provider: primary.name };
    } catch (err) {
      const invalid = err instanceof AiInvalidOutputError;
      this.log({
        situationId,
        kind: 'understand',
        status: invalid ? 'invalid_output' : 'unavailable',
        latencyMs: Date.now() - started,
        validationErrors: err instanceof Error ? err.message.slice(0, 500) : 'unknown',
      });
      if (primary === this.fallback) throw err;
      const context = await this.fallback.understand(text);
      return { context, provider: this.fallback.name };
    }
  }

  async prioritize(input: {
    situationText: string;
    context: ParsedContext;
    newInfo?: string;
    situationId?: string;
  }): Promise<{ recommendation: RecommendationDraft; provider: string }> {
    const started = Date.now();
    const primary = this.provider();
    try {
      const recommendation = await primary.prioritize(input);
      this.log({ situationId: input.situationId, kind: 'prioritize', status: 'ok', latencyMs: Date.now() - started });
      return { recommendation, provider: primary.name };
    } catch (err) {
      if (err instanceof AiUnavailableError) {
        this.log({ situationId: input.situationId, kind: 'prioritize', status: 'unavailable', latencyMs: Date.now() - started, validationErrors: err.message.slice(0, 500) });
        if (primary === this.fallback) throw err;
        const recommendation = await this.fallback.prioritize(input);
        return { recommendation, provider: this.fallback.name };
      }
      this.log({ situationId: input.situationId, kind: 'prioritize', status: 'invalid_output', latencyMs: Date.now() - started, validationErrors: err instanceof Error ? err.message.slice(0, 500) : 'unknown' });
      throw err;
    }
  }
}
