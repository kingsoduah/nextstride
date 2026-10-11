import { describe, expect, it } from 'vitest';
import {
  addDaysYmd,
  createReference,
  DEFAULT_TIMEZONE,
  minutesBetween,
  resolveClockTime,
  resolveDayExpression,
  resolveDayPeriod,
  resolveTemporalExpression,
  systemNowIso,
  tzOffsetMs,
  zonedLocalToUtc,
  zonedParts,
} from './temporal';

const LAGOS = 'Africa/Lagos';
// Anchor week: Mon 2026-10-05 .. Sun 2026-10-11 (verified weekdays).
const TUE_6PM = '2026-10-06T18:00:00+01:00';
const refTue6pm = () => createReference({ nowIso: TUE_6PM, timezone: LAGOS });

describe('createReference', () => {
  it('defaults to system clock + documented default timezone', () => {
    const before = Date.now();
    const ref = createReference();
    expect(ref.timezone).toBe(DEFAULT_TIMEZONE);
    expect(new Date(ref.nowIso).getTime()).toBeGreaterThanOrEqual(before);
    expect(systemNowIso()).toMatch(/Z$/);
  });

  it('accepts explicit benchmark-style overrides', () => {
    const ref = createReference({ nowIso: TUE_6PM, timezone: LAGOS });
    expect(ref.nowIso).toBe('2026-10-06T17:00:00.000Z');
    expect(ref.timezone).toBe(LAGOS);
  });

  it('rejects invalid timezones and timestamps (never silently)', () => {
    expect(() => createReference({ timezone: 'Lagos/Nigeria' })).toThrow(/Invalid IANA timezone/);
    expect(() => createReference({ nowIso: 'tomorrow-ish' })).toThrow(/Invalid nowIso/);
  });
});

describe('zoned calendar math', () => {
  it('reads Lagos wall-clock parts (+1, no DST)', () => {
    const parts = zonedParts(new Date('2026-10-06T17:00:00.000Z'), LAGOS);
    expect(parts).toMatchObject({ year: 2026, month: 10, day: 6, hour: 18, minute: 0, weekday: 2 });
  });

  it('round-trips local → UTC → local, including a DST zone', () => {
    for (const tz of [LAGOS, 'UTC', 'America/New_York']) {
      // July date exercises DST in New York.
      const back = zonedParts(zonedLocalToUtc(2026, 7, 4, 15, 30, tz), tz);
      expect(back).toMatchObject({ year: 2026, month: 7, day: 4, hour: 15, minute: 30 });
    }
  });

  it('reports the Lagos offset as +60 minutes', () => {
    expect(tzOffsetMs(LAGOS, new Date('2026-10-06T17:00:00.000Z'))).toBe(3600000);
  });

  it('adds days across month boundaries', () => {
    expect(addDaysYmd({ year: 2026, month: 10, day: 31 }, 1)).toEqual({ year: 2026, month: 11, day: 1 });
  });

  it('measures minutes between instants', () => {
    expect(minutesBetween('2026-10-06T17:00:00.000Z', '2026-10-07T06:00:00.000Z')).toBe(780);
  });
});

describe('resolveDayExpression', () => {
  it('resolves today/tomorrow/digit and word day-counts', () => {
    const ref = refTue6pm();
    expect(resolveDayExpression('today', ref)).toEqual({ status: 'resolved', ymd: { year: 2026, month: 10, day: 6 } });
    expect(resolveDayExpression('tomorrow', ref)).toEqual({ status: 'resolved', ymd: { year: 2026, month: 10, day: 7 } });
    expect(resolveDayExpression('in 2 days', ref)).toEqual({ status: 'resolved', ymd: { year: 2026, month: 10, day: 8 } });
    expect(resolveDayExpression('in three days', ref)).toEqual({ status: 'resolved', ymd: { year: 2026, month: 10, day: 9 } });
  });

  it('resolves weekday names to the nearest such day on or after today', () => {
    const ref = refTue6pm();
    expect(resolveDayExpression('friday', ref)).toEqual({ status: 'resolved', ymd: { year: 2026, month: 10, day: 9 } });
    // Said on Friday, "Friday" means today — not next week.
    const fri = createReference({ nowIso: '2026-10-09T16:00:00+01:00', timezone: LAGOS });
    expect(resolveDayExpression('friday', fri)).toEqual({ status: 'resolved', ymd: { year: 2026, month: 10, day: 9 } });
  });

  it('resolves week ranges, leaves the rest unresolved (honest, not invented)', () => {
    const ref = refTue6pm();
    expect(resolveDayExpression('this-week', ref)).toEqual({
      status: 'range',
      start: { year: 2026, month: 10, day: 5 },
      end: { year: 2026, month: 10, day: 11 },
    });
    expect(resolveDayExpression('weekend', ref)).toEqual({
      status: 'range',
      start: { year: 2026, month: 10, day: 10 },
      end: { year: 2026, month: 10, day: 11 },
    });
    expect(resolveDayExpression('sometime', ref).status).toBe('unresolved');
  });
});

