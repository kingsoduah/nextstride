import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AiInvalidOutputError, AiUnavailableError, errorDetail } from '../ai/errors';
import { groqCompleteJson } from '../ai/groq.provider';
import {
  UnknownProviderError,
  autoPriority,
  resolveSelection,
  selectionName,
  transportFor,
  withProviderFallback,
  type ProviderSelection,
} from '../ai/provider-registry';
import { analyzeDecisionContext } from '../analysis/engine';
import type { StoredResolutions } from '../analysis/engine';
import { DecisionAnalysisV2Schema } from '../analysis/analysis';
import type { DecisionAnalysisV2 } from '../analysis/analysis';
import { apiError, notFound } from '../common/errors';
import type { DecisionContextV2 } from '../decision/spec';
import { DecisionContextV2Schema } from '../decision/spec';
import { PrismaService } from '../prisma/prisma.service';
import { diffAnalyses } from './diff';
import type { AnalysisDiff } from './diff';
import { FallbackRecommender } from './fallback';
import { REASONING_VERSION, REASONING_SYSTEM_PROMPT, buildReasoningPrompt } from './reasoning-prompts';
import type { ReasoningInput } from './reasoning-prompts';
import { RecommendationStatusSchema, RecommendationV2Schema } from './recommendation';
import type { RecommendationStatus, RecommendationV2 } from './recommendation';

/** Reasoning strategy. Swappable for tests; production uses the LLM. */
export interface ReasoningExtractor {
  readonly name: string;
  reason(input: ReasoningInput): Promise<unknown>;
}

export class LlmReasoner implements ReasoningExtractor {
  /**
   * Requested label ('auto' when unconfigured); refreshed to the ACTUAL
   * provider on every successful reason() so logs and version rows report
   * what really ran. `model` tracks the actual model likewise.
   */
  name: string;
  model: string;
  private readonly selections: ProviderSelection[];

  constructor(provider?: string, model?: string) {
    if (provider == null && model == null) {
      this.selections = autoPriority();
      this.name = 'auto';
      this.model = '';
    } else {
      const sel = resolveSelection(provider, model);
      this.selections = [sel];
      this.name = selectionName(sel);
      this.model = sel.model;
    }
  }

  async reason(input: ReasoningInput): Promise<unknown> {
    const { result, used } = await withProviderFallback(this.selections, async (_concrete, sel) => {
      const transport = transportFor(sel);
      return transport(REASONING_SYSTEM_PROMPT, buildReasoningPrompt(input));
    });
    this.name = selectionName(used);
    this.model = used.model;
    return result;
  }
}

export interface RecommendInput {
  situationId: string;
  userId: string;
  contextVersion?: number;
  nowIso?: string;
  timezone?: string;
  extractor?: ReasoningExtractor;
  /** Optional manual model selection. Absent = Auto mode. */
  provider?: string;
  model?: string;
}

/**
 * Deterministic status guardrails applied AFTER Zod validation.
 * The model proposes; the analysis disposes. Pure — unit-tested directly.
 */
export function applyStatusGuardrails(
  draft: RecommendationV2,
  analysis: DecisionAnalysisV2,
  reassessment: { previousExists: boolean; materialChange: boolean },
): RecommendationV2 {
  if (analysis.blockingUnknowns.length > 0 && draft.status !== 'NEEDS_INPUT') {
    return { ...draft, status: 'NEEDS_INPUT' };
  }
  if (
    draft.status === 'RECOMMEND' &&
    analysis.responsibilityAnalysis.some((r) => r.feasibility === 'INFEASIBLE')
  ) {
    return { ...draft, status: 'INFEASIBLE' };
  }
  if (reassessment.previousExists && reassessment.materialChange && draft.status === 'RECOMMEND') {
    return { ...draft, status: 'REASSESS' };
  }
  const parsed = RecommendationStatusSchema.safeParse(draft.status);
  if (!parsed.success) return { ...draft, status: 'RECOMMEND' };
  return draft;
}

@Injectable()
export class RecommendationService {
  constructor(private readonly prisma: PrismaService) {}

