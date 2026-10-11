import { describe, expect, it } from 'vitest';
import { buildTemporal, buildTimeRange, namedMeridiem } from './expression-builder';
import { sanitizeCategory, sanitizeNeedKind, sanitizeStatus } from './extraction';
import { createReference } from '../temporal/temporal';

// Lagos anchor week: Mon 2026-10-05 .. Sun 2026-10-11.
const refTue6pm = () => createReference({ nowIso: '2026-10-06T18:00:00+01:00', timezone: 'Africa/Lagos' });

describe('buildTemporal', () => {
  it('1. exact deadline: "tomorrow at 7 AM" → exact instant', () => {
    const { expression, resolved } = buildTemporal(
      { dayText: 'tomorrow', timeText: '7 AM', precision: 'exact', raw: 'tomorrow at 7 AM' },
      refTue6pm(),
    );
    expect(expression.kind).toBe('exact');
    expect(resolved).toEqual({ kind: 'instant', instantIso: '2026-10-07T06:00:00.000Z' });
  });

  it('2. approximate deadline without meridiem: "tomorrow around 7" asks, never guesses', () => {
    const { expression, resolved } = buildTemporal(
      { dayText: 'tomorrow', timeText: 'around 7', precision: 'approximate', raw: 'tomorrow around 7' },
      refTue6pm(),
    );
    // Date known, AM/PM unknowable → relative-time + needs-clarification.
    // The "around" is preserved in raw; answering re-runs the builder into a window.
    expect(expression.kind).toBe('relative-time');
    expect(resolved.kind).toBe('needs-clarification');
  });

  it('2b. approximate with meridiem: "tomorrow around 7 AM" → ±30 min window', () => {
    const { expression, resolved } = buildTemporal(
      { dayText: 'tomorrow', timeText: 'around 7 AM', precision: 'approximate', raw: 'tomorrow around 7 AM' },
      refTue6pm(),
    );
    expect(expression.kind).toBe('approximate');
    expect(resolved).toEqual({
      kind: 'window',
      startIso: '2026-10-07T05:30:00.000Z',
      endIso: '2026-10-07T06:30:00.000Z',
    });
  });

  it('3. bare ambiguous "7" → needs-clarification, both candidates', () => {
    const { expression, resolved } = buildTemporal({ timeText: '7', raw: 'around 7' }, refTue6pm());
    expect(expression.kind).toBe('relative-time');
    expect(resolved.kind).toBe('needs-clarification');
    if (resolved.kind === 'needs-clarification') {
      expect(resolved.candidates.map((c) => c.label)).toEqual(['7 AM', '7 PM']);
    }
  });

  it('4. relative date "tomorrow" alone → full-day window', () => {
    const { expression, resolved } = buildTemporal({ dayText: 'tomorrow', raw: 'tomorrow' }, refTue6pm());
    expect(expression.kind).toBe('relative-date');
    expect(resolved).toEqual({
      kind: 'window',
      startIso: '2026-10-06T23:00:00.000Z',
      endIso: '2026-10-07T22:59:00.000Z',
    });
  });

  it('4b. "Friday" resolves on-or-after; "in three days" works', () => {
    const fri = buildTemporal({ dayText: 'Friday', raw: 'Friday' }, refTue6pm());
    expect(fri.resolved).toMatchObject({ kind: 'window', startIso: '2026-10-08T23:00:00.000Z' });
    const three = buildTemporal({ dayText: 'in three days', raw: 'in three days' }, refTue6pm());
    expect(three.resolved).toMatchObject({ kind: 'window', startIso: '2026-10-08T23:00:00.000Z' });
  });

  it('empty temporal text stays unknown (never invented)', () => {
    const { expression, resolved } = buildTemporal({}, refTue6pm());
    expect(expression.kind).toBe('unknown');
    expect(resolved.kind).toBe('unresolved');
  });

  it('exact label with approx markers downgrades to approximate (deterministic wins)', () => {
    const { expression } = buildTemporal(
      { dayText: 'tomorrow', timeText: '7 AM', precision: 'exact', raw: 'tomorrow around 7 AM' },
      refTue6pm(),
    );
    expect(expression.kind).toBe('approximate');
  });

  it('"morning" maps to the 06:00–12:00 zoned window', () => {
    const { resolved } = buildTemporal({ timeText: 'morning', raw: 'tomorrow morning', dayText: 'tomorrow' }, refTue6pm());
    expect(resolved).toEqual({
      kind: 'window',
      startIso: '2026-10-07T05:00:00.000Z',
      endIso: '2026-10-07T11:00:00.000Z',
    });
  });

  it('"after class" stays event-relative and unresolved', () => {
    const { expression, resolved } = buildTemporal({ timeText: 'after class', raw: 'after class' }, refTue6pm());
    // No clock/period/day recognized → honest unknown, raw preserved.
    expect(expression.kind).toBe('unknown');
    expect(resolved.kind).toBe('unresolved');
  });
});