describe('resolveClockTime — precision is never invented', () => {
  const ymd = { year: 2026, month: 10, day: 7 };

  it('"at 7 AM" is an exact instant', () => {
    expect(resolveClockTime({ hour: 7, meridiem: 'am' }, ymd, LAGOS)).toEqual({
      status: 'instant',
      instantIso: '2026-10-07T06:00:00.000Z',
    });
  });

  it('"around 7 AM" is a window, not an instant', () => {
    expect(resolveClockTime({ hour: 7, meridiem: 'am', toleranceMinutes: 30 }, ymd, LAGOS)).toEqual({
      status: 'window',
      startIso: '2026-10-07T05:30:00.000Z',
      endIso: '2026-10-07T06:30:00.000Z',
    });
  });

  it('bare "7" asks instead of guessing AM vs PM', () => {
    const r = resolveClockTime({ hour: 7, toleranceMinutes: 30 }, ymd, LAGOS);
    expect(r.status).toBe('needs-clarification');
    if (r.status === 'needs-clarification') {
      expect(r.candidates.map((c) => c.label)).toEqual(['7 AM', '7 PM']);
      // Candidates preserve the ±30 min approximation on both sides.
      expect(r.candidates[0]).toMatchObject({ startIso: '2026-10-07T05:30:00.000Z', endIso: '2026-10-07T06:30:00.000Z' });
      expect(r.candidates[1]).toMatchObject({ startIso: '2026-10-07T17:30:00.000Z', endIso: '2026-10-07T18:30:00.000Z' });
    }
  });
});

describe('resolveDayPeriod', () => {
  it('maps morning to 06:00–12:00 zoned', () => {
    expect(resolveDayPeriod('morning', { year: 2026, month: 10, day: 6 }, LAGOS)).toEqual({
      startIso: '2026-10-06T05:00:00.000Z',
      endIso: '2026-10-06T11:00:00.000Z',
    });
  });

  it('lets night cross midnight', () => {
    expect(resolveDayPeriod('night', { year: 2026, month: 10, day: 6 }, LAGOS)).toEqual({
      startIso: '2026-10-06T21:00:00.000Z',
      endIso: '2026-10-07T05:00:00.000Z',
    });
  });

  it('returns null for unknown periods instead of inventing', () => {
    expect(resolveDayPeriod('brunch o’clock', { year: 2026, month: 10, day: 6 }, LAGOS)).toBeNull();
  });
});

describe('resolveTemporalExpression dispatch', () => {
  it('passes exact instants through and marks unknowns honestly', () => {
    const ref = refTue6pm();
    expect(resolveTemporalExpression({ kind: 'exact', instantIso: '2026-10-07T06:00:00.000Z' }, ref)).toEqual({
      kind: 'instant',
      instantIso: '2026-10-07T06:00:00.000Z',
    });
    expect(resolveTemporalExpression({ kind: 'unknown', raw: '' }, ref).kind).toBe('unresolved');
    expect(
      resolveTemporalExpression({ kind: 'event-relative', anchorEvent: 'class', relation: 'after', raw: 'after class' }, ref)
        .kind,
    ).toBe('unresolved');
  });

  it('resolves relative dates to full-day windows in-zone', () => {
    const r = resolveTemporalExpression({ kind: 'relative-date', expression: 'tomorrow', raw: 'tomorrow' }, refTue6pm());
    expect(r).toEqual({
      kind: 'window',
      startIso: '2026-10-06T23:00:00.000Z', // Wed 00:00+01:00
      endIso: '2026-10-07T22:59:00.000Z', // Wed 23:59+01:00
    });
  });
});

describe('benchmark arithmetic fixtures (deterministic ground truth)', () => {
  const at = (iso: string) => createReference({ nowIso: iso, timezone: LAGOS });

  it('S1: 6PM→7AM gives 13h remaining; windows total 7h; 6h work leaves 1h buffer', () => {
    const ref = at(TUE_6PM);
    expect(minutesBetween(ref.nowIso, '2026-10-07T06:00:00.000Z')).toBe(780);
    const evening = minutesBetween('2026-10-06T17:00:00.000Z', '2026-10-06T23:00:00.000Z');
    const morning = minutesBetween('2026-10-07T05:00:00.000Z', '2026-10-07T06:00:00.000Z');
    expect(evening + morning).toBe(420);
    expect(evening + morning - 360).toBe(60);
  });

  it('S2: 8PM start gives only 5h against 8h of work', () => {
    const evening = minutesBetween('2026-10-07T19:00:00.000Z', '2026-10-07T23:00:00.000Z');
    const morning = minutesBetween('2026-10-08T05:00:00.000Z', '2026-10-08T06:00:00.000Z');
    expect(evening + morning).toBe(300);
    expect(480 - (evening + morning)).toBe(180); // 3h gap
  });

  it('S9: 9PM start gives 7h against 6h of work (1h buffer, sleep intact)', () => {
    const evening = minutesBetween('2026-10-06T20:00:00.000Z', '2026-10-06T23:00:00.000Z');
    const morning = minutesBetween('2026-10-07T05:00:00.000Z', '2026-10-07T09:00:00.000Z');
    expect(evening + morning).toBe(420);
    expect(evening + morning - 360).toBe(60);
  });

  it('S15: at 9:30PM only 3.5h remain against 5h of work', () => {
    const evening = minutesBetween('2026-10-05T20:30:00.000Z', '2026-10-05T23:00:00.000Z');
    const morning = minutesBetween('2026-10-06T05:00:00.000Z', '2026-10-06T06:00:00.000Z');
    expect(evening + morning).toBe(210);
    expect(300 - (evening + morning)).toBe(90); // 1.5h shortfall
  });

  it('S16: identical situation, different clock → materially different time remaining', () => {
    const deadline = '2026-10-07T08:00:00+01:00';
    const remainingA = minutesBetween(at('2026-10-06T14:00:00+01:00').nowIso, deadline);
    const remainingB = minutesBetween(at('2026-10-06T23:00:00+01:00').nowIso, deadline);
    expect(remainingA).toBe(1080); // 18h
    expect(remainingB).toBe(540); // 9h
    expect(remainingA - remainingB).toBe(540);
  });
});
