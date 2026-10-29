import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiInvalidOutputError, AiProviderError, AiUnavailableError, errorDetail, lastProviderAttempt } from './errors';
import { PROMPT_VERSION } from './groq.provider';
import {
  autoPriority,
  buildProvider,
  isAutoSelection,
  normalizeProviderError,
  resolveSelection,
  selectionName,
  UnknownProviderError,
  withProviderFallback,
  type ProviderSelection,
} from './provider-registry';
import { RuleBasedFallback } from './rule-based-fallback';
import type { ParsedContext, RecommendationDraft } from './schemas';
import { apiError } from '../common/errors';

/** Optional manual model selection. Absent = Auto mode (explicit priority order). */
export interface ModelSelectionInput {
  provider?: string;
  model?: string;
}

/**
 * Orchestrator: Auto chain (or manual selection) first, deterministic
 * fallback otherwise. Every attempt is logged to AiRun with the ACTUAL
 * provider/model used — never a credential, never user PII.
 */
@Injectable()
export class AiService {
  private readonly fallback = new RuleBasedFallback();

  constructor(private readonly prisma: PrismaService) {}

  /** Selections to try: manual single (validated) or Auto priority chain. */
  private selectionsFor(requested?: ModelSelectionInput): ProviderSelection[] {
    if (isAutoSelection(requested?.provider, requested?.model)) return autoPriority();
    try {
      return [resolveSelection(requested?.provider, requested?.model)];
    } catch (err) {
      if (err instanceof UnknownProviderError) {
        throw apiError('VALIDATION_ERROR', err.message, HttpStatus.BAD_REQUEST);
      }
      throw err;
    }
  }

  private log(run: { situationId?: string; kind: string; provider: string; model: string; status: string; latencyMs: number; validationErrors?: string }) {
    void this.prisma.aiRun
      .create({
        data: {
          situationId: run.situationId,
          kind: run.kind,
          provider: run.provider,
          model: run.model,
          promptVersion: PROMPT_VERSION,
          status: run.status,
          latencyMs: run.latencyMs,
          validationErrors: run.validationErrors ?? '',
        },
      })
      .catch(() => undefined);
  }

  private providerLabel(sel: ProviderSelection): { provider: string; model: string } {
    return { provider: selectionName(sel), model: sel.model };
  }

  /**
   * Failed-chain attribution: report the last provider/model actually tried
   * (secret-free). Falls back to 'chain' only when no attempt was recorded,
   * e.g. when no provider is configured.
   */
  private failureLabel(err: unknown): { provider: string; model: string } {
    const last = lastProviderAttempt(err);
    return last ? { provider: last.provider, model: last.model } : { provider: 'chain', model: '' };
  }

  /** Status for AiRun rows: distinguish config/auth rejection from bad output. */
  private failureStatus(err: unknown): string {
    if (err instanceof AiProviderError) return 'provider_error';
    if (err instanceof AiInvalidOutputError) return 'invalid_output';
    return 'unavailable';
  }

  async understand(
    text: string,
    situationId?: string,
    selection?: ModelSelectionInput,
  ): Promise<{ context: ParsedContext; provider: string; model: string }> {
    const started = Date.now();
    const selections = this.selectionsFor(selection);
    if (selections.length === 0) {
      // Legacy: no provider keys configured → deterministic fallback is the
      // primary; errors propagate (never silently swallowed).
      const context = await this.fallback.understand(text);
      return { context, provider: this.fallback.name, model: '' };
    }
    try {
      // Manual mode: single selection; Auto: chain advancing only on eligible failures.
      const { result: context, used } = await withProviderFallback(selections, (provider) =>
        provider.understand(text),
      );
      const label = this.providerLabel(used);
      this.log({ situationId, kind: 'understand', ...label, status: 'ok', latencyMs: Date.now() - started });
      return { context, provider: label.provider, model: label.model };
    } catch (err) {
      this.log({
        situationId,
        kind: 'understand',
        ...this.failureLabel(err),
        status: this.failureStatus(err),
        latencyMs: Date.now() - started,
        validationErrors: errorDetail(err).slice(0, 500),
      });
      const context = await this.fallback.understand(text);
      return { context, provider: this.fallback.name, model: '' };
    }
  }

  async prioritize(input: {
    situationText: string;
    context: ParsedContext;
    newInfo?: string;
    situationId?: string;
    selection?: ModelSelectionInput;
  }): Promise<{ recommendation: RecommendationDraft; provider: string; model: string }> {
    const started = Date.now();
    const selections = this.selectionsFor(input.selection);
    if (selections.length === 0) {
      // Legacy: no provider keys configured → deterministic fallback is the
      // primary; errors propagate (never silently swallowed).
      const recommendation = await this.fallback.prioritize(input);
      return { recommendation, provider: this.fallback.name, model: '' };
    }
    try {
      const { result: recommendation, used } = await withProviderFallback(selections, (provider) =>
        provider.prioritize(input),
      );
      const label = this.providerLabel(used);
      this.log({ situationId: input.situationId, kind: 'prioritize', ...label, status: 'ok', latencyMs: Date.now() - started });
      return { recommendation, provider: label.provider, model: label.model };
    } catch (err) {
      this.log({
        situationId: input.situationId,
        kind: 'prioritize',
        ...this.failureLabel(err),
        status: this.failureStatus(err),
        latencyMs: Date.now() - started,
        validationErrors: errorDetail(err).slice(0, 500),
      });
      if (err instanceof AiUnavailableError) {
        const recommendation = await this.fallback.prioritize(input);
        return { recommendation, provider: this.fallback.name, model: '' };
      }
      // Provider auth/config rejection: safe, accurate classification. Raw
      // upstream detail stays in logs/AiRun, never in the response.
      if (err instanceof AiProviderError) {
        const { code, message, status } = normalizeProviderError(err);
        throw apiError(code, message, status as HttpStatus);
      }
      throw err;
    }
  }
}
