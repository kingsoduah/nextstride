import { z } from 'zod';

/**
 * NextStride V2 — Phase 1: Decision Specification.
 *
 * Defines EXACTLY what the system must understand before recommending.
 * These are contracts only: nothing here performs parsing (Phase 2),
 * calculations (Phase 3), or LLM reasoning (Phase 4).
 *
 * Core rules encoded by these types:
 * - Precision is preserved, never invented ("around 7" !== "7:00 exact").
 * - Effort may be unknown (null + state), never fabricated.
 * - Constraints carry strength (hard/soft/preference/unknown).
 * - Every field carries a decision state: known, inferred, unknown,
 *   or needs-clarification.
 */

// ---------------------------------------------------------------------------
// Decision states: how confident the system is about any single fact.
// - known: stated by the user or read from a trusted source.
// - inferred: reasonably derived (e.g. "tomorrow" from a reference date).
// - unknown: not provided and not inferable — must be represented, not filled.
// - needs-clarification: ambiguous AND material to the decision (ask the user).
// ---------------------------------------------------------------------------
export const DecisionStateSchema = z.enum(['known', 'inferred', 'unknown', 'needs-clarification']);
export type DecisionState = z.infer<typeof DecisionStateSchema>;

// ---------------------------------------------------------------------------
// Temporal model: how a deadline/commitment is expressed in human language.
// Exact instants and uncertain windows are different types on purpose —
// collapsing "around 7" into an exact 7:00 is forbidden by construction.
// ---------------------------------------------------------------------------
export const DeadlinePrecisionSchema = z.enum(['exact', 'approximate', 'relative', 'unknown']);
export type DeadlinePrecision = z.infer<typeof DeadlinePrecisionSchema>;

export const ExactTemporalSchema = z.object({
  kind: z.literal('exact'),
  /** Full ISO instant with offset, e.g. "2026-10-06T07:00:00+01:00". */
  instantIso: z.string().min(1).max(64),
});

export const ApproximateTemporalSchema = z.object({
  kind: z.literal('approximate'),
  /** Best-guess centre of the window, ISO instant. Never presented as exact. */
  centreIso: z.string().min(1).max(64),
  /** Half-width of the uncertainty window in minutes (e.g. "around 7" → 30). */
  toleranceMinutes: z.number().int().min(0).max(12 * 60),
  raw: z.string().max(200).default(''),
});

export const RelativeDateTemporalSchema = z.object({
  kind: z.literal('relative-date'),
  /** "tomorrow" | "friday" | weekday name | "in-N-days" | "this-week" | "weekend" ... */
  expression: z.string().min(1).max(64),
  raw: z.string().max(200).default(''),
});

export const RelativeTimeTemporalSchema = z.object({
  kind: z.literal('relative-time'),
  /** "morning" | "afternoon" | "evening" | "night" | "around-7" | clock "7" ... */
  expression: z.string().min(1).max(64),
  /** Meridiem when stated; null when the user did not say (do NOT guess). */
  meridiem: z.enum(['am', 'pm']).nullable().default(null),
  raw: z.string().max(200).default(''),
});

export const EventRelativeTemporalSchema = z.object({
  kind: z.literal('event-relative'),
  /** "after class" | "before church" | "when I wake up" — anchored to another event. */
  anchorEvent: z.string().min(1).max(200),
  relation: z.enum(['after', 'before', 'during']),
  raw: z.string().max(200).default(''),
});

export const UnknownTemporalSchema = z.object({
  kind: z.literal('unknown'),
  raw: z.string().max(200).default(''),
});

/**
 * Phase 2 addition: an explicit clock range on (optionally) a stated day,
 * e.g. "sleep from midnight to 6". Both ends are wall-clock readings;
 * meridiem may be null per end (ambiguity preserved, never guessed).
 */
