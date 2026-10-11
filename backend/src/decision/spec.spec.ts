import { describe, expect, it } from 'vitest';
import {
  DecisionContextV2Schema,
  DeadlineSchema,
  EffortEstimateSchema,
  ResponsibilityV2Schema,
  TemporalExpressionSchema,
  UnknownSchema,
} from './spec';

describe('decision spec contracts', () => {
  it('accepts every temporal expression kind without collapsing precision', () => {
    const kinds = [
      { kind: 'exact', instantIso: '2026-10-07T06:00:00.000Z' },
      { kind: 'approximate', centreIso: '2026-10-07T06:00:00.000Z', toleranceMinutes: 30, raw: 'around 7' },
      { kind: 'relative-date', expression: 'tomorrow', raw: 'tomorrow' },
      { kind: 'relative-time', expression: 'morning', meridiem: null, raw: 'morning' },
      { kind: 'event-relative', anchorEvent: 'class', relation: 'after', raw: 'after class' },
      { kind: 'unknown', raw: '' },
    ] as const;
    for (const k of kinds) {
      const parsed = TemporalExpressionSchema.safeParse(k);
      expect(parsed.success, JSON.stringify(k)).toBe(true);
    }
  });

  it('represents unknown effort as null + unknown state (never fabricated)', () => {
    const parsed = EffortEstimateSchema.safeParse({ minutes: null, confidence: 'unknown', state: 'unknown' });
    expect(parsed.success).toBe(true);
  });

  it('rejects invented-precision shapes (approximate without tolerance)', () => {
    const parsed = TemporalExpressionSchema.safeParse({
      kind: 'approximate',
      centreIso: '2026-10-07T06:00:00.000Z',
      raw: 'around 7',
    });
    expect(parsed.success).toBe(false);
  });

  it('defaults a fresh responsibility to unknown-heavy, domain-neutral shape', () => {
    const parsed = ResponsibilityV2Schema.safeParse({ title: 'Church ushering rota' });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toMatchObject({
        category: 'other',
        deadline: null,
        effort: null,
        consequenceKnown: false,
        flexibility: 'unknown',
        delegation: null,
        dependsOn: [],
        status: 'unknown',
      });
    }
  });

  it('tracks unknowns with blocking flags for Phase 2 question selection', () => {
    const parsed = UnknownSchema.safeParse({ field: 'fellowship deadline', whyItMatters: 'changes weekly plan', blocking: true });
    expect(parsed.success).toBe(true);
  });

  it('builds an empty-but-valid decision context container', () => {
    const parsed = DecisionContextV2Schema.safeParse({
      reference: { nowIso: '2026-10-06T17:00:00.000Z', timezone: 'Africa/Lagos' },
      rawText: 'I feel overwhelmed.',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.responsibilities).toEqual([]);
      expect(parsed.data.unknowns).toEqual([]);
    }
  });

  it('keeps deadline precision and state coupled on every deadline', () => {
    const parsed = DeadlineSchema.safeParse({
      expression: { kind: 'relative-time', expression: 'around-7', meridiem: null, raw: 'around 7' },
      precision: 'approximate',
      state: 'needs-clarification',
    });
    expect(parsed.success).toBe(true);
  });
});
