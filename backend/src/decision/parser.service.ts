import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AiUnavailableError, AiInvalidOutputError, errorDetail } from '../ai/errors';
import { groqCompleteJson } from '../ai/groq.provider';
import {
  AI_INVALID_OUTPUT_MESSAGE,
  AI_UNAVAILABLE_MESSAGE,
  UnknownProviderError,
  autoPriority,
  resolveSelection,
  selectionName,
  transportFor,
  withProviderFallback,
  type ProviderSelection,
} from '../ai/provider-registry';
import { apiError, notFound } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_TIMEZONE, createReference } from '../temporal/temporal';
import type { TemporalReference } from './spec';
import { buildTemporal, buildTimeRange, hasApproxMarkers } from './expression-builder';
import { ExtractionDraftSchema, sanitizeCategory, sanitizeNeedKind, sanitizeStatus, type ExtractionDraft } from './extraction';
import {
  DecisionContextV2Schema,
  type DecisionConstraint,
  type DecisionContextV2,
  type HumanNeed,
  type ResolvedTemporal,
  type ResponsibilityV2,
  type Unknown,
} from './spec';

/** Deterministic post-processor: ensures explicitly stated human needs are captured even if LLM misses them. */
function augmentHumanNeeds(rawText: string, draft: ExtractionDraft, reference: TemporalReference): ExtractionDraft {
  const lower = rawText.toLowerCase();
  const existingKinds = new Set(draft.humanNeeds.map((n) => sanitizeNeedKind(n.kind, n.description)));
  const needs: ExtractionDraft['humanNeeds'] = [...draft.humanNeeds];

  // Sleep/rest: "need to sleep", "need sleep", "sleep tonight", "sleep poorly", "rest tonight"
  const sleepPhrases = [
    'need to sleep', 'need sleep', 'sleep tonight', 'sleep poorly', 'sleep badly',
    'haven\'t slept', 'not sleeping', 'tired', 'exhausted', 'rest tonight', 'need rest',
  ];
  if (!existingKinds.has('sleep') && !existingKinds.has('rest')) {
    for (const phrase of sleepPhrases) {
      if (lower.includes(phrase)) {
        needs.push({
          kind: 'sleep',
          description: 'Sleep (explicitly stated)',
          windowText: '',
          startClock: null,
          endClock: null,
        });
        existingKinds.add('sleep');
        break;
      }
    }
  }

  // Meals: "haven't eaten", "not eaten", "need to eat", "hungry", "meal", "food", "dinner", "lunch", "breakfast"
  const mealPhrases = [
    'haven\'t eaten', 'not eaten', 'need to eat', 'need food', 'hungry',
    'haven\'t had dinner', 'haven\'t had lunch', 'haven\'t had breakfast',
    'missed dinner', 'missed lunch', 'missed breakfast', 'skip dinner', 'skip lunch', 'skip breakfast',
  ];
  if (!existingKinds.has('meals')) {
    for (const phrase of mealPhrases) {
      if (lower.includes(phrase)) {
        needs.push({
          kind: 'meals',
          description: 'Meal (explicitly stated)',
          windowText: '',
          startClock: null,
          endClock: null,
        });
        existingKinds.add('meals');
        break;
      }
    }
  }

  return { ...draft, humanNeeds: needs };
}

/** V2 parser version — stored on every DecisionContext row and AiRun. */
export const PARSER_VERSION = 'v2-parser-v1';
export const MAX_QUESTIONS = 3;

/** Timezone hierarchy: explicit request → user/profile (when available) → default. */
export function resolveTimezone(requestTz?: string, userTz?: string | null): string {
  return requestTz?.trim() || userTz?.trim() || DEFAULT_TIMEZONE;
}