  async recommend(input: RecommendInput): Promise<{
    id: string;
    version: number;
    status: RecommendationStatus;
    provider: string;
    recommendation: RecommendationV2;
  }> {
    const situation = await this.prisma.situation.findFirst({
      where: { id: input.situationId, userId: input.userId },
    });
    if (!situation) throw notFound('Situation not found');

    const ctxRow = input.contextVersion != null
      ? await this.prisma.decisionContext.findFirst({
        where: { situationId: input.situationId, version: input.contextVersion },
      })
      : await this.prisma.decisionContext.findFirst({
        where: { situationId: input.situationId },
        orderBy: { version: 'desc' },
      });
    if (!ctxRow) throw notFound('No decision context yet — parse one first');
    const ctxParsed = DecisionContextV2Schema.safeParse(ctxRow.context);
    if (!ctxParsed.success) {
      throw apiError('VALIDATION_ERROR', 'Stored context is invalid', HttpStatus.UNPROCESSABLE_ENTITY);
    }
    const context: DecisionContextV2 = ctxParsed.data;

    let analysis: DecisionAnalysisV2;
    try {
      const hasOverride = input.nowIso != null || input.timezone != null;
      const stored = hasOverride ? undefined : (ctxRow.resolutions as unknown as StoredResolutions);
      analysis = analyzeDecisionContext(
        context,
        { nowIso: input.nowIso, timezone: input.timezone ?? ctxRow.timezone },
        stored,
      );
    } catch (err) {
      throw apiError('VALIDATION_ERROR', err instanceof Error ? err.message : 'Invalid clock override', HttpStatus.BAD_REQUEST);
    }

    const previous = await this.prisma.recommendationV2.findFirst({
      where: { situationId: input.situationId },
      orderBy: { version: 'desc' },
    });
    let previousAnalysis: DecisionAnalysisV2 | undefined;
    let previousPayload: Record<string, unknown> | undefined;
    if (previous) {
      const pa = DecisionAnalysisV2Schema.safeParse(previous.analysis);
      if (pa.success) previousAnalysis = pa.data;
      try {
        previousPayload = JSON.parse(JSON.stringify(previous.payload)) as Record<string, unknown>;
      } catch {
        previousPayload = undefined;
      }
    }
    const diff: AnalysisDiff | undefined = previousAnalysis
      ? diffAnalyses(previousAnalysis, analysis)
      : undefined;

    const extractor = input.extractor ?? (() => {
      try {
        return new LlmReasoner(input.provider, input.model);
      } catch (err) {
        if (err instanceof UnknownProviderError) {
          throw apiError('VALIDATION_ERROR', err.message, HttpStatus.BAD_REQUEST);
        }
        throw err;
      }
    })();
    const started = Date.now();
    const reasoningInput: ReasoningInput = {
      situationText: situation.text,
      context,
      analysis,
      previous: previousPayload && previousAnalysis && diff
        ? { recommendation: previousPayload, analysis: previousAnalysis, diffSummary: diff }
        : undefined,
    };

    let draft: RecommendationV2;
    let provider = extractor.name;
    let model = extractorModel(extractor);
    try {
      draft = await this.extractValidated(extractor, reasoningInput);
      // Re-read: Auto mode may have advanced to a different provider.
      provider = extractor.name;
      model = extractorModel(extractor);
      await this.logAiRun(input.situationId, provider, model, 'ok', Date.now() - started);
    } catch (err) {
      if (err instanceof AiUnavailableError) {
        await this.logAiRun(input.situationId, provider, model, 'unavailable', Date.now() - started, err);
        draft = FallbackRecommender.build(context, analysis);
        provider = FallbackRecommender.name;
        model = '';
        await this.logAiRun(input.situationId, provider, model, 'ok-fallback', Date.now() - started);
      } else {
        await this.logAiRun(
          input.situationId, provider, model, 'invalid_output', Date.now() - started,
          err instanceof Error ? err : undefined,
        );
        draft = FallbackRecommender.build(context, analysis);
        provider = FallbackRecommender.name;
        model = '';
        await this.logAiRun(input.situationId, provider, model, 'ok-fallback', Date.now() - started);
      }
    }

    const guarded = applyStatusGuardrails(draft, analysis, {
      previousExists: previous != null,
      materialChange: diff?.materialChange ?? false,
    });
    const finalParsed = RecommendationV2Schema.safeParse(guarded);
    if (!finalParsed.success) {
      // Defensive: fallback output is constructed valid; this signals an internal bug.
      throw apiError('AI_INVALID_OUTPUT', 'Recommendation failed validation.', HttpStatus.BAD_GATEWAY);
    }

    const existing = await this.prisma.recommendationV2.count({ where: { situationId: input.situationId } });
    const row = await this.prisma.recommendationV2.create({
      data: {
        situationId: input.situationId,
        version: existing + 1,
        contextVersion: ctxRow.version,
        analysis: analysis as unknown as Prisma.InputJsonObject,
        payload: finalParsed.data as unknown as Prisma.InputJsonObject,
        status: finalParsed.data.status,
        previousId: previous?.id ?? null,
        provider,
        promptVersion: provider === FallbackRecommender.name ? 'fallback-v1' : REASONING_VERSION,
      },
    });
    return {
      id: row.id,
      version: row.version,
      status: finalParsed.data.status,
      provider,
      recommendation: finalParsed.data,
    };
  }

  /** One LLM attempt plus one retry on schema/shape failure; other errors propagate. */
  private async extractValidated(extractor: ReasoningExtractor, input: ReasoningInput): Promise<RecommendationV2> {
    let lastErr: unknown = null;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      let raw: unknown;
      try {
        raw = await extractor.reason(input);
      } catch (err) {
        if (err instanceof AiInvalidOutputError) {
          lastErr = err;
          continue;
        }
        throw err;
      }
      const parsed = RecommendationV2Schema.safeParse(raw);
      if (parsed.success) return parsed.data;
      lastErr = new AiInvalidOutputError(parsed.error.message);
    }
    throw lastErr instanceof Error ? lastErr : new AiInvalidOutputError('Recommendation failed validation');
  }

  private async logAiRun(situationId: string, provider: string, model: string, status: string, latencyMs: number, err?: unknown) {
    await this.prisma.aiRun
      .create({
        data: {
          situationId,
          kind: 'recommend-v2',
          provider,
          model,
          promptVersion: REASONING_VERSION,
          status,
          latencyMs,
          validationErrors: err === undefined ? '' : errorDetail(err).slice(0, 500),
        },
      })
      .catch(() => undefined);
  }
}

/** Actual model for AiRun attribution. Test stubs carry name only → ''. */
function extractorModel(extractor: ReasoningExtractor): string {
  const m = (extractor as Partial<{ model: unknown }>).model;
  return typeof m === 'string' ? m : '';
}
