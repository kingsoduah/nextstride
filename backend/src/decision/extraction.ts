import { z } from 'zod';
import type { ResponsibilityCategory, ResponsibilityStatus } from './spec';
import { ResponsibilityCategorySchema, ResponsibilityStatusSchema } from './spec';

/**
 * Phase 2: what the LLM is allowed to return. Deliberately loose —
 * verbatim quotes plus labels. The parser service promotes this into the
 * strict Phase 1 spec; anything unrecognized degrades to unknown/other,
 * never to an invented fact.
 */

const coerceMeridiem = (v: unknown): 'am' | 'pm' | null => {
  if (typeof v !== 'string') return v == null ? null : null;
  const t = v.trim().toLowerCase();
  if (t === 'am' || t === 'a.m.') return 'am';
  if (t === 'pm' || t === 'p.m.') return 'pm';
  return null;
};

const PRECISION_ALIASES: Record<string, 'exact' | 'approximate' | 'relative' | 'unknown'> = {
  exact: 'exact',
  approximate: 'approximate',
  approx: 'approximate',
  relative: 'relative',
  unknown: 'unknown',
};

const FLEXIBILITY_ALIASES: Record<string, 'fixed' | 'flexible'> = {
  fixed: 'fixed',
  low: 'fixed',
  inflexible: 'fixed',
  rigid: 'fixed',
  flexible: 'flexible',
  high: 'flexible',
  negotiable: 'flexible',
  movable: 'flexible',
};

const STRENGTH_ALIASES: Record<string, 'hard' | 'soft' | 'preference'> = {
  hard: 'hard',
  high: 'hard',
  must: 'hard',
  required: 'hard',
  nonnegotiable: 'hard',
  soft: 'soft',
  low: 'soft',
  preference: 'preference',
  prefer: 'preference',
  optional: 'preference',
};

/** Parse "10:00 PM"-style clock strings into clock objects; unparseable → null. */
export function parseClockText(raw: unknown): { hour: number; minute: number; meridiem: 'am' | 'pm' | null } | null {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw as { hour: number; minute: number; meridiem: 'am' | 'pm' | null };
  if (typeof raw !== 'string') return null;
  const m = raw.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?/i);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  if (hour < 1 || hour > 12 || minute > 59) return null;
  return { hour, minute, meridiem: coerceMeridiem(m[3] ?? null) };
}

const clockSchema = z
  .object({
    hour: z.number().int().min(1).max(12),
    minute: z.number().int().min(0).max(59).default(0),
    meridiem: z.preprocess(coerceMeridiem, z.enum(['am', 'pm']).nullable().default(null)),
  })
  .nullable()
  .default(null);

const coerceMinutes = (v: unknown): number | null => {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? Math.round(v) : null;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) {
    const n = Math.round(Number(v));
    return n > 0 ? n : null;
  }
  return null;
};

/** Optional free-text fields: explicit JSON null degrades to "" (never fails). */
const str = (max: number) =>
  z.preprocess((v) => (typeof v === 'string' ? v : ''), z.string().max(max).default(''));

export const DraftResponsibilitySchema = z.object({
  title: z.string().min(1).max(200),
  description: str(2000),
  /** Verbatim temporal phrases; empty string when the user gave none. */
  dayText: str(120),
  timeText: str(120),
  precision: z.preprocess(
    (v) => (typeof v === 'string' ? (PRECISION_ALIASES[v.trim().toLowerCase()] ?? 'unknown') : 'unknown'),
    z.enum(['exact', 'approximate', 'relative', 'unknown']).default('unknown'),
  ),
  meridiem: z.preprocess(coerceMeridiem, z.enum(['am', 'pm']).nullable().default(null)),
  /** Minutes of effort ONLY if the user stated a number; else null. */
  effortMinutes: z.preprocess(coerceMinutes, z.number().int().min(1).max(30 * 24 * 60).nullable().default(null)),
  effortStated: z.preprocess((v) => v === true, z.boolean().default(false)),
  effortNote: str(200),
  category: str(64),
  consequence: str(1000),
  flexibility: z.preprocess(
    (v) => (typeof v === 'string' ? (FLEXIBILITY_ALIASES[v.trim().toLowerCase()] ?? null) : (v ?? null)),
    z.enum(['fixed', 'flexible']).nullable().default(null),
  ),
  delegationPossible: z.preprocess(
    (v) => (typeof v === 'boolean' ? v : null),
    z.boolean().nullable().default(null),
  ),
  delegationAgreed: z.preprocess((v) => v === true, z.boolean().default(false)),
  delegationSavesMinutes: z.preprocess(coerceMinutes, z.number().int().min(1).nullable().default(null)),
  dependsOnText: str(500),
  statusText: str(64),
});