describe('named midnight/noon (definitional, not inference)', () => {
  it('midnight is 12 AM, midday/noon is 12 PM — hour 12 only', () => {
    expect(namedMeridiem(12, 'midnight to 6 AM')).toBe('am');
    expect(namedMeridiem(12, 'until MidNight')).toBe('am');
    expect(namedMeridiem(12, 'by noon')).toBe('pm');
    expect(namedMeridiem(12, 'at midday')).toBe('pm');
    expect(namedMeridiem(7, 'around 7 at midnight-ish')).toBeNull();
    expect(namedMeridiem(12, 'at 12')).toBeNull();
  });

  it('"midnight to 6 AM" resolves to a real window without asking', () => {
    const ref = refTue6pm();
    const { expression, resolved } = buildTimeRange(
      { hour: 12, minute: 0, meridiem: null },
      { hour: 6, minute: 0, meridiem: 'am' },
      '',
      'midnight to 6 AM',
      ref,
    );
    expect(expression.kind).toBe('time-range');
    if (expression.kind === 'time-range') {
      expect(expression.startClock.meridiem).toBe('am');
    }
    expect(resolved.kind).toBe('window');
    if (resolved.kind === 'window') {
      // Tue 00:00+01:00 → Mon 23:00Z ; Tue 06:00+01:00 → Tue 05:00Z
      expect(resolved.startIso).toBe('2026-10-05T23:00:00.000Z');
      expect(resolved.endIso).toBe('2026-10-06T05:00:00.000Z');
    }
  });

  it('"tomorrow at midnight" via buildTemporal resolves to 00:00, not a question', () => {
    const { resolved } = buildTemporal(
      { dayText: 'tomorrow', timeText: 'midnight', precision: 'exact', raw: 'tomorrow at midnight' },
      refTue6pm(),
    );
    expect(resolved).toEqual({ kind: 'instant', instantIso: '2026-10-06T23:00:00.000Z' });
  });

  it('bare "7" still asks (no guessing beyond midnight/noon)', () => {
    const { resolved } = buildTemporal({ timeText: '7', raw: '7' }, refTue6pm());
    expect(resolved.kind).toBe('needs-clarification');
  });
});

describe('sanitizers (domain-neutral, safe defaults)', () => {
  it('maps everyday student-life categories, unknown → other', () => {
    expect(sanitizeCategory('church picnic')).toBe('other');
    expect(sanitizeCategory('church')).toBe('community');
    expect(sanitizeCategory('fellowship')).toBe('fellowship');
    expect(sanitizeCategory('quantum knitting')).toBe('other');
    expect(sanitizeCategory('')).toBe('other');
  });

  it('maps status phrases, unknown → unknown', () => {
    expect(sanitizeStatus("haven't started")).toBe('not-started');
    expect(sanitizeStatus('working on it')).toBe('in-progress');
    expect(sanitizeStatus('blocked by TA')).toBe('blocked');
    expect(sanitizeStatus('')).toBe('unknown');
    expect(sanitizeStatus('eventually')).toBe('unknown');
  });

  it('detects sleep/need kinds from kind or description', () => {
    expect(sanitizeNeedKind('', 'I need to sleep')).toBe('sleep');
    expect(sanitizeNeedKind('rest', '')).toBe('rest');
    expect(sanitizeNeedKind('', 'church service')).toBe('religious-community');
    expect(sanitizeNeedKind('mystery', 'vibes')).toBe('other');
  });
});