export const TimeRangeTemporalSchema = z.object({
  kind: z.literal('time-range'),
  startClock: z.object({
    hour: z.number().int().min(1).max(12),
    minute: z.number().int().min(0).max(59).default(0),
    meridiem: z.enum(['am', 'pm']).nullable().default(null),
  }),
  endClock: z.object({
    hour: z.number().int().min(1).max(12),
    minute: z.number().int().min(0).max(59).default(0),
    meridiem: z.enum(['am', 'pm']).nullable().default(null),
  }),
  dayText: z.string().max(64).default(''),
  raw: z.string().max(200).default(''),
});

export const TemporalExpressionSchema = z.discriminatedUnion('kind', [
  ExactTemporalSchema,
  ApproximateTemporalSchema,
  RelativeDateTemporalSchema,
  RelativeTimeTemporalSchema,
  EventRelativeTemporalSchema,
  TimeRangeTemporalSchema,
  UnknownTemporalSchema,
]);
export type TemporalExpression = z.infer<typeof TemporalExpressionSchema>;

/** A deadline couples the expression with its precision and decision state. */
export const DeadlineSchema = z.object({
  expression: TemporalExpressionSchema,
  precision: DeadlinePrecisionSchema,
  state: DecisionStateSchema,
});
export type Deadline = z.infer<typeof DeadlineSchema>;

// ---------------------------------------------------------------------------
// Effort: estimated work, or explicitly unknown. `minutes: null` + state
// 'unknown' is the ONLY legal representation of "I don't know how long".
// ---------------------------------------------------------------------------
export const EffortConfidenceSchema = z.enum(['stated', 'inferred', 'unknown']);
export type EffortConfidence = z.infer<typeof EffortConfidenceSchema>;

export const EffortEstimateSchema = z.object({
  minutes: z.number().int().min(0).max(30 * 24 * 60).nullable(),
  /** Phase 3 addition: upper bound when the user states a range ("4–6 hours"). Null when unstated. */
  maxMinutes: z.number().int().min(0).max(30 * 24 * 60).nullable().default(null),
  confidence: EffortConfidenceSchema,
  state: DecisionStateSchema,
  /** Phase 2 addition: qualitative hints ("small", "huge") kept as words, never converted to minutes. */
  note: z.string().max(200).default(''),
});
export type EffortEstimate = z.infer<typeof EffortEstimateSchema>;

// ---------------------------------------------------------------------------
// Constraints: hard ≠ soft ≠ preference ≠ unknown. The strength decides
// whether the engine may trade the constraint away — never the AI's mood.
// ---------------------------------------------------------------------------
export const ConstraintStrengthSchema = z.enum(['hard', 'soft', 'preference', 'unknown']);
export type ConstraintStrength = z.infer<typeof ConstraintStrengthSchema>;

export const ConstraintSchema = z.object({
  description: z.string().min(1).max(500),
  strength: ConstraintStrengthSchema,
  state: DecisionStateSchema,
});
export type DecisionConstraint = z.infer<typeof ConstraintSchema>;

// ---------------------------------------------------------------------------
// Human needs: protected parts of life (sleep, rest, meals, commitments).
// A need is never silently sacrificed; it is scheduled around or the
// trade-off is made explicit to the user.
// ---------------------------------------------------------------------------
export const HumanNeedKindSchema = z.enum([
  'sleep',
  'rest',
  'meals',
  'personal',
  'religious-community',
  'class',
  'work',
  'fixed-event',
  'other',
]);
export type HumanNeedKind = z.infer<typeof HumanNeedKindSchema>;

export const HumanNeedSchema = z.object({
  kind: HumanNeedKindSchema,
  description: z.string().max(300).default(''),
  /** Optional fixed window, e.g. sleep 00:00–06:00 as a TemporalExpression. */
  window: TemporalExpressionSchema.nullable().default(null),
  state: DecisionStateSchema,
});
export type HumanNeed = z.infer<typeof HumanNeedSchema>;