export const DraftHumanNeedSchema = z.object({
  kind: str(64),
  description: str(300),
  /** Verbatim window phrase, e.g. "midnight to 6". Empty when unstated. */
  windowText: str(200),
  startClock: z.preprocess((v) => parseClockText(v), clockSchema),
  endClock: z.preprocess((v) => parseClockText(v), clockSchema),
});

export const DraftConstraintSchema = z.object({
  description: z.string().min(1).max(500),
  strength: z.preprocess(
    (v) => (typeof v === 'string' ? (STRENGTH_ALIASES[v.trim().toLowerCase()] ?? null) : (v ?? null)),
    z.enum(['hard', 'soft', 'preference']).nullable().default(null),
  ),
});

export const ExtractionDraftSchema = z.object({
  responsibilities: z.array(DraftResponsibilitySchema).max(20).default([]),
  humanNeeds: z.array(DraftHumanNeedSchema).max(20).default([]),
  constraints: z.array(DraftConstraintSchema).max(20).default([]),
});
export type ExtractionDraft = z.infer<typeof ExtractionDraftSchema>;
export type DraftResponsibility = z.infer<typeof DraftResponsibilitySchema>;

// ---------------------------------------------------------------------------
// Sanitizers: coerce free LLM text into spec enums. Unknown → safe default.
// ---------------------------------------------------------------------------

const CATEGORY_ALIASES: Record<string, ResponsibilityCategory> = {
  academic: 'academic',
  school: 'academic',
  study: 'academic',
  exam: 'academic',
  assignment: 'academic',
  fellowship: 'fellowship',
  church: 'community',
  community: 'community',
  business: 'business',
  client: 'business',
  customer: 'business',
  work: 'work',
  job: 'work',
  internship: 'work',
  shift: 'work',
  personal: 'personal',
  family: 'personal',
  relationship: 'personal',
  errand: 'personal',
  errands: 'personal',
  creative: 'personal',
  rest: 'rest',
  sleep: 'rest',
  health: 'rest',
  other: 'other',
};

export function sanitizeCategory(raw: string): ResponsibilityCategory {
  const key = raw.trim().toLowerCase();
  if ((ResponsibilityCategorySchema.options as readonly string[]).includes(key)) {
    return key as ResponsibilityCategory;
  }
  return CATEGORY_ALIASES[key] ?? 'other';
}

export function sanitizeStatus(raw: string): ResponsibilityStatus {
  const t = raw.trim().toLowerCase();
  if (t.includes('not start') || t.includes("haven't started") || t.includes('havent started') || t === 'todo') return 'not-started';
  if (t.includes('in progress') || t.includes('started') || t.includes('working on')) return 'in-progress';
  if (t.includes('block')) return 'blocked';
  if (t.includes('done') || t.includes('finish') || t.includes('complet')) return 'done';
  const parsed = ResponsibilityStatusSchema.safeParse(t);
  return parsed.success ? parsed.data : 'unknown';
}

const NEED_ALIASES: Record<string, 'sleep' | 'rest' | 'meals' | 'personal' | 'religious-community' | 'class' | 'work' | 'fixed-event' | 'other'> = {
  sleep: 'sleep',
  rest: 'rest',
  break: 'rest',
  meal: 'meals',
  meals: 'meals',
  food: 'meals',
  eat: 'meals',
  personal: 'personal',
  church: 'religious-community',
  fellowship: 'religious-community',
  religious: 'religious-community',
  community: 'religious-community',
  class: 'class',
  lecture: 'class',
  work: 'work',
  job: 'work',
  shift: 'work',
  meeting: 'fixed-event',
  appointment: 'fixed-event',
  event: 'fixed-event',
  other: 'other',
};

export function sanitizeNeedKind(raw: string, description: string): 'sleep' | 'rest' | 'meals' | 'personal' | 'religious-community' | 'class' | 'work' | 'fixed-event' | 'other' {
  const key = raw.trim().toLowerCase();
  if (NEED_ALIASES[key]) return NEED_ALIASES[key];
  const hay = `${key} ${description.toLowerCase()}`;
  if (hay.includes('sleep')) return 'sleep';
  if (hay.includes('eat') || hay.includes('meal') || hay.includes('food') || hay.includes('lunch') || hay.includes('dinner') || hay.includes('breakfast')) return 'meals';
  if (hay.includes('church') || hay.includes('fellowship') || hay.includes('mosque') || hay.includes('service')) return 'religious-community';
  if (hay.includes('class') || hay.includes('lecture')) return 'class';
  if (hay.includes('rest')) return 'rest';
  return 'other';
}