const PARSER_SYSTEM_PROMPT = `You extract structured facts from an overwhelmed student's message. You do NOT recommend, prioritize, or advise.

STRICT RULES
- Quote the user's own temporal words (dayText like "tomorrow", timeText like "around 7"). Never convert to dates yourself.
- precision: "exact" only if the user gave a complete unambiguous time; "approximate" for around/about; "relative" for tomorrow/morning/Friday-style; "unknown" otherwise.
- meridiem: "am"/"pm" only if stated. If the user just says "7", use null. Never guess.
- effortMinutes: a number ONLY if the user stated one ("4 hours", "about 3 hours"). Otherwise null. Never estimate.
- effortStated: true only if the user explicitly stated a duration.
- delegationPossible: true only if the user names someone who can help; false if they say help fell through; null if unclear. delegationAgreed: true only if help is confirmed.
- category: one of academic|fellowship|business|work|personal|rest|community|other. Any responsibility area is equal — no domain is more important.
- strength for constraints: "hard" for must/cannot (sleep they refuse to cut, must-attend events); "soft" for should/shouldn't; "preference" for likes/dislikes; null when unclear.
- statusText: short phrase like "not started", "in progress", "done", "blocked", or "" when unknown.
- If the message contains an update or correction (sentences starting with "Update:"/"Correction:", or words like "actually", "correction", "changed to"), the corrected value supersedes any earlier value — report only the current value, never both.
- Quote clock ranges verbatim in timeText (e.g. "4pm to 6pm"), including the meridiem markers exactly as written. For sleep/rest windows, prefer explicit startClock/endClock with the stated meridiem (null if unstated).
- humanNeeds: sleep/rest/meals/commitments the user mentions. startClock/endClock only for explicit clock readings with their stated meridiem (null if unstated).
- Respond with a single JSON object only, no markdown fences, matching the requested schema exactly.`;