// ---------------------------------------------------------------------------
// Responsibilities: V1 fields plus the V2 decision fields. Category stays
// domain-neutral (student life, not any single profession).
// ---------------------------------------------------------------------------
export const ResponsibilityCategorySchema = z.enum([
  'academic',
  'fellowship',
  'business',
  'work',
  'personal',
  'rest',
  'community',
  'other',
]);
export type ResponsibilityCategory = z.infer<typeof ResponsibilityCategorySchema>;

export const ResponsibilityStatusSchema = z.enum(['not-started', 'in-progress', 'blocked', 'done', 'unknown']);
export type ResponsibilityStatus = z.infer<typeof ResponsibilityStatusSchema>;

export const ResponsibilityV2Schema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).default(''),
  category: ResponsibilityCategorySchema.default('other'),
  deadline: DeadlineSchema.nullable().default(null),
  effort: EffortEstimateSchema.nullable().default(null),
  consequence: z.string().max(1000).default(''),
  consequenceKnown: z.boolean().default(false),
  flexibility: z.enum(['fixed', 'flexible', 'unknown']).default('unknown'),
  delegation: z
    .object({
      possible: z.boolean(),
      agreed: z.boolean().default(false),
      savesMinutes: z.number().int().min(0).nullable().default(null),
      state: DecisionStateSchema,
    })
    .nullable()
    .default(null),
  dependsOn: z.array(z.string().max(200)).max(12).default([]),
  status: ResponsibilityStatusSchema.default('unknown'),
});
export type ResponsibilityV2 = z.infer<typeof ResponsibilityV2Schema>;

// ---------------------------------------------------------------------------
// Unknowns: tracked explicitly with why they matter and whether they block.
// Phase 2+ uses `blocking` to decide what to ask (only material questions).
// ---------------------------------------------------------------------------
export const UnknownSchema = z.object({
  field: z.string().min(1).max(200),
  whyItMatters: z.string().max(500).default(''),
  blocking: z.boolean().default(false),
});
export type Unknown = z.infer<typeof UnknownSchema>;

// ---------------------------------------------------------------------------
// DecisionContextV2: the full container Phase 2 fills and Phase 3+ consumes.
// `reference` pins the situation to a real moment + timezone (Phase 1
// temporal model); everything else starts empty/unknown by default.
// ---------------------------------------------------------------------------
export const TemporalReferenceSchema = z.object({
  /** ISO instant the situation is evaluated at (system clock, never the LLM). */
  nowIso: z.string().min(1).max(64),
  /** IANA timezone the user reasons in (e.g. "Africa/Lagos"). */
  timezone: z.string().min(1).max(64),
});
export type TemporalReference = z.infer<typeof TemporalReferenceSchema>;

export const DecisionContextV2Schema = z.object({
  reference: TemporalReferenceSchema,
  rawText: z.string().max(5000).default(''),
  responsibilities: z.array(ResponsibilityV2Schema).max(20).default([]),
  constraints: z.array(ConstraintSchema).max(20).default([]),
  humanNeeds: z.array(HumanNeedSchema).max(20).default([]),
  unknowns: z.array(UnknownSchema).max(20).default([]),
});
export type DecisionContextV2 = z.infer<typeof DecisionContextV2Schema>;

// ---------------------------------------------------------------------------
// ResolvedTemporal: the deterministic output of running a TemporalExpression
// through the Phase 1 resolver against a reference. Stored alongside the
// context so later phases never recompute (or re-guess) time.
// ---------------------------------------------------------------------------
export const ResolvedTemporalSchema = z.union([
  z.object({ kind: z.literal('instant'), instantIso: z.string() }),
  z.object({ kind: z.literal('window'), startIso: z.string(), endIso: z.string() }),
  z.object({
    kind: z.literal('needs-clarification'),
    question: z.string(),
    candidates: z.array(z.object({ label: z.string(), startIso: z.string(), endIso: z.string() })),
  }),
  z.object({ kind: z.literal('unresolved'), reason: z.string() }),
]);
export type ResolvedTemporal = z.infer<typeof ResolvedTemporalSchema>;