export function parseUserPrompt(rawText: string, ref: TemporalReference): string {
  const d = new Date(ref.nowIso);
  const stamp = new Intl.DateTimeFormat('en-US', {
    timeZone: ref.timezone, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(d);
  return `Current time: ${stamp} (${ref.timezone}).

Extract responsibilities, human needs, and constraints from this message.

Message: """${rawText}"""

Return JSON: {"responsibilities": [{"title": ..., "description": ..., "dayText": ..., "timeText": ..., "precision": ..., "meridiem": ..., "effortMinutes": ..., "effortStated": ..., "effortNote": ..., "category": ..., "consequence": ..., "flexibility": ..., "delegationPossible": ..., "delegationAgreed": ..., "delegationSavesMinutes": ..., "dependsOnText": ..., "statusText": ...}], "humanNeeds": [{"kind": ..., "description": ..., "windowText": ..., "startClock": ..., "endClock": ...}], "constraints": [{"description": ..., "strength": ...}]}`;
}

/** Extraction strategy. Swappable for tests; production uses the LLM. */
export interface ContextExtractor {
  readonly name: string;
  extract(rawText: string, ref: TemporalReference): Promise<ExtractionDraft>;
}

export class LlmContextExtractor implements ContextExtractor {
  /**
   * Requested label ('auto' when unconfigured); refreshed to the ACTUAL
   * provider on every successful extract() so logs and version rows report
   * what really ran. Interface stays `readonly`-compatible.
   */
  name: string;
  /** Actual model of the most recent successful extract() ('' until first success). */
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

  async extract(rawText: string, ref: TemporalReference): Promise<ExtractionDraft> {
    const { result: draft, used } = await withProviderFallback(this.selections, async (_concrete, sel) => {
      const transport = transportFor(sel);
      const raw = await transport(PARSER_SYSTEM_PROMPT, parseUserPrompt(rawText, ref));
      const parsed = ExtractionDraftSchema.safeParse(raw);
      if (!parsed.success) throw new AiInvalidOutputError(parsed.error.message);
      return parsed.data;
    });
    this.name = selectionName(used);
    this.model = used.model;
    return draft;
  }
}

export interface ParseInput {
  situationId: string;
  userId: string;
  timezone?: string;
  extractor?: ContextExtractor;
  /** Optional manual model selection. Absent = Auto mode. */
  provider?: string;
  model?: string;
}

export interface ParseResult {
  id: string;
  version: number;
  timezone: string;
  reference: TemporalReference;
  context: DecisionContextV2;
  resolutions: Record<string, ResolvedTemporal>;
  questions: string[];
  provider: string;
}

/** Actual model for AiRun attribution. Extractors without one report ''. */
function extractorModel(extractor: ContextExtractor): string {
  const m = (extractor as Partial<{ model: unknown }>).model;
  return typeof m === 'string' ? m : '';
}

@Injectable()
export class DecisionParserService {
  constructor(private readonly prisma: PrismaService) {}

  async parse(input: ParseInput): Promise<ParseResult> {
    const situation = await this.prisma.situation.findFirst({ where: { id: input.situationId, userId: input.userId } });
    if (!situation) throw notFound('Situation not found');
    // The V1 situation text is the single source of input; V2 never re-collects it.
    const rawText = situation.text;
    let reference: TemporalReference;
    try {
      reference = createReference({ timezone: resolveTimezone(input.timezone) });
    } catch {
      throw apiError('VALIDATION_ERROR', 'Invalid timezone. Use an IANA name like "Africa/Lagos".', HttpStatus.BAD_REQUEST);
    }

    const extractor = input.extractor ?? (() => {
      try {
        return new LlmContextExtractor(input.provider, input.model);
      } catch (err) {
        if (err instanceof UnknownProviderError) {
          throw apiError('VALIDATION_ERROR', err.message, HttpStatus.BAD_REQUEST);
        }
        throw err;
      }
    })();
    const started = Date.now();
    let draft: ExtractionDraft;
    try {
      draft = await extractor.extract(rawText, reference);
    } catch (err) {
      await this.logAiRun(input.situationId, extractor.name, extractorModel(extractor), err instanceof AiInvalidOutputError ? 'invalid_output' : 'unavailable', Date.now() - started, err);
      if (err instanceof AiUnavailableError) {
        throw apiError('AI_UNAVAILABLE', AI_UNAVAILABLE_MESSAGE, HttpStatus.SERVICE_UNAVAILABLE);
      }
      throw apiError('AI_INVALID_OUTPUT', AI_INVALID_OUTPUT_MESSAGE, HttpStatus.BAD_GATEWAY);
    }

    const built = this.buildContext(draft, rawText, reference);
    await this.logAiRun(input.situationId, extractor.name, extractorModel(extractor), 'ok', Date.now() - started);
    const validated = DecisionContextV2Schema.parse(built.context);

    const existing = await this.prisma.decisionContext.count({ where: { situationId: input.situationId } });
    const row = await this.prisma.decisionContext.create({
      data: {
        situationId: input.situationId,
        version: existing + 1,
        timezone: reference.timezone,
        reference: reference as unknown as Prisma.InputJsonObject,
        context: validated as unknown as Prisma.InputJsonObject,
        resolutions: built.resolutions as unknown as Prisma.InputJsonObject,
        questions: built.questions,
        provider: extractor.name,
        promptVersion: PARSER_VERSION,
      },
    });
    return {
      id: row.id,
      version: row.version,
      timezone: row.timezone,
      reference,
      context: validated,
      resolutions: built.resolutions,
      questions: built.questions,
      provider: extractor.name,
    };
  }

  private async logAiRun(
    situationId: string,
    provider: string,
    model: string,
    status: string,
    latencyMs: number,
    err?: unknown,
  ) {
    await this.prisma.aiRun
      .create({
        data: {
          situationId,
          kind: 'parse-context',
          provider,
          model,
          promptVersion: PARSER_VERSION,
          status,
          latencyMs,
          validationErrors: err === undefined ? '' : errorDetail(err).slice(0, 500),
        },
      })
      .catch(() => undefined);
  }

  /** Pure deterministic promotion of an LLM draft into the strict spec. Exported for tests. */
  buildContext(
    draft: ExtractionDraft,
    rawText: string,
    reference: TemporalReference,
  ): { context: DecisionContextV2; resolutions: Record<string, ResolvedTemporal>; questions: string[] } {
    // Deterministic augmentation: ensure explicitly stated human needs are never lost.
    draft = augmentHumanNeeds(rawText, draft, reference);
    const resolutions: Record<string, ResolvedTemporal> = {};
    const unknowns: Unknown[] = [];
    const blockingQuestions: string[] = [];
    const infoQuestions: string[] = [];

    const responsibilities: ResponsibilityV2[] = draft.responsibilities.map((d, i) => {      const { expression, resolved } = buildTemporal(
        { dayText: d.dayText, timeText: d.timeText, precision: d.precision, meridiem: d.meridiem, raw: `${d.dayText} ${d.timeText}`.trim() },
        reference,
      );
      resolutions[`responsibility:${i}:deadline`] = resolved;

      const approx = hasApproxMarkers(`${d.dayText} ${d.timeText}`);
      const precision = expression.kind === 'exact' && !approx ? 'exact'
        : expression.kind === 'unknown' ? 'unknown'
        : expression.kind === 'relative-date' || expression.kind === 'relative-time' ? 'relative'
        : 'approximate';
      const state = resolved.kind === 'needs-clarification' ? 'needs-clarification'
        : expression.kind === 'unknown' ? 'unknown'
        : expression.kind === 'exact' ? 'known'
        : 'inferred';

      if (resolved.kind === 'needs-clarification') {
        unknowns.push({ field: `${d.title}: exact time`, whyItMatters: 'AM/PM ambiguity changes the whole plan.', blocking: true });
        blockingQuestions.push(resolved.question);
      } else if (expression.kind === 'unknown') {
        unknowns.push({ field: `${d.title}: deadline`, whyItMatters: 'Cannot order or check feasibility without any timing.', blocking: false });
      }

      const effort = d.effortMinutes != null && d.effortStated
        ? { minutes: d.effortMinutes, maxMinutes: null as number | null, confidence: 'stated' as const, state: 'known' as const, note: d.effortNote }
        : { minutes: null, maxMinutes: null as number | null, confidence: 'unknown' as const, state: 'unknown' as const, note: d.effortNote };
      if (effort.minutes == null) {
        unknowns.push({ field: `${d.title}: effort`, whyItMatters: 'Feasibility cannot be computed without effort.', blocking: false });
      }

      // Must-attend markers in the user's own words upgrade unknown → fixed.
      // Never downgrades: an explicit flexible/fixed label from extraction wins.
      const FIXED_MARKERS = /\b(must attend|have to attend|need to attend|can['’]t miss|cannot miss|fixed|mandatory|have to be (there|at)|need to be (there|at)|don['’]t want to miss|do not want to miss|responsible for)\b/i;
      const mentioned = `${d.title} ${d.description}`;
      const flexibility = d.flexibility ?? (FIXED_MARKERS.test(mentioned) ? 'fixed' : 'unknown');
      // Agreed help implies possible help; a bare "possible" without agreement stays skeptical.
      const agreed = d.delegationAgreed;
      const possible = agreed ? true : d.delegationPossible;
      return {
        title: d.title,
        description: d.description,
        category: sanitizeCategory(d.category),
        deadline: { expression, precision, state },
        effort,
        consequence: d.consequence,
        consequenceKnown: d.consequence.trim().length > 0,
        flexibility,
        delegation: possible == null && !agreed && d.delegationSavesMinutes == null
          ? null
          : {
              possible: possible ?? false,
              agreed,
              savesMinutes: d.delegationSavesMinutes,
              state: possible == null ? 'unknown' as const : 'known' as const,
            },
        dependsOn: d.dependsOnText.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean).slice(0, 12),
        status: sanitizeStatus(d.statusText),
      };
    });

    const humanNeeds: HumanNeed[] = draft.humanNeeds.map((n, i) => {
      const kind = sanitizeNeedKind(n.kind, n.description);
      if (n.startClock && n.endClock) {
        const { expression, resolved } = buildTimeRange(n.startClock, n.endClock, '', n.windowText || `${n.description}`, reference);
        resolutions[`need:${i}:window`] = resolved;
        if (resolved.kind === 'needs-clarification') {
          unknowns.push({ field: `${n.description || kind}: window`, whyItMatters: 'Protected time cannot be scheduled around safely.', blocking: true });
          blockingQuestions.push(resolved.question);
        }
        return { kind, description: n.description, window: expression.kind === 'unknown' ? null : expression, state: resolved.kind === 'needs-clarification' ? 'needs-clarification' : resolved.kind === 'unresolved' ? 'unknown' : 'known' };
      }
      if (n.windowText.trim()) {
        unknowns.push({ field: `${n.description || kind}: exact window`, whyItMatters: 'Duration is unstated; do not assume one.', blocking: false });
      } else {
        unknowns.push({ field: `${n.description || kind}: window`, whyItMatters: 'Timing is unstated; protect the need without assuming a window.', blocking: false });
      }
      return { kind, description: n.description, window: null, state: 'unknown' as const };
    });

    const constraints: DecisionConstraint[] = draft.constraints.map((c) => ({
      description: c.description,
      strength: c.strength ?? 'unknown',
      state: 'known' as const,
    }));

    // Collective rule: several responsibilities, no dated anchors at all → ask for the earliest deadline.
    const dated = responsibilities.filter((r, i) => {
      const res = resolutions[`responsibility:${i}:deadline`];
      return res && (res.kind === 'instant' || res.kind === 'window');
    }).length;
    if (responsibilities.length > 1 && dated === 0) {
      unknowns.push({ field: 'earliest deadline', whyItMatters: 'Responsibilities cannot be ordered without any timing.', blocking: true });
      blockingQuestions.unshift('Which of these has the earliest deadline?');
    }
    if (responsibilities.length === 1 && dated === 0) {
      const only = unknowns.find((u) => u.field.endsWith(': deadline'));
      if (only) {
        only.blocking = true;
        infoQuestions.unshift(`When is "${responsibilities[0].title}" due?`);
      }
    } else {
      for (const u of unknowns) {
        if (!u.blocking && u.field.endsWith(': deadline')) {
          const title = u.field.slice(0, -': deadline'.length);
          infoQuestions.push(`When is "${title}" due?`);
        }
      }
    }

    const questions = [...blockingQuestions, ...infoQuestions].slice(0, MAX_QUESTIONS);
    return {
      context: { reference, rawText: rawText.slice(0, 5000), responsibilities, constraints, humanNeeds, unknowns },
      resolutions,
      questions,
    };
  }
}
